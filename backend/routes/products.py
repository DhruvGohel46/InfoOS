from flask import Blueprint, request, jsonify
from auth import require_auth
from services.db_service import DatabaseService
from config import config
from error_handler import safe_route, ValidationError, NotFoundError, AuthorizationError
from validators import ProductCreateSchema, ProductUpdateSchema, MarshmallowValidationError
import cache
import os
import re
import logging
from werkzeug.utils import secure_filename
from rembg import remove, new_session
from PIL import Image

logger = logging.getLogger(__name__)

# Initialize rembg session with u2netp (fastest) as requested
# Loading it globally prevents reloading on every request
bg_session = new_session("u2netp")


products_bp = Blueprint('products', __name__, url_prefix='/api/products')
db = DatabaseService()

# Reusable schema instances
_product_create_schema = ProductCreateSchema()
_product_update_schema = ProductUpdateSchema()


@products_bp.route('', methods=['POST'])
@require_auth
@safe_route
def create_product():
    """Create a new product."""
    data = request.get_json()

    try:
        validated = _product_create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid product data: {e.messages}",
            code="PRODUCT_VALIDATION_FAILED"
        )

    name = validated['name']
    price = float(validated['price'])
    category_id = validated.get('category_id')
    category_name = validated.get('category')
    active = validated.get('active', True)

    # If category_id is not provided but name is, find the ID
    if not category_id and category_name:
        cat = db.get_category_by_name(category_name)
        if cat:
            category_id = cat['id']
        else:
            other_cat = db.get_category_by_name('other')
            category_id = other_cat['id'] if other_cat else None

    product_data = {
        'product_id': validated['product_id'],
        'name': name,
        'price': price,
        'category_id': category_id,
        'category': category_name,  # Legacy field
        'active': active
    }

    success = db.create_product(product_data)

    if not success:
        raise ValidationError(
            "Product ID already exists",
            code="PRODUCT_ID_DUPLICATE"
        )

    # Invalidate product caches
    cache.invalidate('products')
    cache.invalidate('products_with_stock')

    return jsonify({
        'success': True,
        'message': 'Product created successfully',
        'product': product_data
    }), 201


@products_bp.route('', methods=['GET'])
@safe_route
def get_all_products():
    """Get all active products (cached)."""
    include_inactive = request.args.get('include_inactive', 'false').lower() == 'true'
    include_deleted = request.args.get('include_deleted', 'false').lower() == 'true'
    include_stock = request.args.get('include_stock', 'false').lower() == 'true'

    # Use cache for common queries
    cache_domain = 'products_with_stock' if include_stock else 'products'
    cache_key = 'all' if include_inactive else 'active'

    products = cache.get(cache_domain, cache_key)
    if products is None:
        if include_stock:
            products = db.get_all_products_with_stock(include_inactive=include_inactive)
        else:
            products = db.get_all_products(include_inactive=include_inactive)
        cache.set(cache_domain, cache_key, products)

    return jsonify({
        'success': True,
        'products': products
    })


@products_bp.route('/<product_id>', methods=['PUT'])
@require_auth
@safe_route
def update_product(product_id):
    """Update an existing product."""
    data = request.get_json()

    try:
        validated = _product_update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="PRODUCT_UPDATE_VALIDATION_FAILED"
        )

    if not validated:
        raise ValidationError(
            "No fields to update. Provide at least one: name, price, category, active, favorite",
            code="NO_UPDATE_FIELDS"
        )

    update_data = {}

    if 'name' in validated:
        update_data['name'] = validated['name']

    if 'price' in validated:
        update_data['price'] = validated['price']

    if 'category_id' in validated:
        update_data['category_id'] = validated['category_id']

    if 'category' in validated:
        category_name = validated['category']
        update_data['category'] = category_name
        cat = db.get_category_by_name(category_name)
        if cat:
            update_data['category_id'] = cat['id']

    if 'active' in validated:
        active = validated['active']
        if isinstance(active, str):
            active = active.lower() in ['true', '1', 'yes']
        update_data['active'] = bool(active)

    if 'favorite' in validated:
        favorite = validated['favorite']
        if isinstance(favorite, str):
            favorite = favorite.lower() in ['true', '1', 'yes']
        update_data['favorite'] = bool(favorite)

    # Handle product name change -> Rename image
    if 'name' in update_data:
        product = db.get_product(product_id)
        if product and product.get('image_filename'):
            old_filename = product['image_filename']
            ext = os.path.splitext(old_filename)[1]
            new_safe_name = get_safe_filename(update_data['name'])
            new_filename = f"{new_safe_name}{ext}"

            if old_filename != new_filename:
                images_dir = os.path.join(config['default'].DATA_DIR, 'images')
                old_path = os.path.join(images_dir, old_filename)
                new_path = os.path.join(images_dir, new_filename)

                if os.path.exists(old_path):
                    try:
                        os.rename(old_path, new_path)
                        update_data['image_filename'] = new_filename
                    except Exception as e:
                        logger.warning(f"Error renaming image: {e}")

    # Update product
    success = db.update_product(product_id, update_data)

    if not success:
        raise NotFoundError(
            f"Product with ID {product_id} not found",
            code="PRODUCT_NOT_FOUND"
        )

    # Invalidate product caches
    cache.invalidate('products')
    cache.invalidate('products_with_stock')

    return jsonify({
        'success': True,
        'message': 'Product updated successfully',
        'product_id': product_id,
        'updated_fields': list(update_data.keys())
    }), 200


@products_bp.route('/<product_id>', methods=['GET'])
@safe_route
def get_product(product_id):
    """Get a specific product by ID."""
    product = db.get_product(product_id)

    if not product:
        raise NotFoundError(
            f"Product with ID {product_id} not found",
            code="PRODUCT_NOT_FOUND"
        )

    return jsonify({
        'success': True,
        'product': product
    }), 200


@products_bp.route('/reset-database', methods=['POST'])
@require_auth
@safe_route
def reset_database():
    """Reset the entire database — requires password authentication."""
    data = request.get_json()

    if not data or 'password' not in data:
        raise ValidationError("Password is required", code="MISSING_PASSWORD")

    RESET_PASSWORD = config['default'].RESET_PASSWORD

    if data['password'] != RESET_PASSWORD:
        raise AuthorizationError("Invalid password", code="INVALID_PASSWORD")

    # Clear all bills
    bills_cleared = db.clear_all_bills()
    products_cleared = db.clear_all_products()

    if not (bills_cleared and products_cleared):
        raise Exception("Failed to reset database")

    return jsonify({
        'success': True,
        'message': 'Database reset successfully - all products and bills have been cleared'
    }), 200


# IMAGE MANAGEMENT ROUTES

def get_safe_filename(product_name):
    """Convert product name to safe filename (lowercase, hyphens)."""
    s = str(product_name).lower().strip()
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s)
    return s

@products_bp.route('/<product_id>/image', methods=['POST'])
@require_auth
@safe_route
def upload_product_image(product_id):
    """Upload product image."""
    if 'image' not in request.files:
        raise ValidationError("No image file provided", code="MISSING_IMAGE")

    file = request.files['image']

    if file.filename == '':
        raise ValidationError("No selected file", code="EMPTY_FILENAME")

    # Get product to get the name
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    # Generate safe filename from product name
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.jpg', '.jpeg', '.png', '.gif', '.webp']:
        raise ValidationError("Invalid image format", code="INVALID_IMAGE_FORMAT")

    safe_name = get_safe_filename(product['name'])
    # Force PNG for background-removed images (supports transparency)
    filename = f"{safe_name}.png"

    # Save file
    images_dir = os.path.join(config['default'].DATA_DIR, 'images')
    os.makedirs(images_dir, exist_ok=True)

    # Remove old image if exists
    if product.get('image_filename'):
        old_path = os.path.join(images_dir, product['image_filename'])
        if os.path.exists(old_path) and product['image_filename'] != filename:
            try:
                os.remove(old_path)
            except Exception:
                pass

    file_path = os.path.join(images_dir, filename)

    # Process image with rembg (u2netp)
    try:
        img = Image.open(file).convert('RGB')
        output = remove(img, session=bg_session)
        output.save(file_path, format='PNG')
    except Exception as e:
        logger.warning(f"Background removal failed: {e}")
        # Fallback: Save original file if processing fails
        file.seek(0)
        img = Image.open(file)
        img.save(file_path, format='PNG')

    # Update DB
    success = db.update_product(product_id, {'image_filename': filename})

    if not success:
        raise Exception("Failed to update database with image filename")

    return jsonify({
        'success': True,
        'message': 'Image uploaded successfully (Background removed)',
        'image_filename': filename
    })

@products_bp.route('/<product_id>/image', methods=['DELETE'])
@require_auth
@safe_route
def delete_product_image(product_id):
    """Delete product image."""
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError("Product not found", code="PRODUCT_NOT_FOUND")

    filename = product.get('image_filename')
    if filename:
        images_dir = os.path.join(config['default'].DATA_DIR, 'images')
        file_path = os.path.join(images_dir, filename)

        if os.path.exists(file_path):
            try:
                os.remove(file_path)
            except Exception as e:
                logger.warning(f"Error removing file: {e}")

        # Update DB
        db.update_product(product_id, {'image_filename': None})

    return jsonify({
        'success': True,
        'message': 'Image deleted successfully'
    })

@products_bp.route('/<product_id>', methods=['DELETE'])
@require_auth
@safe_route
def delete_product(product_id):
    """Soft-delete (deactivate) a product."""
    product = db.get_product(product_id)
    if not product:
        raise NotFoundError(
            f"Product with ID {product_id} not found",
            code="PRODUCT_NOT_FOUND"
        )

    # Check for permanent delete flag
    is_permanent = request.args.get('permanent', 'false').lower() == 'true'

    if is_permanent:
        # Verify Password
        provided_password = request.headers.get('x-admin-password')
        RESET_PASSWORD = config['default'].RESET_PASSWORD

        if not provided_password or provided_password != RESET_PASSWORD:
            raise AuthorizationError(
                "Invalid admin password. Permanent deletion requires authorization.",
                code="INVALID_PASSWORD"
            )

        success = db.permanently_delete_product(product_id)
        if not success:
            raise Exception("Failed to permanently delete product")

        # Also try to remove image
        filename = product.get('image_filename')
        if filename:
            try:
                images_dir = os.path.join(config['default'].DATA_DIR, 'images')
                file_path = os.path.join(images_dir, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception:
                pass

        return jsonify({
            'success': True,
            'message': 'Product permanently deleted'
        }), 200

    # Default: Deactivate (Soft Delete)
    success = db.delete_product(product_id)

    if not success:
        raise Exception("Failed to deactivate product")

    return jsonify({
        'success': True,
        'message': 'Product deactivated successfully'
    }), 200
