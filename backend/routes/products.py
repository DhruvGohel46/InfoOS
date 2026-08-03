from flask import Blueprint, request, jsonify, current_app
from auth import require_admin
from services.db_service import DatabaseService
from config import config
from error_handler import safe_route, ValidationError, NotFoundError, AuthorizationError
from validators import (
    ProductCreateSchema,
    ProductUpdateSchema,
    MarshmallowValidationError,
)
from utils.product_variations import normalize_variations
import cache
import os
import re
import logging
import threading
from PIL import Image

logger = logging.getLogger(__name__)

# ─── Backend AI Loader ────────────────────────────────────────────────────────
from ai.background_removal import remove_background_from_file
from ai.session_manager import AISessionManager
from ai.image_normalizer import normalize_product_image, optimize_and_save

_rembg_available = False
_rembg_loading = not os.environ.get("TESTING")


def _warmup_ai():
    global _rembg_available, _rembg_loading
    success = AISessionManager.initialize()
    _rembg_available = success
    _rembg_loading = False


if not os.environ.get("TESTING"):
    # Warm up the AI session in a background thread to prevent blocking server boot
    threading.Thread(target=_warmup_ai, daemon=True).start()


# ─── Blueprint & Shared Instances ─────────────────────────────────────────────

products_bp = Blueprint("products", __name__, url_prefix="/api/products")
db = DatabaseService()

_product_create_schema = ProductCreateSchema()
_product_update_schema = ProductUpdateSchema()


def update_catalog_version():
    """Update catalog version and invalidate settings cache."""
    import time

    db.update_settings_bulk([{"key": "catalog_version", "value": str(int(time.time()))}])
    cache.invalidate("settings")


@products_bp.route("/catalog-version", methods=["GET"])
@safe_route
def get_catalog_version():
    """Get the current catalog version/timestamp."""
    settings = db.get_all_settings()
    version = settings.get("catalog_version", "0")
    return jsonify({"success": True, "catalog_version": version})


# ─── Helpers ──────────────────────────────────────────────────────────────────


def get_safe_filename(product_name):
    """Convert product name to safe filename (lowercase, hyphens)."""
    s = str(product_name).lower().strip()
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"[\s-]+", "-", s)
    return s


# ─── Product CRUD Routes ──────────────────────────────────────────────────────


@products_bp.route("", methods=["POST"])
@require_admin
@safe_route
def create_product():
    """Create a new product."""
    data = request.get_json()

    try:
        validated = _product_create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid product data: {e.messages}", code="PRODUCT_VALIDATION_FAILED"
        )

    name = validated["name"]
    price = float(validated["price"])
    category_id = validated.get("category_id")
    category_name = validated.get("category")
    active = validated.get("active", True)

    if not category_id and category_name:
        cat = db.get_category_by_name(category_name)
        if cat:
            category_id = cat["id"]
        else:
            other_cat = db.get_category_by_name("other")
            category_id = other_cat["id"] if other_cat else None

    product_data = {
        "product_id": validated["product_id"],
        "name": name,
        "price": price,
        "takeaway_price": validated.get("takeaway_price"),
        "category_id": category_id,
        "category": category_name,
        "active": active,
        "variations": normalize_variations(validated.get("variations", [])),
    }

    success = db.create_product(product_data)

    if not success:
        raise ValidationError("Product ID already exists", code="PRODUCT_ID_DUPLICATE")

    cache.invalidate("products")
    cache.invalidate("products_with_stock")
    update_catalog_version()

    return (
        jsonify(
            {
                "success": True,
                "message": "Product created successfully",
                "product": product_data,
            }
        ),
        201,
    )


@products_bp.route("", methods=["GET"])
@safe_route
def get_all_products():
    """Get all active products (cached)."""
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    include_stock = request.args.get("include_stock", "false").lower() == "true"

    cache_domain = "products_with_stock" if include_stock else "products"
    cache_key = "all" if include_inactive else "active"

    products = cache.get(cache_domain, cache_key)
    if products is None:
        if include_stock:
            products = db.get_all_products_with_stock(include_inactive=include_inactive)
        else:
            products = db.get_all_products(include_inactive=include_inactive)
        cache.set(cache_domain, cache_key, products)

    return jsonify({"success": True, "products": products})


@products_bp.route("/reorder", methods=["PUT"])
@require_admin
@safe_route
def reorder_products():
    """Bulk update products display order."""
    data = request.get_json()
    if not data or "orders" not in data:
        raise ValidationError("Missing orders in request body", code="MISSING_ORDERS")

    orders = data["orders"]
    success = db.update_products_display_order(orders)
    if not success:
        raise Exception("Failed to update products order")

    cache.invalidate("products")
    cache.invalidate("products_with_stock")
    return jsonify({"success": True, "message": "Products reordered successfully"}), 200


@products_bp.route("/<product_id>", methods=["PUT"])
@require_admin
@safe_route
def update_product(product_id):
    """Update an existing product."""
    data = request.get_json()

    try:
        validated = _product_update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="PRODUCT_UPDATE_VALIDATION_FAILED",
        )

    if not validated:
        raise ValidationError(
            "No fields to update. Provide at least one: name, price, category, active, favorite, variations",
            code="NO_UPDATE_FIELDS",
        )

    update_data = {}

    if "name" in validated:
        update_data["name"] = validated["name"]

    if "price" in validated:
        update_data["price"] = validated["price"]

    if "takeaway_price" in validated:
        update_data["takeaway_price"] = validated["takeaway_price"]

    if "category_id" in validated:
        update_data["category_id"] = validated["category_id"]

    if "category" in validated:
        category_name = validated["category"]
        update_data["category"] = category_name
        cat = db.get_category_by_name(category_name)
        if cat:
            update_data["category_id"] = cat["id"]

    if "active" in validated:
        active = validated["active"]
        if isinstance(active, str):
            active = active.lower() in ["true", "1", "yes"]
        update_data["active"] = bool(active)

    if "favorite" in validated:
        favorite = validated["favorite"]
        if isinstance(favorite, str):
            favorite = favorite.lower() in ["true", "1", "yes"]
        update_data["favorite"] = bool(favorite)

    if "variations" in validated:
        update_data["variations"] = normalize_variations(validated["variations"])

    # Handle product name change → rename image on disk
    if "name" in update_data:
        product = db.get_product(product_id)
        if product and product.get("image_filename"):
            old_filename = product["image_filename"]
            ext = os.path.splitext(old_filename)[1]
            new_safe_name = get_safe_filename(update_data["name"])
            new_filename = f"{new_safe_name}{ext}"

            if old_filename != new_filename:
                images_dir = os.path.join(config["default"].DATA_DIR, "images")
                old_path = os.path.join(images_dir, old_filename)
                new_path = os.path.join(images_dir, new_filename)

                if os.path.exists(old_path):
                    try:
                        os.rename(old_path, new_path)
                        update_data["image_filename"] = new_filename
                    except Exception as e:
                        logger.warning("Error renaming image: %s", e)

    success = db.update_product(product_id, update_data)

    if not success:
        raise NotFoundError(f"Product with ID {product_id} not found", code="PRODUCT_NOT_FOUND")

    cache.invalidate("products")
    cache.invalidate("products_with_stock")
    update_catalog_version()

    return (
        jsonify(
            {
                "success": True,
                "message": "Product updated successfully",
                "product_id": product_id,
                "updated_fields": list(update_data.keys()),
            }
        ),
        200,
    )


@products_bp.route("/<product_id>", methods=["GET"])
@safe_route
def get_product(product_id):
    """Get a specific product by ID."""
    product = db.get_product(product_id)

    if not product:
        raise NotFoundError(f"Product with ID {product_id} not found", code="PRODUCT_NOT_FOUND")

    return jsonify({"success": True, "product": product}), 200


@products_bp.route("/reset-database", methods=["POST"])
@require_admin
@safe_route
def reset_database():
    """Reset the entire database — requires Owner PIN authentication."""
    data = request.get_json()

    if not data or ("password" not in data and "pin" not in data):
        raise ValidationError("PIN is required", code="MISSING_PASSWORD")

    pin_or_password = str(data.get("password") or data.get("pin") or "")

    from auth import verify_admin_pin

    if not verify_admin_pin(pin_or_password):
        raise AuthorizationError("Invalid Owner PIN", code="INVALID_PASSWORD")

    bills_cleared = db.clear_all_bills()
    products_cleared = db.clear_all_products()

    if not (bills_cleared and products_cleared):
        raise Exception("Failed to reset database")

    update_catalog_version()

    return (
        jsonify(
            {
                "success": True,
                "message": "Database reset successfully - all products and bills have been cleared",
            }
        ),
        200,
    )


# ─── Image Management Routes ──────────────────────────────────────────────────


@products_bp.route("/<product_id>/image", methods=["POST"])
@require_admin
@safe_route
def upload_product_image(product_id):
    """
    Upload a product image, preserving the original, performing backend background
    removal using the local ONNX model, and saving the transparent PNG.
    """
    if "image" not in request.files:
        raise ValidationError("No image file provided", code="MISSING_IMAGE")

    file = request.files["image"]

    if file.filename == "":
        raise ValidationError("No selected file", code="EMPTY_FILENAME")

    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        raise ValidationError("Invalid image format", code="INVALID_IMAGE_FORMAT")

    import time

    timestamp = int(time.time())
    filename_png = f"{product_id}_{timestamp}.png"
    filename_orig = f"{product_id}_{timestamp}_original{ext}"

    images_dir = os.path.join(config["default"].DATA_DIR, "images")
    os.makedirs(images_dir, exist_ok=True)

    # 1. Clean up any existing image files for this product to prevent clutter
    for f_name in os.listdir(images_dir):
        if f_name.startswith(f"{product_id}_"):
            try:
                os.remove(os.path.join(images_dir, f_name))
            except Exception:
                pass

    path_png = os.path.join(images_dir, filename_png)
    path_orig = os.path.join(images_dir, filename_orig)

    # 2. Save original uploaded image
    try:
        logger.info("Saving original uploaded image to: %s", path_orig)
        file.seek(0)
        file.save(path_orig)
    except Exception as e:
        logger.error("Failed to save original product image: %s", e, exc_info=True)
        return jsonify({"success": False, "message": "Failed to save uploaded image."}), 500

    # 3. Run background removal + normalization and save transparent PNG
    try:
        logger.info("Running backend background removal on: %s", path_orig)
        success_bg = remove_background_from_file(path_orig, path_png)
        if not success_bg:
            logger.warning("Background removal failed, falling back to normalizing original image")
            with Image.open(path_orig) as img:
                # Even without background removal, normalize image to standard canvas
                normalized = normalize_product_image(img.convert("RGBA"))
            optimize_and_save(normalized, path_png)
            bg_removed = False
        else:
            bg_removed = True
    except Exception as e:
        logger.error("Error during background removal processing: %s", e, exc_info=True)
        try:
            with Image.open(path_orig) as img:
                # Fallback: normalize and center on 1000x1000 transparent canvas
                normalized = normalize_product_image(img.convert("RGBA"))
            optimize_and_save(normalized, path_png)
        except Exception as fallback_err:
            logger.error("Fallback image conversion also failed: %s", fallback_err, exc_info=True)
            return jsonify({"success": False, "message": "Failed to process product image."}), 500
        bg_removed = False

    # 4. Update database with the transparent PNG filename
    success = db.update_product(product_id, {"image_filename": filename_png})
    if not success:
        logger.error("Failed to update database with image filename")
        return jsonify({"success": False, "message": "Failed to update database."}), 500

    update_catalog_version()

    return jsonify(
        {
            "success": True,
            "message": "Image uploaded successfully"
            + (" (background removed)" if bg_removed else " (background removal unavailable)"),
            "image_filename": filename_png,
            "background_removed": bg_removed,
        }
    )


@products_bp.route("/<product_id>/image/remove-background", methods=["POST"])
@require_admin
@safe_route
def remove_background(product_id):
    """
    Explicitly request background removal for an already-uploaded image.
    This endpoint returns HTTP 503 if the local ONNX model or rembg session is unavailable.
    """
    remove_fn, bg_session = AISessionManager.get_session()
    if remove_fn is None or bg_session is None:
        logger.error("Background removal requested but AI engine is unavailable")
        return (
            jsonify({"success": False, "message": "Background removal engine is unavailable."}),
            503,
        )

    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    filename = product.get("image_filename")
    if not filename:
        raise ValidationError("Product has no image uploaded", code="NO_IMAGE")

    images_dir = os.path.join(config["default"].DATA_DIR, "images")
    file_path = os.path.join(images_dir, filename)

    if not os.path.exists(file_path):
        raise NotFoundError("Image file not found on disk", code="IMAGE_FILE_MISSING")

    # Find the original file if it exists to perform background removal on
    base, _ = os.path.splitext(filename)
    original_found = None
    for f in os.listdir(images_dir):
        if f.startswith(f"{base}_original"):
            original_found = os.path.join(images_dir, f)
            break

    input_path = original_found if original_found else file_path

    try:
        logger.info(
            "Explicit background removal requested for product %s using input: %s",
            product_id,
            input_path,
        )
        success = remove_background_from_file(input_path, file_path)
        if not success:
            raise Exception("AI inference failed")
        logger.info("Explicit background removal completed successfully for product %s", product_id)
    except Exception as e:
        logger.error("Background removal failed for %s: %s", product_id, e, exc_info=True)
        return jsonify({"success": False, "message": "Background removal processing failed."}), 500

    update_catalog_version()

    return jsonify(
        {
            "success": True,
            "message": "Background removed successfully",
            "image_filename": filename,
        }
    )


@products_bp.route("/<product_id>/image", methods=["DELETE"])
@require_admin
@safe_route
def delete_product_image(product_id):
    """Delete product image and all associated files."""
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    filename = product.get("image_filename")
    if filename:
        images_dir = os.path.join(config["default"].DATA_DIR, "images")
        # Remove any files associated with this product (original and main transparent PNG)
        for f_name in os.listdir(images_dir):
            if f_name.startswith(f"{product_id}_"):
                try:
                    os.remove(os.path.join(images_dir, f_name))
                except Exception as e:
                    logger.warning("Error removing file: %s", e)

        db.update_product(product_id, {"image_filename": None})

    update_catalog_version()

    return jsonify({"success": True, "message": "Image deleted successfully"})


@products_bp.route("/<product_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_product(product_id):
    """Soft-delete (deactivate) a product."""
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError(f"Product with ID {product_id} not found", code="PRODUCT_NOT_FOUND")

    is_permanent = request.args.get("permanent", "false").lower() == "true"

    if is_permanent:
        success = db.permanently_delete_product(product_id)
        if not success:
            raise Exception("Failed to permanently delete product")

        filename = product.get("image_filename")
        if filename:
            try:
                images_dir = os.path.join(config["default"].DATA_DIR, "images")
                file_path = os.path.join(images_dir, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass

        update_catalog_version()

        return jsonify({"success": True, "message": "Product permanently deleted"}), 200

    success = db.delete_product(product_id)

    if not success:
        raise Exception("Failed to deactivate product")

    update_catalog_version()

    return (
        jsonify({"success": True, "message": "Product deactivated successfully"}),
        200,
    )
