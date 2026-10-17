from flask import Blueprint, jsonify, request
from services.profile_service import ProfileService
from error_handler import safe_route, ValidationError
import cache
import logging

logger = logging.getLogger(__name__)

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/api/profile", methods=["GET"])
@safe_route
def get_profile():
    """Retrieve full shop profile and generated AI grounding context from profile.db."""
    profile_data = ProfileService.get_profile()
    ai_context = ProfileService.get_ai_system_context()
    return jsonify({"success": True, "profile": profile_data, "ai_context": ai_context})


@profile_bp.route("/api/profile", methods=["PUT"])
@safe_route
def update_profile():
    """Update shop profile in profile.db and synchronize with settings."""
    data = request.json
    if not data or not isinstance(data, dict):
        raise ValidationError("Profile data must be a JSON object", code="INVALID_DATA")

    updated_profile = ProfileService.update_profile(data)
    cache.invalidate("settings")

    return jsonify(
        {
            "success": True,
            "message": "Shop profile updated successfully",
            "profile": updated_profile,
            "ai_context": ProfileService.get_ai_system_context(),
        }
    )
