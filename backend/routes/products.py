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

# ─── rembg Lazy & Async Loader ───────────────────────────────────────────────
# rembg / onnxruntime are heavy ML dependencies.
# They are OPTIONAL: production installs include them for background removal,
# but CI / lightweight deploys intentionally omit them.
# The first call to new_session downloads the u2netp model (~100MB) from GitHub,
# which can block the request thread and trigger client-side timeouts.
# We perform this asynchronously in a background thread during module import.

_rembg_session = None
_rembg_available = None
_rembg_loading = False


def warmup_rembg():
    """Warms up the rembg model session in a background thread."""
    global _rembg_session, _rembg_available, _rembg_loading
    if _rembg_available is not None or _rembg_loading:
        return

    _rembg_loading = True

    def _load():
        global _rembg_session, _rembg_available, _rembg_loading
        try:
            logger.info("Starting background loading/download of rembg ONNX model...")
            from rembg import remove, new_session

            session = new_session("u2netp")
            _rembg_session = session
            _rembg_available = True
            logger.info("rembg loaded successfully — background removal enabled")
        except ImportError:
            _rembg_available = False
            logger.warning("rembg dependency not installed — background removal disabled")
        except Exception as exc:
            _rembg_available = False
            logger.error("rembg initialisation failed: %s", exc)
        finally:
            _rembg_loading = False

    threading.Thread(target=_load, daemon=True).start()


# Trigger warmup immediately on module load so the model starts downloading
# in the background on server boot instead of the first user upload.
# Skip during testing — the daemon thread outlives the test process and crashes
# the interpreter on shutdown (numba JIT logging writes to closed stderr).
if not os.environ.get("TESTING"):
    warmup_rembg()


def get_rembg():
    """
    Lazy-load rembg and return (remove_fn, session).

    Returns (None, None) immediately if background removal is loading,
    not installed, or failed, ensuring request threads never block on model downloads.
    """
    global _rembg_session, _rembg_available, _rembg_loading

    if _rembg_available is False or _rembg_loading:
        return None, None

    if _rembg_available is True and _rembg_session is not None:
        from rembg import remove

        return remove, _rembg_session

    if _rembg_available is None and not _rembg_loading:
        warmup_rembg()

    return None, None


def _rembg_unavailable_response():
    """Standard 503 response when rembg is absent."""
    current_app.logger.warning("rembg dependency not installed — returning 503")
    return (
        jsonify(
            {
                "success": False,
                "message": "Background removal service is unavailable",
                "hint": "rembg / onnxruntime are not installed on this server",
            }
        ),
        503,
    )


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
    Upload a product image.

    If rembg is installed the background is automatically removed (u2netp model).
    If rembg is absent the original image is saved as-is — the endpoint still
    succeeds rather than returning 503, because saving without background
    removal is a valid degraded-mode operation.
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

    safe_name = get_safe_filename(product["name"])
    filename = f"{safe_name}.png"

    images_dir = os.path.join(config["default"].DATA_DIR, "images")
    os.makedirs(images_dir, exist_ok=True)

    # Remove old image if a different one exists
    if product.get("image_filename"):
        old_path = os.path.join(images_dir, product["image_filename"])
        if os.path.exists(old_path) and product["image_filename"] != filename:
            try:
                os.remove(old_path)
            except Exception:
                pass

    file_path = os.path.join(images_dir, filename)

    # ── Attempt background removal via lazy-loaded rembg ──────────────────
    remove_fn, bg_session = get_rembg()

    if remove_fn is not None:
        try:
            img = Image.open(file).convert("RGB")
            output = remove_fn(img, session=bg_session)
            output.save(file_path, format="PNG")
            bg_removed = True
            logger.info("Background removal successful for product %s", product_id)
        except Exception as e:
            logger.warning("Background removal failed, saving original: %s", e)
            file.seek(0)
            img = Image.open(file)
            img.save(file_path, format="PNG")
            bg_removed = False
    else:
        # rembg not installed — save original without background removal
        current_app.logger.warning("rembg not installed — saving image without background removal")
        logger.warning("Background removal unavailable - rembg library not loaded")
        file.seek(0)
        img = Image.open(file)
        img.save(file_path, format="PNG")
        bg_removed = False

    success = db.update_product(product_id, {"image_filename": filename})

    if not success:
        raise Exception("Failed to update database with image filename")

    update_catalog_version()

    return jsonify(
        {
            "success": True,
            "message": "Image uploaded successfully"
            + (" (background removed)" if bg_removed else " (background removal unavailable)"),
            "image_filename": filename,
            "background_removed": bg_removed,
        }
    )


@products_bp.route("/<product_id>/image/remove-background", methods=["POST"])
@require_admin
@safe_route
def remove_background(product_id):
    """
    Explicitly request background removal for an already-uploaded image.

    This endpoint returns HTTP 503 if rembg is not installed — unlike the
    upload endpoint which degrades gracefully.
    """
    remove_fn, bg_session = get_rembg()

    if remove_fn is None:
        logger.error("Background removal requested but rembg is not available")
        return _rembg_unavailable_response()

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

    try:
        logger.info("Starting background removal for product %s", product_id)
        img = Image.open(file_path).convert("RGB")
        output = remove_fn(img, session=bg_session)
        output.save(file_path, format="PNG")
        logger.info("Background removal completed successfully for product %s", product_id)
    except Exception as e:
        logger.error("Background removal failed for %s: %s", product_id, e)
        raise Exception("Background removal processing failed")

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
    """Delete product image."""
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    filename = product.get("image_filename")
    if filename:
        images_dir = os.path.join(config["default"].DATA_DIR, "images")
        file_path = os.path.join(images_dir, filename)

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
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
        provided_password = request.headers.get("x-admin-password")

        from auth import verify_admin_pin

        if not provided_password or not verify_admin_pin(provided_password):
            raise AuthorizationError(
                "Invalid Owner PIN. Permanent deletion requires authorization.",
                code="INVALID_PASSWORD",
            )

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
