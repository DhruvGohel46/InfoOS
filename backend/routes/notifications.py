from flask import Blueprint, request, jsonify
from services.notification_service import NotificationService
from error_handler import safe_route, ValidationError, NotFoundError
import logging

logger = logging.getLogger(__name__)

notifications_bp = Blueprint("notifications", __name__)


@notifications_bp.route("/api/notifications", methods=["GET"])
@safe_route
def get_notifications():
    """Get all notifications with optional status, type, and search filters."""
    status = request.args.get("status")
    notif_type = request.args.get("type")
    search = request.args.get("search")
    limit = int(request.args.get("limit", 100))
    offset = int(request.args.get("offset", 0))

    data = NotificationService.get_notifications(
        user_id="admin",
        status=status,
        notif_type=notif_type,
        search=search,
        limit=limit,
        offset=offset,
    )
    return jsonify({"success": True, **data})


@notifications_bp.route("/api/notifications", methods=["POST"])
@safe_route
def create_notification():
    """Create a new notification."""
    data = request.json or {}
    if not data.get("title") or not data.get("message"):
        raise ValidationError("Title and message are required.", code="INVALID_NOTIFICATION_DATA")

    notif = NotificationService.create_notification(data)
    return jsonify({"success": True, "notification": notif.to_dict()}), 201


@notifications_bp.route("/api/notifications/<notification_id>/status", methods=["PUT"])
@safe_route
def update_notification_status(notification_id):
    """Update notification status: 'read', 'completed', or 'dismissed'."""
    data = request.json or {}
    status = data.get("status")
    if status not in ["read", "completed", "dismissed", "unread"]:
        raise ValidationError("Invalid notification status.", code="INVALID_STATUS")

    notif = NotificationService.update_status(notification_id, status)
    if not notif:
        raise NotFoundError("Notification not found.", code="NOTIFICATION_NOT_FOUND")

    return jsonify({"success": True, "notification": notif.to_dict()})


@notifications_bp.route("/api/notifications/mark-all-read", methods=["POST"])
@safe_route
def mark_all_read():
    """Mark all unread notifications as read."""
    count = NotificationService.mark_all_read(user_id="admin")
    return jsonify({"success": True, "count": count})


@notifications_bp.route("/api/notifications/cleanup", methods=["POST"])
@safe_route
def run_cleanup():
    """Run notification auto cleanup based on retention settings."""
    count = NotificationService.auto_cleanup()
    return jsonify({"success": True, "deleted_count": count})


@notifications_bp.route("/api/notifications/clear-all", methods=["POST", "DELETE"])
@notifications_bp.route("/api/notifications/clear", methods=["POST", "DELETE"])
@notifications_bp.route("/api/notifications", methods=["DELETE"])
@safe_route
def clear_all_notifications():
    """Clear and delete all notifications."""
    count = NotificationService.clear_all(user_id="admin")
    return jsonify({"success": True, "count": count, "message": f"Cleared {count} notifications."})


@notifications_bp.route("/api/notifications/<notification_id>", methods=["DELETE", "POST"])
@safe_route
def delete_notification(notification_id):
    """Delete a single notification or clear all if special ID passed."""
    if notification_id in ["clear-all", "clear", "all"]:
        count = NotificationService.clear_all(user_id="admin")
        return jsonify(
            {"success": True, "count": count, "message": f"Cleared {count} notifications."}
        )

    success = NotificationService.delete_notification(notification_id)
    if not success:
        raise NotFoundError("Notification not found.", code="NOTIFICATION_NOT_FOUND")
    return jsonify({"success": True, "message": "Notification deleted."})
