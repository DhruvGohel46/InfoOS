"""
=============================================================================
 BUSINESS DAY ROUTES — routes/business_day.py
=============================================================================

 API endpoints for managing the operational business day cutoff time,
 turnover rules, 30-minute post-closing safety buffer, and temporary
 date-range overrides (e.g. festival hours).
=============================================================================
"""

from flask import Blueprint, request, jsonify
from auth import require_admin
from error_handler import safe_route, ValidationError
from services.business_day_service import (
    BusinessDayService,
    DEFAULT_CUTOFF_TIME,
    DEFAULT_OPEN_TIME,
    DEFAULT_CLOSE_TIME,
    compute_effective_cutoff,
    format_time_obj,
)

business_day_bp = Blueprint("business_day", __name__, url_prefix="/api/business-day")


@business_day_bp.route("/status", methods=["GET"])
@safe_route
def get_business_day_status():
    """Get live operational business day status, current shift date, and turnover countdown."""
    status = BusinessDayService.get_status()
    return jsonify({"success": True, **status}), 200


@business_day_bp.route("/settings", methods=["GET"])
@safe_route
def get_business_day_settings():
    """Get business day configuration, default times, and all schedule overrides."""
    cutoff = BusinessDayService.get_setting("business_day_cutoff_time", DEFAULT_CUTOFF_TIME)
    open_time = BusinessDayService.get_setting("business_day_open_time", DEFAULT_OPEN_TIME)
    close_time = BusinessDayService.get_setting("business_day_close_time", DEFAULT_CLOSE_TIME)
    overrides = BusinessDayService.get_all_overrides()

    effective_cutoff = compute_effective_cutoff(close_time, cutoff)

    return (
        jsonify(
            {
                "success": True,
                "cutoff_time": cutoff,
                "effective_cutoff_time": format_time_obj(effective_cutoff),
                "open_time": open_time,
                "close_time": close_time,
                "buffer_applied": format_time_obj(effective_cutoff) != cutoff,
                "overrides": overrides,
            }
        ),
        200,
    )


@business_day_bp.route("/settings", methods=["POST", "PUT"])
@require_admin
@safe_route
def update_business_day_settings():
    """Update default business day cutoff and shop hours."""
    data = request.get_json() or {}

    cutoff = data.get("cutoff_time")
    open_t = data.get("open_time")
    close_t = data.get("close_time")

    if cutoff is not None:
        BusinessDayService.set_setting("business_day_cutoff_time", str(cutoff).strip())
    if open_t is not None:
        BusinessDayService.set_setting("business_day_open_time", str(open_t).strip())
    if close_t is not None:
        BusinessDayService.set_setting("business_day_close_time", str(close_t).strip())

    status = BusinessDayService.get_status()
    return (
        jsonify(
            {
                "success": True,
                "message": "Business day settings updated successfully.",
                "status": status,
                "settings": status,
            }
        ),
        200,
    )


@business_day_bp.route("/overrides", methods=["GET"])
@safe_route
def list_overrides():
    """List all configured schedule overrides."""
    overrides = BusinessDayService.get_all_overrides()
    return jsonify({"success": True, "overrides": overrides}), 200


@business_day_bp.route("/overrides", methods=["POST"])
@require_admin
@safe_route
def add_or_update_override():
    """Create or update a temporary date-range schedule override."""
    data = request.get_json() or {}
    name = (data.get("name") or "").strip()
    s_date = (data.get("start_date") or "").strip()
    e_date = (data.get("end_date") or "").strip()

    if not name:
        raise ValidationError("Override name/reason is required.", code="MISSING_NAME")
    if not s_date or not e_date:
        raise ValidationError(
            "Both start_date and end_date are required (YYYY-MM-DD).", code="MISSING_DATES"
        )

    saved_item = BusinessDayService.add_or_update_override(data)
    return (
        jsonify(
            {
                "success": True,
                "message": f"Temporary schedule '{name}' saved successfully.",
                "override": saved_item,
            }
        ),
        200,
    )


@business_day_bp.route("/overrides/<string:override_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_override(override_id):
    """Delete a temporary schedule override."""
    deleted = BusinessDayService.delete_override(override_id)
    if not deleted:
        raise ValidationError(f"Override '{override_id}' not found.", code="NOT_FOUND")

    return (
        jsonify(
            {
                "success": True,
                "message": f"Override '{override_id}' deleted successfully.",
            }
        ),
        200,
    )
