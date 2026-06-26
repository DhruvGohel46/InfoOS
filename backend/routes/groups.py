from flask import Blueprint, request, jsonify
from auth import require_admin
from services.db_service import DatabaseService
from error_handler import safe_route, ValidationError, NotFoundError
from validators import (
    ItemGroupCreateSchema,
    ItemGroupUpdateSchema,
    MarshmallowValidationError,
)
import cache
import logging

logger = logging.getLogger(__name__)

groups_bp = Blueprint("groups", __name__, url_prefix="/api/groups")
db = DatabaseService()

_create_schema = ItemGroupCreateSchema()
_update_schema = ItemGroupUpdateSchema()


@groups_bp.route("", methods=["GET"])
@safe_route
def get_groups():
    """Get all item groups (cached)."""
    include_inactive = request.args.get("include_inactive", "false").lower() == "true"
    cache_key = "all" if include_inactive else "active"

    groups = cache.get("groups", cache_key)
    if groups is None:
        groups = db.get_all_groups(include_inactive=include_inactive)
        cache.set("groups", cache_key, groups)

    return jsonify({"success": True, "groups": groups}), 200


@groups_bp.route("", methods=["POST"])
@require_admin
@safe_route
def create_group():
    """Create a new item group."""
    data = request.get_json()

    try:
        validated = _create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(f"Invalid group data: {e.messages}", code="GROUP_VALIDATION_FAILED")

    name = validated["name"].strip()
    org_id = validated.get("organization_id", "default")

    # Check unique constraint
    existing = db.get_group_by_name(name, org_id)
    if existing:
        raise ValidationError(f'Group "{name}" already exists', code="GROUP_DUPLICATE")

    group_id = db.create_group(
        {
            "organization_id": org_id,
            "name": name,
            "description": validated.get("description", ""),
            "display_order": validated.get("display_order", 0),
            "color": validated.get("color", ""),
            "icon": validated.get("icon", ""),
            "is_active": validated.get("is_active", True),
        }
    )

    if not group_id:
        raise Exception("Failed to create group")

    cache.invalidate("groups")
    return (
        jsonify(
            {
                "success": True,
                "message": "Group created successfully",
                "group_id": group_id,
            }
        ),
        201,
    )


@groups_bp.route("/<int:group_id>", methods=["PUT"])
@require_admin
@safe_route
def update_group(group_id):
    """Update an existing item group."""
    data = request.get_json()

    try:
        validated = _update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}",
            code="GROUP_UPDATE_VALIDATION_FAILED",
        )

    # Check if name is changing and duplicate name exists
    if "name" in validated:
        name = validated["name"].strip()
        org_id = validated.get("organization_id", "default")
        existing = db.get_group_by_name(name, org_id)
        if existing and existing["id"] != group_id:
            raise ValidationError(
                f'Group "{name}" already exists',
                code="GROUP_DUPLICATE",
            )

    success = db.update_group(group_id, validated)
    if not success:
        raise NotFoundError("Group not found or no changes made", code="GROUP_NOT_FOUND")

    cache.invalidate("groups")
    return jsonify({"success": True, "message": "Group updated successfully"}), 200


@groups_bp.route("/<int:group_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_group(group_id):
    """Soft delete an item group, dealing with active categories if present."""
    group = db.get_group(group_id)
    if not group:
        raise NotFoundError("Group not found", code="GROUP_NOT_FOUND")

    action = request.args.get("action")
    categories_count = group.get("categories_count", 0)

    if categories_count > 0 and not action:
        # Prompt UI for choices since categories exist in this group
        return (
            jsonify(
                {
                    "success": False,
                    "code": "GROUP_HAS_CATEGORIES",
                    "message": "This group contains active categories",
                    "categories_count": categories_count,
                }
            ),
            400,
        )

    if action == "move":
        move_to = request.args.get("move_to")
        if not move_to:
            raise ValidationError(
                "Destination group ID (move_to) is required to move categories.",
                code="MOVE_TARGET_REQUIRED",
            )
        try:
            target_group_id = int(move_to)
        except ValueError:
            raise ValidationError(
                "Invalid destination group ID.",
                code="INVALID_MOVE_TARGET",
            )

        target_group = db.get_group(target_group_id)
        if not target_group:
            raise NotFoundError(
                "Destination group not found.",
                code="MOVE_TARGET_NOT_FOUND",
            )

        db.move_categories(group_id, target_group_id)
        logger.info(f"Moved categories from group {group_id} to group {target_group_id}")

    elif action == "remove":
        db.remove_group_assignment(group_id)
        logger.info(f"Removed group assignment from categories in group {group_id}")

    # Now soft delete the group
    success = db.delete_group(group_id)
    if not success:
        raise Exception("Failed to delete group")

    # Invalidate categories cache too, since categories' group mappings changed
    cache.invalidate("groups")
    cache.invalidate("categories")

    return (
        jsonify(
            {
                "success": True,
                "message": "Group removed successfully",
                "action": "removed",
            }
        ),
        200,
    )


@groups_bp.route("/<int:group_id>/categories", methods=["GET"])
@safe_route
def get_group_categories(group_id):
    """Get all categories under this group."""
    group = db.get_group(group_id)
    if not group:
        raise NotFoundError("Group not found", code="GROUP_NOT_FOUND")

    all_categories = db.get_all_categories(include_inactive=True)
    group_categories = [c for c in all_categories if c.get("group_id") == group_id]

    return jsonify({"success": True, "categories": group_categories}), 200
