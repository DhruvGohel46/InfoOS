from flask import Blueprint, request, jsonify
from auth import require_auth
from services.db_service import DatabaseService
from config import config
from error_handler import safe_route, ValidationError, NotFoundError
from validators import (
    CategoryCreateSchema,
    CategoryUpdateSchema,
    MarshmallowValidationError,
)
import cache
import logging

logger = logging.getLogger(__name__)

categories_bp = Blueprint("categories", __name__, url_prefix="/api/categories")
db = DatabaseService()

_create_schema = CategoryCreateSchema()
_update_schema = CategoryUpdateSchema()


@categories_bp.route("", methods=["GET"])
@safe_route
def get_categories():
    """Get all categories (cached)."""
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    cache_key = "all" if include_inactive else "active"

    categories = cache.get("categories", cache_key)
    if categories is None:
        categories = db.get_all_categories(include_inactive=include_inactive)
        cache.set("categories", cache_key, categories)

    return jsonify({"success": True, "categories": categories}), 200


@categories_bp.route("", methods=["POST"])
@require_auth
@safe_route
def create_category():
    """Create a new category."""
    data = request.get_json()

    try:
        validated = _create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid category data: {e.messages}", code="CATEGORY_VALIDATION_FAILED"
        )

    name = validated["name"].strip()

    # Check if category already exists
    existing = db.get_category_by_name(name)
    if existing:
        raise ValidationError(
            f'Category "{name}" already exists', code="CATEGORY_DUPLICATE"
        )

    category_id = db.create_category(
        {
            "name": name,
            "description": validated.get("description", ""),
            "active": validated.get("active", True),
        }
    )

    if not category_id:
        raise Exception("Failed to create category")

    cache.invalidate("categories")
    return (
        jsonify(
            {
                "success": True,
                "message": "Category created successfully",
                "category_id": category_id,
            }
        ),
        201,
    )


@categories_bp.route("/<int:category_id>", methods=["PUT"])
@require_auth
@safe_route
def update_category(category_id):
    """Update a category."""
    data = request.get_json()

    try:
        validated = _update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="CATEGORY_UPDATE_VALIDATION_FAILED",
        )

    if "name" in validated:
        existing = db.get_category_by_name(validated["name"].strip())
        if existing and existing["id"] != category_id:
            raise ValidationError(
                f'Category "{validated["name"]}" already exists',
                code="CATEGORY_DUPLICATE",
            )

    success = db.update_category(category_id, validated)

    if not success:
        raise NotFoundError(
            "Category not found or no changes made", code="CATEGORY_NOT_FOUND"
        )

    cache.invalidate("categories")
    return jsonify({"success": True, "message": "Category updated successfully"}), 200


@categories_bp.route("/<int:category_id>", methods=["DELETE"])
@require_auth
@safe_route
def delete_category(category_id):
    """Securely remove or deactivate a category."""
    usage = db.is_category_used(category_id)

    if usage["used"]:
        db.update_category(category_id, {"active": False})
        return (
            jsonify(
                {
                    "success": True,
                    "message": f'Category is {usage["reason"]} and cannot be removed. It has been deactivated instead.',
                    "action": "deactivated",
                }
            ),
            200,
        )
    else:
        success = db.delete_category(category_id)
        if not success:
            raise NotFoundError("Category not found", code="CATEGORY_NOT_FOUND")

        return (
            jsonify(
                {
                    "success": True,
                    "message": "Category removed successfully",
                    "action": "removed",
                }
            ),
            200,
        )


@categories_bp.route("/<int:category_id>/usage", methods=["GET"])
@safe_route
def check_category_usage(category_id):
    """Check if category is used."""
    usage = db.is_category_used(category_id)
    return jsonify({"success": True, "usage": usage}), 200
