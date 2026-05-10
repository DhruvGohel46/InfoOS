from .models import SessionLocal, Reminder, ReminderStatus, RepeatType
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)


def create_reminder(data: dict):
    db = SessionLocal()
    try:
        new_reminder = Reminder(
            title=data.get("title"),
            description=data.get("description"),
            reminder_time=datetime.fromisoformat(data["reminder_time"]),
            repeat_type=data.get("repeat_type", RepeatType.NONE),
            user_id=data.get("user_id", "admin") or "admin",  # Default for now
        )
        db.add(new_reminder)
        db.commit()
        db.refresh(new_reminder)
        logger.info(f"Reminder created: {new_reminder.title}")
        return new_reminder.to_dict()
    except Exception as e:
        logger.error(f"Error creating reminder: {e}")
        db.rollback()
        raise e
    finally:
        db.close()


def get_user_reminders(user_id: str, include_dismissed=False):
    db = SessionLocal()
    try:
        query = db.query(Reminder).filter(Reminder.user_id == user_id)
        if not include_dismissed:
            query = query.filter(Reminder.is_dismissed == False)

        reminders = query.order_by(Reminder.reminder_time.asc()).all()
        return [r.to_dict() for r in reminders]
    finally:
        db.close()


def snooze_reminder(reminder_id: str, minutes: int):
    """Snooze a reminder: update time and set status back to PENDING."""
    db = SessionLocal()
    try:
        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        if not reminder:
            return None

        new_time = datetime.utcnow() + timedelta(minutes=minutes)
        reminder.reminder_time = new_time
        reminder.status = ReminderStatus.PENDING
        reminder.is_dismissed = False

        db.commit()
        logger.info(f"Reminder {reminder_id} snoozed for {minutes}m")
        return reminder.to_dict()
    finally:
        db.close()


def dismiss_reminder(reminder_id: str):
    """Mark a reminder as dismissed/completed."""
    db = SessionLocal()
    try:
        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        if not reminder:
            return None

        reminder.status = ReminderStatus.COMPLETED
        reminder.is_dismissed = True

        db.commit()
        logger.info(f"Reminder {reminder_id} dismissed.")
        return reminder.to_dict()
    finally:
        db.close()


def delete_reminder(reminder_id: str):
    db = SessionLocal()
    try:
        reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
        if reminder:
            db.delete(reminder)
            db.commit()
            return True
        return False
    finally:
        db.close()
