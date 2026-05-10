from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime
import logging
from .models import SessionLocal, Reminder, ReminderStatus
from .websocket import notify_reminder
from sqlalchemy import and_

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def check_reminders():
    """Periodic task to check pending reminders and trigger them."""
    db = SessionLocal()
    now = datetime.utcnow()
    try:
        # Query reminders: status = pending AND reminder_time <= now
        reminders = (
            db.query(Reminder)
            .filter(and_(Reminder.status == ReminderStatus.PENDING, Reminder.reminder_time <= now))
            .all()
        )

        for reminder in reminders:
            logger.info(f"Triggering reminder: {reminder.title} (ID: {reminder.id})")

            # 1. Update status
            reminder.status = ReminderStatus.TRIGGERED
            reminder.triggered_at = now

            # 2. Get user_id and dict format
            user_id = reminder.user_id
            reminder_data = reminder.to_dict()

            # 3. Commit change to persistence layer
            db.commit()

            # 4. Notify via WebView/WebSocket
            await notify_reminder(user_id, reminder_data)

            logger.info(f"Reminder {reminder.id} status set to TRIGGERED and notified.")

    except Exception as e:
        logger.error(f"Error in scheduler task check_reminders: {e}")
        db.rollback()
    finally:
        db.close()


def start_scheduler():
    """Initialize and start the background scheduler."""
    if not scheduler.running:
        scheduler.add_job(
            check_reminders,
            IntervalTrigger(seconds=10),
            id="reminder_check",
            name="Check pending reminders every 10s",
            replace_existing=True,
        )
        scheduler.start()
        logger.info("📅 Background scheduler started - Checking reminders every 10s")
