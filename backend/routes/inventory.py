from flask import Blueprint, request, jsonify
from auth import require_admin
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

import threading
import time

class InventoryCache:
    def __init__(self, db_service):
        self.db = db_service
        self.lock = threading.Lock()
        self.pending_updates = {}  # item_id (int) -> dict of data
        self.timer = None

    def get_all_inventory(self):
        items = self.db.get_all_inventory()
        with self.lock:
            for item in items:
                item_id = item["id"]
                if item_id in self.pending_updates:
                    cached = self.pending_updates[item_id]
                    # Merge cached values
                    for k, v in cached.items():
                        item[k] = v
        return items

    def get_low_stock_products(self):
        items = self.db.get_low_stock_products()
        with self.lock:
            # Update items that are already in low-stock list
            for item in items:
                item_id = item["id"]
                if item_id in self.pending_updates:
                    cached = self.pending_updates[item_id]
                    item["stock"] = cached["stock"]
                    item["status"] = cached["status"]
            
            # Re-verify and filter out active ones that are no longer low-stock in cache
            filtered = []
            for item in items:
                if item["stock"] <= item["alert_threshold"]:
                    filtered.append(item)
                    
            # Check if any cached item has become low-stock but wasn't in DB low-stock list
            all_cached_low = []
            for item_id, cached in self.pending_updates.items():
                if cached["stock"] <= cached["alert_threshold"]:
                    # Find if already in filtered
                    if not any(f["id"] == item_id for f in filtered):
                        filtered.append({
                            "id": item_id,
                            "name": cached["name"],
                            "type": cached["type"],
                            "stock": cached["stock"],
                            "alert_threshold": cached["alert_threshold"],
                            "unit": cached["unit"],
                            "status": cached["status"],
                            "product_id": cached.get("product_id"),
                        })
        return filtered

    def get_inventory_item(self, item_id):
        with self.lock:
            if item_id in self.pending_updates:
                return self.pending_updates[item_id]
        return self.db.get_inventory_item(item_id)

    def cache_update(self, item_id, data):
        with self.lock:
            if item_id not in self.pending_updates:
                existing = self.db.get_inventory_item(item_id)
                if not existing:
                    return False
                self.pending_updates[item_id] = existing
            
            cached = self.pending_updates[item_id]
            if "name" in data:
                cached["name"] = data["name"]
            if "type" in data:
                cached["type"] = data["type"]
            if "unit" in data:
                cached["unit"] = data["unit"]
            if "stock" in data:
                new_stock = float(data["stock"])
                cached["stock"] = new_stock
                if new_stock > cached.get("max_stock_history", 10.0):
                    cached["max_stock_history"] = new_stock
            if "unit_price" in data:
                cached["unit_price"] = float(data["unit_price"])
            if "alert_threshold" in data:
                cached["alert_threshold"] = float(data["alert_threshold"])
            if "product_id" in data:
                cached["product_id"] = data["product_id"]

            cached["updated_at"] = str(datetime.now())
            # Recompute status
            status = "In Stock"
            if cached["stock"] <= 0:
                status = "Out of Stock"
            elif cached["stock"] <= cached["alert_threshold"]:
                status = "Low Stock"
            cached["status"] = status

            self._schedule_flush()
            return True

    def cache_adjust(self, item_id, adjustment):
        with self.lock:
            if item_id not in self.pending_updates:
                existing = self.db.get_inventory_item(item_id)
                if not existing:
                    return False
                self.pending_updates[item_id] = existing
            
            cached = self.pending_updates[item_id]
            cached["stock"] = cached.get("stock", 0.0) + float(adjustment)
            
            cur_max = cached.get("max_stock_history", 10.0)
            if cached["stock"] > cur_max:
                cached["max_stock_history"] = cached["stock"]

            cached["updated_at"] = str(datetime.now())
            status = "In Stock"
            if cached["stock"] <= 0:
                status = "Out of Stock"
            elif cached["stock"] <= cached["alert_threshold"]:
                status = "Low Stock"
            cached["status"] = status

            self._schedule_flush()
            return True

    def evict(self, item_id):
        with self.lock:
            if item_id in self.pending_updates:
                del self.pending_updates[item_id]

    def _schedule_flush(self):
        # Debounce/delay: starts 5-minute timer from the first update of a batch
        if self.timer is None:
            self.timer = threading.Timer(300.0, self.flush)
            self.timer.start()

    def flush(self):
        with self.lock:
            updates = list(self.pending_updates.items())
            self.pending_updates.clear()
            self.timer = None

        if not updates:
            return

        # Use app context to write safely to DB inside threading.Timer thread
        try:
            from app import app
            with app.app_context():
                for item_id, data in updates:
                    try:
                        self.db.update_inventory(item_id, data)
                    except Exception as ex:
                        logger.error(f"Error flushing inventory cache item {item_id}: {ex}")
        except Exception as e:
            logger.error(f"Error importing app context for cache flushing: {e}")

# Inject/wrap dependencies
from datetime import datetime
inventory_bp = Blueprint("inventory", __name__, url_prefix="/api/inventory")
db = DatabaseService()
cache = InventoryCache(db)

# Reusable schema instances
_create_schema = InventoryCreateSchema()
_update_schema = InventoryUpdateSchema()
_adjust_schema = StockAdjustSchema()


@inventory_bp.route("", methods=["GET"])
@safe_route
def get_all_inventory():
    """Get all inventory with status."""
    items = cache.get_all_inventory()
    return jsonify({"success": True, "inventory": items})


@inventory_bp.route("/low-stock", methods=["GET"])
@safe_route
def get_low_stock():
    """Get low stock items for notifications."""
    items = cache.get_low_stock_products()
    return jsonify({"success": True, "low_stock_items": items, "count": len(items)})


@inventory_bp.route("/<int:item_id>", methods=["GET"])
@safe_route
def get_inventory_item(item_id):
    """Get specific inventory item."""
    item = cache.get_inventory_item(item_id)
    if not item:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "item": item})


@inventory_bp.route("/create", methods=["POST"])
@require_admin
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
@require_admin
@safe_route
def update_inventory(item_id):
    """Update inventory item details."""
    existing = cache.get_inventory_item(item_id)
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

    success = cache.cache_update(item_id, validated)

    if not success:
        raise NotFoundError("Item not found or update failed", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "message": "Inventory updated successfully"})


@inventory_bp.route("/adjust", methods=["POST"])
@require_admin
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

    item = cache.get_inventory_item(item_id)
    if item and item.get("is_locked"):
        raise ConflictError(
            "Product is inactive. Reactivate from Management before adjusting stock.",
            code="INVENTORY_LOCKED",
        )

    success = cache.cache_adjust(item_id, adjustment)

    if not success:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    return jsonify({"success": True, "message": "Stock adjusted successfully"})


@inventory_bp.route("/<int:item_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_inventory(item_id):
    """Delete inventory item."""
    existing = cache.get_inventory_item(item_id)
    if existing and existing.get("is_locked"):
        raise ConflictError(
            "Inactive product inventory is locked and cannot be deleted.",
            code="INVENTORY_LOCKED",
        )

    success = db.delete_inventory_item(item_id)
    if not success:
        raise NotFoundError("Item not found", code="INVENTORY_NOT_FOUND")

    cache.evict(item_id)
    return jsonify({"success": True, "message": "Item deleted successfully"})
