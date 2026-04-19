from flask import Blueprint, jsonify, request
from auth import require_auth
from services.db_service import DatabaseService
from error_handler import safe_route, ValidationError
import cache
import logging

logger = logging.getLogger(__name__)

settings_bp = Blueprint('settings', __name__)
db_service = DatabaseService()

@settings_bp.route('/api/settings', methods=['GET'])
@safe_route
def get_settings():
    """Get all settings (cached)."""
    settings = cache.get('settings', 'all')
    if settings is None:
        settings = db_service.get_all_settings()
        cache.set('settings', 'all', settings)
    return jsonify(settings)

@settings_bp.route('/api/settings', methods=['PUT'])
@require_auth
@safe_route
def update_settings():
    """Update settings (bulk or single)."""
    data = request.json
    if not data:
        raise ValidationError("No data provided", code="MISSING_DATA")

    # Check if it's a list or a dict
    if isinstance(data, list):
        success = db_service.update_settings_bulk(data)
    elif isinstance(data, dict):
        settings_list = [{'key': k, 'value': v} for k, v in data.items()]
        success = db_service.update_settings_bulk(settings_list)
    else:
        raise ValidationError("Invalid data format", code="INVALID_FORMAT")

    if not success:
        raise Exception("Failed to update settings")

    cache.invalidate('settings')
    return jsonify({
        'success': True,
        'message': 'Settings updated successfully'
    })
