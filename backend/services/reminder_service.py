"""
REMINDER SERVICE - Production-ready reminder system with APScheduler
Handles reminder scheduling, triggering, and real-time notifications
"""

import logging
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.date import DateTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.events import EVENT_JOB_EXECUTED, EVENT_JOB_ERROR
from flask import current_app
from models import db, Reminder
from sqlalchemy import and_

# Configure logging
logger = logging.getLogger(__name__)


class ReminderService:
    """Production-ready reminder service with APScheduler integration"""

    def __init__(self, app=None):
        self.scheduler = None
        self.app = app
        self._active_reminders = {}

    def init_app(self, app):
        """Initialize the reminder service with Flask app"""
        self.app = app
        self.scheduler = BackgroundScheduler(
            timezone="UTC",
            job_defaults={
                "coalesce": True,  # Combine multiple jobs into one if they're close together
                "max_instances": 1,  # Only run one instance of each job at a time
                "misfire_grace_time": 300,  # Allow 5 minutes grace time for misfired jobs
            },
        )

        # Add event listeners for job monitoring
        self.scheduler.add_listener(self._job_executed, EVENT_JOB_EXECUTED)
        self.scheduler.add_listener(self._job_error, EVENT_JOB_ERROR)

        # Start the scheduler
        self.scheduler.start()
        logger.info("Reminder scheduler started")

        # Load and schedule existing reminders
        with app.app_context():
            self._schedule_all_active_reminders()

    def _job_executed(self, event):
        """Handle successful job execution"""
        logger.info(f"Reminder job executed successfully: {event.job_id}")

    def _job_error(self, event):
        """Handle job execution errors"""
        logger.error(
            f"Reminder job execution error: {event.job_id} - {event.exception}"
        )

    def _schedule_all_active_reminders(self):
        """Schedule all active reminders from database"""
        try:
            reminders = Reminder.query.filter(Reminder.is_active == True).all()
            for reminder in reminders:
                self._schedule_reminder(reminder)
            logger.info(f"Scheduled {len(reminders)} active reminders")
        except Exception as e:
            logger.error(f"Error scheduling reminders: {e}")

    def _schedule_reminder(self, reminder: Reminder):
        """Schedule a single reminder"""
        try:
            job_id = f"reminder_{reminder.id}"

            # Remove existing job if it exists
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)

            # Calculate next trigger time
            trigger_time = self._calculate_next_trigger_time(reminder)
            if not trigger_time or trigger_time <= datetime.utcnow():
                logger.warning(
                    f"Reminder {reminder.id} has invalid or past trigger time"
                )
                return

            # Create appropriate trigger
            if reminder.repeat_type == "once":
                trigger = DateTrigger(run_date=trigger_time)
            elif reminder.repeat_type == "daily":
                trigger = IntervalTrigger(
                    days=1, start_date=trigger_time, timezone="UTC"
                )
            else:
                logger.error(f"Unknown repeat type: {reminder.repeat_type}")
                return

            # Schedule the job
            self.scheduler.add_job(
                func=self._trigger_reminder,
                trigger=trigger,
                args=[reminder.id],
                id=job_id,
                name=f"Reminder: {reminder.title}",
                replace_existing=True,
            )

            self._active_reminders[reminder.id] = {
                "reminder": reminder,
                "job_id": job_id,
                "next_trigger": trigger_time,
            }

            logger.info(f"Scheduled reminder '{reminder.title}' for {trigger_time}")

        except Exception as e:
            logger.error(f"Error scheduling reminder {reminder.id}: {e}")

    def _calculate_next_trigger_time(self, reminder: Reminder) -> Optional[datetime]:
        """Calculate the next trigger time for a reminder"""
        try:
            if reminder.repeat_type == "none":
                # For one-time reminders, check if it was already triggered
                if reminder.last_triggered_at:
                    return None
                return reminder.reminder_time

            elif reminder.repeat_type == "daily":
                # For daily reminders, find the next occurrence after now
                now = datetime.utcnow()
                reminder_time = reminder.reminder_time

                # Create today's reminder time
                today_trigger = reminder_time.replace(
                    year=now.year, month=now.month, day=now.day
                )

                # If today's time has passed, schedule for tomorrow
                if today_trigger <= now:
                    today_trigger += timedelta(days=1)

                return today_trigger

            elif reminder.repeat_type == "weekly":
                # For weekly reminders, find the next occurrence on the same day of week
                now = datetime.utcnow()
                reminder_time = reminder.reminder_time

                # Calculate days until next occurrence of the same weekday
                days_ahead = (reminder_time.weekday() - now.weekday()) % 7
                if days_ahead == 0 and reminder_time.time() <= now.time():
                    days_ahead = 7

                next_trigger = now.replace(
                    hour=reminder_time.hour,
                    minute=reminder_time.minute,
                    second=reminder_time.second,
                    microsecond=0,
                ) + timedelta(days=days_ahead)
                return next_trigger

            elif reminder.repeat_type == "monthly":
                # For monthly reminders, find the next occurrence on the same day of month
                now = datetime.utcnow()
                reminder_time = reminder.reminder_time

                # Try current month
                try:
                    this_month = now.replace(
                        day=reminder_time.day,
                        hour=reminder_time.hour,
                        minute=reminder_time.minute,
                        second=reminder_time.second,
                        microsecond=0,
                    )
                    if this_month > now:
                        return this_month
                except ValueError:
                    pass  # Day doesn't exist in current month

                # Try next month
                try:
                    next_month = (now.replace(day=1) + timedelta(days=32)).replace(
                        day=reminder_time.day,
                        hour=reminder_time.hour,
                        minute=reminder_time.minute,
                        second=reminder_time.second,
                        microsecond=0,
                    )
                    return next_month
                except ValueError:
                    # If day doesn't exist, use last day of next month
                    next_month = (now.replace(day=1) + timedelta(days=32)).replace(
                        day=1
                    ) - timedelta(days=1)
                    return next_month.replace(
                        hour=reminder_time.hour,
                        minute=reminder_time.minute,
                        second=reminder_time.second,
                        microsecond=0,
                    )

            return None

        except Exception as e:
            logger.error(
                f"Error calculating trigger time for reminder {reminder.id}: {e}"
            )
            return None

    def _trigger_reminder(self, reminder_id: str):
        """Trigger a reminder and send notification"""
        try:
            with self.app.app_context():
                reminder = Reminder.query.get(reminder_id)
                if not reminder or not reminder.is_active:
                    logger.warning(f"Reminder {reminder_id} not found or inactive")
                    return

                # Update last_triggered_at
                reminder.last_triggered_at = datetime.utcnow()

                # Handle one-time reminders (deactivate after triggering)
                if reminder.repeat_type == "once":
                    reminder.is_active = False
                    # Remove from scheduler
                    job_id = f"reminder_{reminder.id}"
                    if self.scheduler.get_job(job_id):
                        self.scheduler.remove_job(job_id)
                    if reminder_id in self._active_reminders:
                        del self._active_reminders[reminder_id]
                else:
                    # For recurring reminders, calculate next trigger
                    next_trigger = self._calculate_next_trigger_time(reminder)
                    if next_trigger:
                        # Update the job's next run time
                        job_id = f"reminder_{reminder.id}"
                        if self.scheduler.get_job(job_id):
                            # Reschedule the job
                            self.scheduler.remove_job(job_id)
                            trigger = IntervalTrigger(
                                days=1, start_date=next_trigger, timezone="UTC"
                            )
                            self.scheduler.add_job(
                                func=self._trigger_reminder,
                                trigger=trigger,
                                args=[reminder_id],
                                id=job_id,
                                name=f"Reminder: {reminder.title}",
                                replace_existing=True,
                            )

                        self._active_reminders[reminder_id][
                            "next_trigger"
                        ] = next_trigger

                db.session.commit()

                # Send notification to frontend
                self._send_notification(reminder)

                logger.info(f"Triggered reminder '{reminder.title}'")

        except Exception as e:
            logger.error(f"Error triggering reminder {reminder_id}: {e}")

    def _send_notification(self, reminder: Reminder):
        """Send reminder notification to frontend via WebSocket"""
        try:
            # This will be implemented with Socket.IO or WebSocket
            notification_data = {
                "type": "reminder",
                "id": reminder.id,
                "title": reminder.title,
                "description": reminder.description,
                "reminder_time": reminder.reminder_time.isoformat(),
                "repeat_type": reminder.repeat_type,
                "triggered_at": datetime.utcnow().isoformat(),
            }

            # TODO: Implement WebSocket/Socker.IO emission
            # socketio.emit('reminder_trigger', notification_data)

            # For now, just log the notification
            logger.info(f"Would send notification: {notification_data}")

        except Exception as e:
            logger.error(f"Error sending notification for reminder {reminder.id}: {e}")

    # Public API methods

    def create_reminder(self, reminder_data: Dict[str, Any]) -> Reminder:
        """Create a new reminder and schedule it"""
        try:
            with self.app.app_context():
                reminder = Reminder.from_dict(reminder_data)
                db.session.add(reminder)
                db.session.commit()

                # Schedule the reminder
                self._schedule_reminder(reminder)

                logger.info(f"Created and scheduled reminder: {reminder.title}")
                return reminder

        except Exception as e:
            logger.error(f"Error creating reminder: {e}")
            raise

    def update_reminder(
        self, reminder_id: str, reminder_data: Dict[str, Any]
    ) -> Optional[Reminder]:
        """Update an existing reminder and reschedule it"""
        try:
            with self.app.app_context():
                reminder = Reminder.query.get(reminder_id)
                if not reminder:
                    return None

                # Update reminder fields
                for key, value in reminder_data.items():
                    if hasattr(reminder, key) and key not in ["id", "created_at"]:
                        setattr(reminder, key, value)

                reminder.updated_at = datetime.utcnow()
                db.session.commit()

                # Reschedule the reminder
                if reminder.is_active:
                    self._schedule_reminder(reminder)
                else:
                    # Remove from scheduler if deactivated
                    job_id = f"reminder_{reminder.id}"
                    if self.scheduler.get_job(job_id):
                        self.scheduler.remove_job(job_id)
                    if reminder_id in self._active_reminders:
                        del self._active_reminders[reminder_id]

                logger.info(f"Updated reminder: {reminder.title}")
                return reminder

        except Exception as e:
            logger.error(f"Error updating reminder {reminder_id}: {e}")
            raise

    def delete_reminder(self, reminder_id: str) -> bool:
        """Delete a reminder and remove it from scheduler"""
        try:
            with self.app.app_context():
                reminder = Reminder.query.get(reminder_id)
                if not reminder:
                    return False

                # Remove from scheduler
                job_id = f"reminder_{reminder.id}"
                if self.scheduler.get_job(job_id):
                    self.scheduler.remove_job(job_id)

                if reminder_id in self._active_reminders:
                    del self._active_reminders[reminder_id]

                # Delete from database
                db.session.delete(reminder)
                db.session.commit()

                logger.info(f"Deleted reminder: {reminder.title}")
                return True

        except Exception as e:
            logger.error(f"Error deleting reminder {reminder_id}: {e}")
            raise

    def get_reminders(self, include_inactive: bool = False) -> List[Reminder]:
        """Get all reminders"""
        try:
            with self.app.app_context():
                query = Reminder.query
                if not include_inactive:
                    query = query.filter(Reminder.is_active == True)
                return query.order_by(Reminder.reminder_time.asc()).all()

        except Exception as e:
            logger.error(f"Error getting reminders: {e}")
            raise

    def get_reminder_by_id(self, reminder_id: str) -> Optional[Reminder]:
        """Get a specific reminder by ID"""
        try:
            with self.app.app_context():
                return Reminder.query.get(reminder_id)

        except Exception as e:
            logger.error(f"Error getting reminder {reminder_id}: {e}")
            raise

    def snooze_reminder(self, reminder_id: str, minutes: int) -> Optional[Reminder]:
        """Snooze a reminder for specified minutes"""
        try:
            with self.app.app_context():
                reminder = Reminder.query.get(reminder_id)
                if not reminder:
                    return None

                # Calculate new reminder time
                new_time = datetime.utcnow() + timedelta(minutes=minutes)
                reminder.reminder_time = new_time
                reminder.updated_at = datetime.utcnow()

                # If it was a one-time reminder that was triggered, reactivate it
                if reminder.repeat_type == "once" and not reminder.is_active:
                    reminder.is_active = True

                db.session.commit()

                # Reschedule the reminder
                self._schedule_reminder(reminder)

                logger.info(
                    f"Snoozed reminder '{reminder.title}' for {minutes} minutes"
                )
                return reminder

        except Exception as e:
            logger.error(f"Error snoozing reminder {reminder_id}: {e}")
            raise

    def get_scheduler_status(self) -> Dict[str, Any]:
        """Get scheduler status and statistics"""
        try:
            return {
                "scheduler_running": (
                    self.scheduler.running if self.scheduler else False
                ),
                "active_jobs": len(self.scheduler.get_jobs()) if self.scheduler else 0,
                "active_reminders": len(self._active_reminders),
                "next_triggers": [
                    {
                        "reminder_id": rid,
                        "title": data["reminder"].title,
                        "next_trigger": data["next_trigger"].isoformat(),
                    }
                    for rid, data in self._active_reminders.items()
                ],
            }
        except Exception as e:
            logger.error(f"Error getting scheduler status: {e}")
            return {}

    def shutdown(self):
        """Shutdown the scheduler gracefully"""
        try:
            if self.scheduler and self.scheduler.running:
                self.scheduler.shutdown(wait=True)
                logger.info("Reminder scheduler shutdown")
        except Exception as e:
            logger.error(f"Error shutting down scheduler: {e}")


# Global instance
reminder_service = ReminderService()
