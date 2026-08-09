from flask import Blueprint, request, jsonify, send_file
import os
import base64
from auth import require_admin
from services.db_service import DatabaseService
from services.printer_service import PrinterService
from config import config
from error_handler import safe_route, ValidationError, NotFoundError
from validators import BillCreateSchema, BillUpdateSchema, MarshmallowValidationError
from utils.product_variations import resolve_bill_line_item
import cache as local_cache
from caching import cache
import logging
from limiter import limiter
from models import db as orm_db, Bill
from sqlalchemy import func
from datetime import date

logger = logging.getLogger(__name__)

billing_bp = Blueprint("billing", __name__, url_prefix="/api/bill")
db = DatabaseService()
printer_service = PrinterService()

# Reusable schema instances
_bill_create_schema = BillCreateSchema()
_bill_update_schema = BillUpdateSchema()


def _validate_bill_products(products: list, order_type: str = "dine-in") -> tuple[list, float]:
    """Validate bill line items and resolve variation pricing."""
    validated_products = []
    total = 0.0

    for product_data in products:
        product_id = product_data["product_id"]
        product_found = db.get_product(product_id)

        if not product_found:
            raise NotFoundError(f"Product with ID {product_id} not found", code="PRODUCT_NOT_FOUND")

        if not product_found.get("active", False):
            raise ValidationError(
                f'Product "{product_found.get("name", product_id)}" is inactive and cannot be billed',
                code="PRODUCT_INACTIVE",
            )

        try:
            line_item = resolve_bill_line_item(product_found, product_data, order_type)
        except ValueError as exc:
            raise ValidationError(str(exc), code="VARIATION_REQUIRED")

        line_total = line_item["price"] * line_item["quantity"]
        validated_products.append(line_item)
        total += line_total

    return validated_products, total


def _build_printer_payload(bill: dict) -> dict:
    """Normalize DB bill shape to printer service shape."""
    created_at = str(bill.get("created_at", ""))
    created_parts = created_at.split(" ", 1)
    bill_date = created_parts[0] if created_parts else ""
    bill_time = created_parts[1] if len(created_parts) > 1 else ""
    products = bill.get("products") or bill.get("items") or []

    return {
        "bill_no": bill.get("bill_no"),
        "kot_no": bill.get("kot_no") or bill.get("custom_kot_no", ""),
        "date": bill_date,
        "time": bill_time,
        "products": products,
        "total": (
            bill.get("total") if bill.get("total") is not None else bill.get("total_amount", 0)
        ),
        "customer_name": bill.get("customer_name", ""),
        "customer_mobile": bill.get("customer_mobile", "") or bill.get("customer_phone", ""),
        "payment_method": bill.get("payment_method", "CASH"),
        "today_token": bill.get("today_token", 0),
        "order_type": bill.get("order_type", "dine-in"),
        "table_no": bill.get("table_no", ""),
    }


@billing_bp.route("/create", methods=["POST"])
@limiter.limit("60 per minute")
@safe_route
def create_bill():
    """Create a new bill with validated products and optional printing."""
    data = request.get_json()

    # Validate payload via schema
    try:
        validated = _bill_create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(f"Invalid bill data: {e.messages}", code="BILL_VALIDATION_FAILED")

    products = validated["products"]
    order_type = validated.get("order_type", "dine-in")

    validated_products, total = _validate_bill_products(products, order_type)

    # Create bill in database (ACID — db_service handles transaction)
    bill_data = {
        "customer_name": validated.get("customer_name", ""),
        "customer_mobile": validated.get("customer_mobile", "")
        or validated.get("customer_phone", ""),
        "total_amount": total,
        "items": validated_products,
        "payment_method": validated.get("payment_method", "CASH"),
        "order_type": validated.get("order_type", "dine-in"),
        "table_no": validated.get("table_no", ""),
    }

    bill_no = db.create_bill(bill_data)

    if not bill_no:
        raise Exception("Failed to create bill in database")

    # Get the created bill for response
    created_bill = db.get_bill(bill_no)

    # Prepare bill data for response and printing
    bill_response = {
        "bill_no": bill_no,
        "date": created_bill["created_at"].split(" ")[0],
        "time": created_bill["created_at"].split(" ")[1],
        "products": validated_products,
        "total": total,
        "customer_name": created_bill.get("customer_name", ""),
        "customer_mobile": created_bill.get("customer_mobile", "")
        or created_bill.get("customer_phone", ""),
        "payment_method": created_bill.get("payment_method", "CASH"),
        "today_token": created_bill.get("today_token", 0),
        "order_type": created_bill.get("order_type", "dine-in"),
        "table_no": created_bill.get("table_no", ""),
    }

    # Print bill only if requested (non-blocking — don't fail if printer doesn't work)
    if validated.get("print", False):
        try:
            result = printer_service.print_bill(bill_response)
            if not result.get("success"):
                logger.warning(f"Printer error (non-critical): {result.get('error')}")
        except Exception as e:
            logger.warning(f"Printer error (non-critical): {e}")

    # Invalidate product caches (stock levels changed)
    local_cache.invalidate("products")
    local_cache.invalidate("products_with_stock")
    cache.clear()  # Invalidate Flask-Caching for summary endpoints

    # Update pre-aggregated daily summary (async-safe, non-blocking)
    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception as agg_err:
        logger.warning(f"Aggregation update warning: {agg_err}")

    logger.info(f"Bill #{bill_no} created — Total: {total:.2f} ({len(validated_products)} items)")

    return (
        jsonify(
            {
                "success": True,
                "message": "Bill created successfully",
                "bill": bill_response,
            }
        ),
        201,
    )


@billing_bp.route("/<int:bill_no>", methods=["GET"])
@safe_route
def get_bill(bill_no):
    """Get a specific bill by number."""
    bill = db.get_bill(bill_no)

    if not bill:
        raise NotFoundError(f"Bill with number {bill_no} not found", code="BILL_NOT_FOUND")

    return jsonify({"success": True, "bill": bill}), 200


@billing_bp.route("/today", methods=["GET"])
@safe_route
def get_today_bills():
    """Get all bills for today (supports pagination)."""
    page = request.args.get("page", type=int)
    per_page = request.args.get("per_page", 20, type=int)

    # Apply pagination at DB level if requested
    if page is not None:
        start = (page - 1) * per_page

        paginated_bills = db.get_todays_bills(limit=per_page, offset=start)
        total = db.get_todays_bills_count()
        end = start + per_page

        return (
            jsonify(
                {
                    "success": True,
                    "bills": paginated_bills,
                    "pagination": {
                        "page": page,
                        "per_page": per_page,
                        "total": total,
                        "total_pages": (total + per_page - 1) // per_page,
                        "has_more": end < total,
                    },
                }
            ),
            200,
        )

    bills = db.get_todays_bills()
    return jsonify({"success": True, "bills": bills}), 200


@billing_bp.route("/date/<string:date_str>", methods=["GET"])
@safe_route
def get_bills_by_date(date_str):
    """Get all bills for a specific date (YYYY-MM-DD)."""
    import datetime

    try:
        datetime.datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise ValidationError("Invalid date format. Use YYYY-MM-DD", code="INVALID_DATE_FORMAT")

    bills = db.get_bills_by_date(date_str)

    return jsonify({"success": True, "bills": bills}), 200


@billing_bp.route("/next-number", methods=["GET"])
@safe_route
def get_next_bill_number():
    """Get the next bill number for today."""
    # IMPORTANT: include CANCELLED bills too, so numbers are never reused.
    today = date.today()
    max_bill = (
        orm_db.session.query(func.max(Bill.bill_no))
        .filter(func.date(Bill.created_at) == today)
        .scalar()
    )
    next_bill_no = (max_bill or 0) + 1

    return jsonify({"success": True, "next_bill_number": next_bill_no}), 200


@billing_bp.route("/management/all", methods=["GET"])
@safe_route
def get_all_bills_management():
    """Get ALL bills for management (including cancelled)."""
    date_param = request.args.get("date")
    page = request.args.get("page", type=int)
    per_page = request.args.get("per_page", 20, type=int)

    if date_param:
        bills = db.get_bills_by_date_range(date_param, date_param)
        return jsonify({"success": True, "bills": bills}), 200

    if page is not None:
        start = (page - 1) * per_page
        paginated_bills = db.get_all_bills_management(limit=per_page, offset=start)
        total = db.get_all_bills_management_count()
        end = start + per_page

        return (
            jsonify(
                {
                    "success": True,
                    "bills": paginated_bills,
                    "pagination": {
                        "page": page,
                        "per_page": per_page,
                        "total": total,
                        "total_pages": (total + per_page - 1) // per_page,
                        "has_more": end < total,
                    },
                }
            ),
            200,
        )

    bills = db.get_all_bills_management()

    return jsonify({"success": True, "bills": bills}), 200


@billing_bp.route("/<int:bill_no>/cancel", methods=["PUT"])
@safe_route
def cancel_bill(bill_no):
    """Cancel a specific bill."""
    success = db.cancel_bill(bill_no)
    if not success:
        raise ValidationError(f"Failed to cancel bill {bill_no}", code="BILL_CANCEL_FAILED")

    # Re-aggregate after cancellation
    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception:
        pass

    cache.clear()  # Invalidate Flask-Caching for summary endpoints

    return (
        jsonify({"success": True, "message": f"Bill {bill_no} cancelled successfully"}),
        200,
    )


@billing_bp.route("/<int:bill_no>/update", methods=["PUT"])
@safe_route
def update_bill(bill_no):
    """Update an existing bill."""
    data = request.get_json()

    try:
        validated = _bill_update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid bill update data: {e.messages}",
            code="BILL_UPDATE_VALIDATION_FAILED",
        )

    products = validated.get("products", [])
    validated_products = []
    total = 0.0

    order_type = (data or {}).get("order_type")
    if not order_type:
        existing_bill = db.get_bill(bill_no)
        order_type = existing_bill.get("order_type", "dine-in") if existing_bill else "dine-in"

    if products:
        validated_products, total = _validate_bill_products(products, order_type)

    bill_update_data = {
        "customer_name": validated.get("customer_name", ""),
        "customer_mobile": validated.get("customer_mobile", "")
        or validated.get("customer_phone", ""),
        "total_amount": total if products else validated.get("total_amount", 0),
        "items": validated_products,
        "order_type": order_type,
        "table_no": validated.get("table_no", ""),
    }

    success = db.update_bill(bill_no, bill_update_data)

    if not success:
        raise ValidationError("Failed to update bill", code="BILL_UPDATE_FAILED")

    cache.clear()  # Invalidate Flask-Caching for summary endpoints

    return (
        jsonify({"success": True, "message": f"Bill {bill_no} updated successfully"}),
        200,
    )


@billing_bp.route("/print/<int:bill_no>", methods=["POST"])
@safe_route
def print_bill(bill_no):
    """Print an existing bill."""
    logger.info(f"Print request received for Bill #{bill_no}")
    db_local = DatabaseService()
    bill = db_local.get_bill(bill_no)

    if not bill:
        raise NotFoundError(f"Bill with number {bill_no} not found", code="BILL_NOT_FOUND")

    # Normalize bill shape for printer service (`products`/`total` keys).
    print_payload = _build_printer_payload(bill)
    body = request.get_json(silent=True) or {}
    if body.get("kot_no"):
        print_payload["kot_no"] = body.get("kot_no")
    if body.get("customer_name"):
        print_payload["customer_name"] = body.get("customer_name")
    if body.get("customer_mobile") or body.get("customer_phone"):
        print_payload["customer_mobile"] = body.get("customer_mobile") or body.get("customer_phone")
    if body.get("table_no"):
        print_payload["table_no"] = body.get("table_no")

    result = printer_service.print_bill(print_payload)

    if not result.get("success"):
        error_msg = result.get("error", "Failed to print bill")
        return jsonify({"success": False, "error": error_msg, "message": error_msg}), 200

    return (
        jsonify({"success": True, "message": f"Bill {bill_no} printed successfully"}),
        200,
    )


@billing_bp.route("/print-kot/<int:bill_no>", methods=["POST"])
@safe_route
def print_kot(bill_no):
    """Print an existing bill's KOT."""
    logger.info(f"KOT Print request received for Bill #{bill_no}")
    db_local = DatabaseService()
    bill = db_local.get_bill(bill_no)

    if not bill:
        raise NotFoundError(f"Bill with number {bill_no} not found", code="BILL_NOT_FOUND")

    # Normalize bill shape for printer service (`products`/`total` keys).
    print_payload = _build_printer_payload(bill)
    body = request.get_json(silent=True) or {}
    if body.get("kot_no"):
        print_payload["kot_no"] = body.get("kot_no")
    if body.get("customer_name"):
        print_payload["customer_name"] = body.get("customer_name")
    if body.get("customer_mobile") or body.get("customer_phone"):
        print_payload["customer_mobile"] = body.get("customer_mobile") or body.get("customer_phone")
    if body.get("table_no"):
        print_payload["table_no"] = body.get("table_no")

    result = printer_service.print_kot(print_payload)

    if not result.get("success"):
        error_msg = result.get("error", "Failed to print KOT")
        return jsonify({"success": False, "error": error_msg, "message": error_msg}), 200

    return (
        jsonify({"success": True, "message": f"KOT for Bill {bill_no} printed successfully"}),
        200,
    )


@billing_bp.route("/preview-image", methods=["GET", "POST"])
@safe_route
def get_bill_preview_image():
    """Generate or serve high-quality receipt preview image of print window bill template."""
    data = request.get_json() if request.method == "POST" and request.is_json else {}

    bill_data = {
        "bill_no": data.get("bill_no", "BILL-1001"),
        "date": data.get("date", "2026-08-09"),
        "time": data.get("time", "18:30:00"),
        "order_type": data.get("order_type", "dine-in"),
        "customer_name": data.get("customer_name", "John Doe"),
        "cashier": data.get("cashier", "biller"),
        "today_token": data.get("today_token", 5),
        "products": data.get("products")
        or [
            {
                "name": "Margherita Pizza",
                "variation_name": "Medium",
                "quantity": 2,
                "price": 250.00,
            },
            {"name": "Cold Coffee", "quantity": 1, "price": 120.00},
            {"name": "Garlic Bread", "quantity": 1, "price": 150.00},
        ],
        "subtotal": data.get("subtotal", 770.00),
        "discount": data.get("discount", 50.00),
        "gst": data.get("gst", 36.00),
        "total": data.get("total", 756.00),
    }

    settings = db.get_all_settings()
    shop_settings = {
        "shop_name": settings.get("shop_name", "InfoOS Cafe & Restaurant"),
        "shop_address": settings.get("shop_address", "123 Main Tech Park, Suite 400"),
        "shop_contact": settings.get("shop_contact", "+91 9876543210"),
        "printer_template": settings.get("printer_template", "default"),
        "printer_footer_msg": settings.get("printer_footer_msg", "Thank You! Visit Again."),
    }

    html = printer_service.renderer.render_bill(bill_data, shop_settings, is_bill=True)
    width = settings.get("printer_width", "80mm")

    as_file = request.args.get("as_file", "false").lower() == "true"
    png_path = printer_service.image_generator.generate_png(html, width)

    if as_file and os.path.exists(png_path):
        return send_file(png_path, mimetype="image/png")

    try:
        with open(png_path, "rb") as f:
            img_b64 = base64.b64encode(f.read()).decode("utf-8")
    finally:
        if os.path.exists(png_path):
            try:
                os.remove(png_path)
            except Exception:
                pass

    return (
        jsonify(
            {
                "success": True,
                "image_base64": f"data:image/png;base64,{img_b64}",
                "template": shop_settings["printer_template"],
                "width": width,
            }
        ),
        200,
    )


@billing_bp.route("/clear", methods=["DELETE"])
@require_admin
@safe_route
def clear_all_bills():
    """Clear all bills from the database — requires password authentication."""
    data = request.get_json()

    if not data or ("password" not in data and "pin" not in data):
        raise ValidationError("PIN is required", code="MISSING_PASSWORD")

    pin_or_password = str(data.get("password") or data.get("pin") or "")

    from auth import verify_admin_pin

    if not verify_admin_pin(pin_or_password):
        from error_handler import AuthorizationError

        raise AuthorizationError("Invalid Owner PIN", code="INVALID_PASSWORD")

    db_local = DatabaseService()
    success = db_local.clear_all_bills()

    if not success:
        raise Exception("Failed to clear bills")

    cache.clear()  # Invalidate Flask-Caching for summary endpoints

    return jsonify({"success": True, "message": "All bills cleared successfully"}), 200
