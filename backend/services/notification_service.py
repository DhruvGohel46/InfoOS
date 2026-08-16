import json
import logging
from datetime import datetime, timedelta
import uuid
from sqlalchemy import or_, func, desc
from models import db, Notification, Reminder, Settings

logger = logging.getLogger(__name__)


class NotificationService:
    @staticmethod
    def get_notifications(
        user_id="admin", status=None, notif_type=None, search=None, limit=100, offset=0
    ):
        """Retrieve notifications with optional filtering, search, and pagination."""
        try:
            NotificationService.auto_cleanup()
        except Exception as e:
            logger.warning(f"Notification auto-cleanup error during get: {e}")

        query = Notification.query
        if user_id:
            query = query.filter(
                or_(
                    Notification.user_id == user_id,
                    Notification.user_id.is_(None),
                    Notification.user_id == "",
                )
            )

        if status:
            if status == "active":
                query = query.filter(Notification.status.in_(["unread", "read"]))
            else:
                query = query.filter(Notification.status == status)

        if notif_type:
            if notif_type in ["unread", "completed", "dismissed", "read"]:
                query = query.filter(Notification.status == notif_type)
            elif notif_type == "errors":
                query = query.filter(Notification.priority.in_(["error", "critical"]))
            elif notif_type == "system":
                query = query.filter(
                    Notification.type.in_(["system", "backup", "sync", "db", "license"])
                )
            elif notif_type in ["reminder", "reminders"]:
                query = query.filter(Notification.type.in_(["reminder", "reminders"]))
            elif notif_type == "updates":
                query = query.filter(Notification.type == "update")
            else:
                query = query.filter(Notification.type == notif_type)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(Notification.title.ilike(search_term), Notification.message.ilike(search_term))
            )

        total_count = query.count()
        unread_count = Notification.query.filter(
            or_(
                Notification.user_id == user_id,
                Notification.user_id.is_(None),
                Notification.user_id == "",
            ),
            Notification.status == "unread",
        ).count()

        items = query.order_by(desc(Notification.created_at)).offset(offset).limit(limit).all()

        return {
            "notifications": [item.to_dict() for item in items],
            "total_count": total_count,
            "unread_count": unread_count,
        }

    @staticmethod
    def create_notification(data):
        """Create and persist a new notification."""
        title = data.get("title")
        message = data.get("message")
        if not title or not message:
            raise ValueError("Notification title and message are required.")

        notif_type = data.get("type", "system")
        priority = data.get("priority", "info")
        source = data.get("source", "system")
        related_id = data.get("related_id")
        action_route = data.get("action_route")
        user_id = data.get("user_id", "admin")

        meta = data.get("metadata")
        meta_json = json.dumps(meta) if meta else None

        new_notif = Notification(
            id=data.get("id") or str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            message=message,
            type=notif_type,
            priority=priority,
            status=data.get("status", "unread"),
            source=source,
            related_id=related_id,
            action_route=action_route,
            metadata_json=meta_json,
        )

        db.session.add(new_notif)
        db.session.commit()
        logger.info(f"Notification created: [{priority.upper()}] {title}")
        return new_notif

    @staticmethod
    def update_status(notification_id, status):
        """Update notification status: 'read', 'completed', or 'dismissed'."""
        notif = Notification.query.get(notification_id)
        if not notif:
            return None

        now = datetime.now()
        notif.status = status

        if status == "read":
            notif.read_at = now
        elif status == "completed":
            notif.completed_at = now
            # If linked to a Reminder, also complete the Reminder record
            if notif.related_id:
                reminder = Reminder.query.get(notif.related_id)
                if reminder:
                    reminder.status = "completed"
                    reminder.is_active = False
                    reminder.is_dismissed = True
        elif status == "dismissed":
            notif.dismissed_at = now

        db.session.commit()
        return notif

    @staticmethod
    def mark_all_read(user_id="admin"):
        """Mark all unread notifications as read."""
        now = datetime.now()
        unreads = Notification.query.filter_by(user_id=user_id, status="unread").all()
        for n in unreads:
            n.status = "read"
            n.read_at = now
        db.session.commit()
        return len(unreads)

    @staticmethod
    def delete_notification(notification_id):
        """Delete a single notification."""
        notif = Notification.query.get(notification_id)
        if notif:
            db.session.delete(notif)
            db.session.commit()
            return True
        return False

    @staticmethod
    def auto_cleanup():
        """
        Run auto-cleanup:
        1. Automatically remove all bill creation/transaction notifications older than 1 hour.
        2. Clean up other notifications based on notification_retention setting (7, 30, 90 days, or never).
        """
        deleted_count = 0
        now = datetime.now()

        # 1. Automatically purge bill notifications older than 1 hour
        bill_cutoff = now - timedelta(hours=1)
        expired_bills = Notification.query.filter(
            or_(
                Notification.type.in_(["billing", "bill"]),
                Notification.title.ilike("%bill%"),
                Notification.message.ilike("%bill%"),
            ),
            Notification.created_at < bill_cutoff,
        ).all()

        for b in expired_bills:
            db.session.delete(b)
            deleted_count += 1

        # 2. General retention cleanup
        retention_setting = Settings.query.filter_by(key="notification_retention").first()
        retention_val = retention_setting.value if retention_setting else "30"

        if retention_val != "never" and retention_val:
            try:
                days = int(retention_val)
                cutoff = now - timedelta(days=days)
                expired = Notification.query.filter(Notification.created_at < cutoff).all()
                for n in expired:
                    db.session.delete(n)
                    deleted_count += 1
            except (ValueError, TypeError):
                pass

        if deleted_count > 0:
            db.session.commit()
            logger.info(
                f"Auto-cleaned {deleted_count} expired notifications (including bill notifications > 1 hour)."
            )

        return deleted_count

    @staticmethod
    def clear_all(user_id="admin"):
        """Delete all notifications for the user."""
        query = Notification.query
        if user_id:
            query = query.filter(
                or_(
                    Notification.user_id == user_id,
                    Notification.user_id.is_(None),
                    Notification.user_id == "",
                )
            )
        count = query.delete(synchronize_session=False)
        db.session.commit()
        logger.info(f"Cleared all {count} notifications.")
        return count
