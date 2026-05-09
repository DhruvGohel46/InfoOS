from flask import Blueprint, jsonify, request
from auth import require_auth
from error_handler import safe_route, ValidationError
from caching import cache
import json
from services.db_service import DatabaseService
from services.summary_service import SummaryService
import logging

logger = logging.getLogger(__name__)

summary_bp = Blueprint("summary", __name__, url_prefix="/api/summary")
db = DatabaseService()
summary_service = SummaryService(db)


@summary_bp.route("/today", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_today_summary():
    """Get today's sales summary."""
    summary = summary_service.get_today_summary()

    return jsonify({"success": True, "summary": summary}), 200


@summary_bp.route("/date/<date_str>", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_summary_for_date(date_str):
    """Get summary for a specific date (YYYY-MM-DD format)."""
    # Basic date format validation
    if len(date_str) != 10 or date_str[4] != "-" or date_str[7] != "-":
        raise ValidationError(
            "Invalid date format. Use YYYY-MM-DD", code="INVALID_DATE_FORMAT"
        )

    try:
        year, month, day = map(int, date_str.split("-"))
        if year < 2020 or year > 2030 or month < 1 or month > 12 or day < 1 or day > 31:
            raise ValueError("Invalid date")
    except ValueError:
        raise ValidationError("Invalid date values", code="INVALID_DATE_VALUES")

    summary = summary_service.get_summary_for_date(date_str)

    return jsonify({"success": True, "summary": summary}), 200


@summary_bp.route("/top-products", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_top_selling_products():
    """Get top selling products for today."""
    limit = 10
    if "limit" in request.args:
        try:
            limit = int(request.args.get("limit"))
            if limit <= 0 or limit > 100:
                limit = 10
        except ValueError:
            limit = 10

    top_products = summary_service.get_top_selling_products(limit)

    return (
        jsonify(
            {"success": True, "top_products": top_products, "count": len(top_products)}
        ),
        200,
    )


@summary_bp.route("/quick-stats", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_quick_stats():
    """Get quick statistics for dashboard."""
    summary = summary_service.get_today_summary()

    quick_stats = {
        "total_bills": summary.get("total_bills", 0),
        "total_sales": summary.get("total_sales", 0.0),
        "average_bill_value": summary.get("average_bill_value", 0.0),
        "first_bill_time": summary.get("first_bill_time"),
        "last_bill_time": summary.get("last_bill_time"),
        "peak_hour": summary.get("peak_hour"),
        "category_count": len(summary.get("category_totals", {})),
    }

    return jsonify({"success": True, "quick_stats": quick_stats}), 200


@summary_bp.route("/product-sales", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_product_sales():
    """Get detailed sales breakdown by individual products."""
    date_param = request.args.get("date")

    db_svc = summary_service.db_service
    if date_param:
        all_bills = db_svc.get_bills_by_date_range(date_param, date_param)
    else:
        all_bills = db_svc.get_todays_bills()

    # Calculate product sales from all bills
    product_sales = {}

    for bill in all_bills:
        items = (
            json.loads(bill["items"])
            if isinstance(bill["items"], str)
            else bill["items"]
        )

        for item in items:
            product_id = item["product_id"]
            product_name = item.get("name", "Unknown Product")
            quantity = item.get("quantity", 0)
            price = item.get("price", 0)
            total_amount = quantity * price

            if product_id in product_sales:
                product_sales[product_id]["quantity"] += quantity
                product_sales[product_id]["total_amount"] += total_amount
            else:
                product_sales[product_id] = {
                    "product_id": product_id,
                    "name": product_name,
                    "quantity": quantity,
                    "total_amount": total_amount,
                    "price": price,
                }

    sales_array = list(product_sales.values())
    sales_array.sort(key=lambda x: x["total_amount"], reverse=True)

    return jsonify({"success": True, "product_sales": sales_array}), 200


@summary_bp.route("/range", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_range_summary():
    """Get aggregated summary for a date range."""
    from datetime import date

    range_type = request.args.get("range", "week")
    date_param = request.args.get("date", date.today().strftime("%Y-%m-%d"))

    summary = summary_service.get_range_summary(range_type, date_param)

    return jsonify({"success": True, "summary": summary}), 200


@summary_bp.route("/aggregated", methods=["GET"])
@safe_route
@cache.cached(timeout=300, query_string=True)
def get_aggregated_summary():
    """Get pre-aggregated daily summaries for a date range.

    Uses the daily_sales_summary table for O(1) lookups
    instead of scanning the entire bills table.

    Query params:
      start: YYYY-MM-DD (required)
      end:   YYYY-MM-DD (defaults to today)
    """
    from datetime import date as dt_date
    from models import DailySalesSummary

    start = request.args.get("start")
    end = request.args.get("end", dt_date.today().strftime("%Y-%m-%d"))

    if not start:
        raise ValidationError(
            "start date parameter is required (YYYY-MM-DD)", code="MISSING_START_DATE"
        )

    summaries = (
        DailySalesSummary.query.filter(
            DailySalesSummary.date >= start, DailySalesSummary.date <= end
        )
        .order_by(DailySalesSummary.date.asc())
        .all()
    )

    total_sales = sum(s.total_sales for s in summaries)
    total_orders = sum(s.total_orders for s in summaries)
    total_expenses = sum(s.total_expenses for s in summaries)
    net_profit = total_sales - total_expenses

    return (
        jsonify(
            {
                "success": True,
                "range": {"start": start, "end": end, "days": len(summaries)},
                "totals": {
                    "total_sales": total_sales,
                    "total_orders": total_orders,
                    "total_expenses": total_expenses,
                    "net_profit": net_profit,
                    "average_daily_sales": (
                        total_sales / len(summaries) if summaries else 0
                    ),
                    "average_bill_value": (
                        total_sales / total_orders if total_orders > 0 else 0
                    ),
                },
                "daily": [s.to_dict() for s in summaries],
            }
        ),
        200,
    )
