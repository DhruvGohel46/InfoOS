from flask import Blueprint, request, jsonify
from auth import require_admin
from models import db, ExpenseType
from error_handler import safe_route, ValidationError, NotFoundError
from validators import MarshmallowValidationError
import logging

logger = logging.getLogger(__name__)

expense_types_bp = Blueprint("expense_types", __name__, url_prefix="/api/expense-types")


@expense_types_bp.route("", methods=["GET"])
@safe_route
def get_expense_types():
    """Get all expense types."""
    expense_types = ExpenseType.query.order_by(ExpenseType.name).all()
    return jsonify({"success": True, "expense_types": [et.to_dict() for et in expense_types]}), 200


@expense_types_bp.route("/<int:type_id>", methods=["GET"])
@safe_route
def get_expense_type(type_id):
    """Get a specific expense type."""
    expense_type = ExpenseType.query.get(type_id)
    if not expense_type:
        raise NotFoundError("Expense type not found", code="EXPENSE_TYPE_NOT_FOUND")
    return jsonify({"success": True, "expense_type": expense_type.to_dict()}), 200


@expense_types_bp.route("", methods=["POST"])
@require_admin
@safe_route
def create_expense_type():
    """Create a new expense type."""
    data = request.json

    if not data or not data.get("name"):
        raise ValidationError("Expense type name is required", code="EXPENSE_TYPE_NAME_REQUIRED")

    # Check if name already exists
    existing = ExpenseType.query.filter_by(name=data["name"]).first()
    if existing:
        raise ValidationError(
            "Expense type with this name already exists", code="EXPENSE_TYPE_EXISTS"
        )

    expense_type = ExpenseType(
        name=data["name"],
        description=data.get("description", ""),
        is_active=data.get("is_active", True),
    )

    db.session.add(expense_type)
    db.session.commit()

    logger.info(f"Expense type created: {expense_type.name}")
    return (
        jsonify(
            {
                "success": True,
                "message": "Expense type created successfully",
                "expense_type": expense_type.to_dict(),
            }
        ),
        201,
    )


@expense_types_bp.route("/<int:type_id>", methods=["PUT"])
@require_admin
@safe_route
def update_expense_type(type_id):
    """Update an expense type."""
    data = request.json
    expense_type = ExpenseType.query.get(type_id)

    if not expense_type:
        raise NotFoundError("Expense type not found", code="EXPENSE_TYPE_NOT_FOUND")

    # Check if name is being changed and if it conflicts
    if "name" in data and data["name"] != expense_type.name:
        existing = ExpenseType.query.filter_by(name=data["name"]).first()
        if existing:
            raise ValidationError(
                "Expense type with this name already exists", code="EXPENSE_TYPE_EXISTS"
            )
        expense_type.name = data["name"]

    if "description" in data:
        expense_type.description = data["description"]
    if "is_active" in data:
        expense_type.is_active = data["is_active"]

    db.session.commit()

    logger.info(f"Expense type updated: {expense_type.name}")
    return (
        jsonify(
            {
                "success": True,
                "message": "Expense type updated successfully",
                "expense_type": expense_type.to_dict(),
            }
        ),
        200,
    )


@expense_types_bp.route("/<int:type_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_expense_type(type_id):
    """Delete an expense type."""
    expense_type = ExpenseType.query.get(type_id)

    if not expense_type:
        raise NotFoundError("Expense type not found", code="EXPENSE_TYPE_NOT_FOUND")

    # Check if any expenses are using this type
    from models import Expense

    expenses_count = Expense.query.filter_by(category=expense_type.name).count()
    if expenses_count > 0:
        raise ValidationError(
            f"Cannot delete expense type. {expenses_count} expense(s) are using this type.",
            code="EXPENSE_TYPE_IN_USE",
        )

    db.session.delete(expense_type)
    db.session.commit()

    logger.info(f"Expense type deleted: {expense_type.name}")
    return jsonify({"success": True, "message": "Expense type deleted successfully"}), 200
