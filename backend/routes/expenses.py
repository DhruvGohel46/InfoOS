import uuid
from flask import Blueprint, jsonify, request
from auth import require_admin
from models import db, Inventory, func, extract
from datetime import date, timedelta, datetime
from models import Expense, ExpenseItem
from error_handler import safe_route, ValidationError, NotFoundError
from validators import (
    ExpenseCreateSchema,
    ExpenseUpdateSchema,
    MarshmallowValidationError,
)
import logging

logger = logging.getLogger(__name__)

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")

# Reusable schema instances
_create_schema = ExpenseCreateSchema()
_update_schema = ExpenseUpdateSchema()


@expenses_bp.route("", methods=["GET"])
@safe_route
def get_expenses():
    """Get all expenses with optional filtering."""
    limit = request.args.get("limit", 100, type=int)
    category = request.args.get("category")
    worker_id = request.args.get("worker_id")

    query = Expense.query

    range_type = request.args.get("range")
    date_param = request.args.get("date")

    if range_type:
        ref_date = date.today()
        if date_param:
            try:
                ref_date = datetime.strptime(date_param, "%Y-%m-%d").date()
            except ValueError:
                pass

        if range_type in ("today", "day"):
            query = query.filter(func.date(Expense.date) == ref_date)
        elif range_type == "week":
            start_week = ref_date - timedelta(days=ref_date.weekday())
            query = query.filter(Expense.date >= start_week)
        elif range_type == "month":
            query = query.filter(
                extract("month", Expense.date) == ref_date.month,
                extract("year", Expense.date) == ref_date.year,
            )
        elif range_type == "year":
            query = query.filter(extract("year", Expense.date) == ref_date.year)

    if category:
        query = query.filter_by(category=category)
    if worker_id:
        query = query.filter_by(worker_id=worker_id)

    expenses = query.order_by(Expense.date.desc()).limit(limit).all()

    return (
        jsonify({"success": True, "expenses": [expense.to_dict() for expense in expenses]}),
        200,
    )


@expenses_bp.route("/<expense_id>", methods=["GET"])
@safe_route
def get_expense(expense_id):
    """Get specific expense details."""
    expense = Expense.query.filter_by(id=expense_id).first()
    if not expense:
        raise NotFoundError("Expense not found", code="EXPENSE_NOT_FOUND")

    return jsonify({"success": True, "expense": expense.to_dict()}), 200


@expenses_bp.route("", methods=["POST"])
@require_admin
@safe_route
def create_expense():
    """Create a new expense."""
    data = request.json

    try:
        validated = _create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid expense data: {e.messages}", code="EXPENSE_VALIDATION_FAILED"
        )

    amount = float(validated["amount"])

    # Create Expense
    new_expense = Expense(
        id=str(uuid.uuid4()),
        title=validated["title"],
        category=validated["category"],
        amount=amount,
        payment_method=validated.get("payment_method", "Cash"),
        worker_id=validated.get("worker_id"),
        date=validated.get("date") or func.now(),
        notes=validated.get("notes", ""),
    )

    db.session.add(new_expense)

    # Optional: Handle items if provided (backwards compatibility)
    items = validated.get("items", [])
    for item in items:
        product_id = item.get("product_id") or item.get("name")
        quantity_str = str(item.get("quantity", "1"))

        expense_item = ExpenseItem(
            id=str(uuid.uuid4()),
            expense_id=new_expense.id,
            product_id=product_id,
            quantity=quantity_str,
            purchase_price=float(item.get("purchase_price", 0)),
            subtotal=float(item.get("subtotal", 0)),
        )
        db.session.add(expense_item)

        # Update inventory if it's an inventory purchase
        if new_expense.category == "Supplies" and product_id:
            try:
                quantity_float = float(quantity_str.split()[0])
            except (ValueError, IndexError):
                quantity_float = 0

            if quantity_float > 0:
                inventory = Inventory.query.filter_by(product_id=product_id).first()
                if not inventory:
                    inventory = Inventory.query.filter_by(name=product_id).first()

                if inventory:
                    inventory.stock += quantity_float
                    db.session.add(inventory)

    db.session.commit()

    # Update pre-aggregated daily summary
    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception as agg_err:
        logger.warning(f"Aggregation update warning: {agg_err}")

    logger.info(f"Expense created: {validated['title']} — ₹{amount:.2f}")

    return (
        jsonify(
            {
                "success": True,
                "message": "Expense created successfully",
                "expense": new_expense.to_dict(),
            }
        ),
        201,
    )


@expenses_bp.route("/<expense_id>", methods=["PUT"])
@require_admin
@safe_route
def update_expense(expense_id):
    """Update an existing expense."""
    data = request.json

    try:
        validated = _update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="EXPENSE_UPDATE_VALIDATION_FAILED",
        )

    expense = Expense.query.get(expense_id)
    if not expense:
        raise NotFoundError("Expense not found", code="EXPENSE_NOT_FOUND")

    # Update Expense fields
    if "title" in validated:
        expense.title = validated["title"]
    if "category" in validated:
        expense.category = validated["category"]
    if "amount" in validated:
        expense.amount = float(validated["amount"])
    if "payment_method" in validated:
        expense.payment_method = validated["payment_method"]
    if "worker_id" in validated:
        expense.worker_id = validated["worker_id"]
    if "date" in validated and validated["date"]:
        expense.date = validated["date"]
    if "notes" in validated:
        expense.notes = validated["notes"]

    # Update Items (Optional)
    items_data = validated.get("items", [])
    if items_data:
        ExpenseItem.query.filter_by(expense_id=expense_id).delete()
        for item in items_data:
            product_id = item.get("product_id") or item.get("name")
            new_item = ExpenseItem(
                id=str(uuid.uuid4()),
                expense_id=expense_id,
                product_id=product_id,
                quantity=str(item.get("quantity", "1")),
                purchase_price=float(item.get("purchase_price", 0)),
                subtotal=float(item.get("subtotal", 0)),
            )
            db.session.add(new_item)

    db.session.commit()
    return (
        jsonify(
            {
                "success": True,
                "message": "Expense updated successfully",
                "expense": expense.to_dict(),
            }
        ),
        200,
    )


@expenses_bp.route("/<expense_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_expense(expense_id):
    """Delete an expense."""
    expense = Expense.query.get(expense_id)
    if not expense:
        raise NotFoundError("Expense not found", code="EXPENSE_NOT_FOUND")

    db.session.delete(expense)
    db.session.commit()

    # Update pre-aggregated daily summary
    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception:
        pass

    return jsonify({"success": True, "message": "Expense deleted successfully"}), 200
