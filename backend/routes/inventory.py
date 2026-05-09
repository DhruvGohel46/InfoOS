from flask import Blueprint, request, jsonify
from auth import require_auth
from services.db_service import DatabaseService
from error_handler import safe_route, ValidationError, NotFoundError, ConflictError
from validators import (
    InventoryCreateSchema,
    InventoryUpdateSchema,
    StockAdjustSchema,
    MarshmallowValidationError,
)
import logging

logger = logging.getLogger(__name__)

inventory_bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")
db = DatabaseService()

# Reusable schema instances
_create_schema = InventoryCreateSchema()
_update_schema = InventoryUpdateSchema()
_adjust_schema = StockAdjustSchema()


@inventory_bp.route("", methods=["GET"])
@safe_route
def get_all_inventory():
    """Get all inventory with status."""
    items = db.get_all_inventory()
    return jsonify({"success": True, "inventory": items})


@inventory_bp.route("/low-stock", methods=["GET"])
@safe_route
def get_low_stock():
    """Get low stock items for notifications."""
    items = db.get_low_stock_products()
    return jsonify({"success": True, "low_stock_items": items, "count": len(items)})


@inventory_bp.route("/<int:item_id>", methods=["GET"])
@safe_route
def get_inventory_item(item_id):
    """Get specific inventory item."""
    item = db.get_inventory_item(item_id)
    if not item:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "item": item})


@inventory_bp.route("/create", methods=["POST"])
@require_auth
@safe_route
def create_inventory():
    """Create new inventory item."""
    data = request.get_json()

    try:
        validated = _create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid inventory data: {e.messages}", code="INVENTORY_VALIDATION_FAILED"
        )

    item_id = db.create_inventory_item(validated)

    if not item_id:
        raise ValidationError(
            "Failed to create item (Product may already be linked or is inactive)",
            code="INVENTORY_CREATE_FAILED",
        )

    return (
        jsonify({"success": True, "message": "Inventory item created", "id": item_id}),
        201,
    )


@inventory_bp.route("/<int:item_id>", methods=["PUT"])
@require_auth
@safe_route
def update_inventory(item_id):
    """Update inventory item details."""
    existing = db.get_inventory_item(item_id)
    if existing and existing.get("is_locked"):
        raise ConflictError(
            "Product is inactive. Reactivate from Management before editing inventory.",
            code="INVENTORY_LOCKED",
        )

    data = request.get_json()

    try:
        validated = _update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="INVENTORY_UPDATE_VALIDATION_FAILED",
        )

    success = db.update_inventory(item_id, validated)

    if not success:
        raise NotFoundError(
            "Item not found or update failed", code="INVENTORY_NOT_FOUND"
        )

    return jsonify({"success": True, "message": "Inventory updated successfully"})


@inventory_bp.route("/adjust", methods=["POST"])
@require_auth
@safe_route
def adjust_stock():
    """Adjust stock level (+/-)."""
    data = request.get_json()

    try:
        validated = _adjust_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid adjustment data: {e.messages}",
            code="STOCK_ADJUST_VALIDATION_FAILED",
        )

    item_id = validated["id"]
    adjustment = validated["adjustment"]

    item = db.get_inventory_item(item_id)
    if item and item.get("is_locked"):
        raise ConflictError(
            "Product is inactive. Reactivate from Management before adjusting stock.",
            code="INVENTORY_LOCKED",
        )

    success = db.adjust_inventory_stock(item_id, adjustment)

    if not success:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "message": "Stock adjusted successfully"})


@inventory_bp.route("/<int:item_id>", methods=["DELETE"])
@require_auth
@safe_route
def delete_inventory(item_id):
    """Delete inventory item."""
    existing = db.get_inventory_item(item_id)
    if existing and existing.get("is_locked"):
        raise ConflictError(
            "Inactive product inventory is locked and cannot be deleted.",
            code="INVENTORY_LOCKED",
        )

    success = db.delete_inventory_item(item_id)
    if not success:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "message": "Item deleted successfully"})
