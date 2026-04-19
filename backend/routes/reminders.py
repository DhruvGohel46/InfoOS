from flask import Blueprint, request, jsonify
from auth import require_auth
from models import db, Reminder
from datetime import datetime, timedelta
from error_handler import safe_route, ValidationError, NotFoundError
from validators import ReminderCreateSchema, MarshmallowValidationError
import calendar
import uuid
import logging

logger = logging.getLogger(__name__)

reminders_bp = Blueprint('reminders', __name__, url_prefix='/api/reminders')

_create_schema = ReminderCreateSchema()


@reminders_bp.route('', methods=['GET'])
@safe_route
def get_reminders():
    """Get all reminders for a user."""
    user_id = request.args.get('user_id', 'admin')
    include_dismissed = request.args.get('include_dismissed', 'false').lower() == 'true'

    query = Reminder.query.filter_by(user_id=user_id)
    if not include_dismissed:
        query = query.filter_by(is_dismissed=False)

    reminders = query.order_by(Reminder.reminder_time.asc()).all()
    return jsonify([r.to_dict() for r in reminders])

@reminders_bp.route('', methods=['POST'])
@require_auth
@safe_route
def create_reminder():
    """Create a new reminder."""
    data = request.json

    try:
        validated = _create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid reminder data: {e.messages}",
            code="REMINDER_VALIDATION_FAILED"
        )

    new_reminder = Reminder(
        title=validated['title'],
        description=validated.get('description'),
        reminder_time=datetime.fromisoformat(validated['reminder_time'].replace('Z', '')),
        repeat_type=validated.get('repeat_type', 'once'),
        user_id=validated.get('user_id', 'admin') or 'admin'
    )
    db.session.add(new_reminder)
    db.session.commit()

    logger.info(f"Reminder created: {validated['title']}")
    return jsonify(new_reminder.to_dict()), 201

@reminders_bp.route('/<id>/snooze', methods=['POST'])
@require_auth
@safe_route
def snooze_reminder(id):
    """Snooze a reminder by N minutes."""
    data = request.json
    minutes = data.get('minutes', 5)

    reminder = Reminder.query.get(id)
    if not reminder:
        raise NotFoundError("Reminder not found", code="REMINDER_NOT_FOUND")

    new_time = datetime.utcnow() + timedelta(minutes=minutes)
    reminder.reminder_time = new_time
    reminder.status = 'pending'
    reminder.is_dismissed = False

    db.session.commit()
    return jsonify(reminder.to_dict())

@reminders_bp.route('/<id>/dismiss', methods=['PUT', 'POST'])
@require_auth
@safe_route
def dismiss_reminder(id):
    """Dismiss or complete a reminder. Repeating reminders auto-advance."""
    reminder = Reminder.query.get(id)
    if not reminder:
        raise NotFoundError("Reminder not found", code="REMINDER_NOT_FOUND")

    now = datetime.now()

    def next_time(base_time, repeat_type):
        if repeat_type == 'daily':
            return base_time + timedelta(days=1)
        if repeat_type == 'weekly':
            return base_time + timedelta(days=7)
        if repeat_type == 'monthly':
            year = base_time.year
            month = base_time.month + 1
            if month > 12:
                month = 1
                year += 1
            last_day = calendar.monthrange(year, month)[1]
            day = min(base_time.day, last_day)
            return base_time.replace(year=year, month=month, day=day)
        return None

    if reminder.repeat_type and reminder.repeat_type != 'none':
        base_time = reminder.reminder_time or now
        while base_time <= now:
            base_time = next_time(base_time, reminder.repeat_type)
        reminder.reminder_time = base_time
        reminder.status = 'pending'
        reminder.is_dismissed = False
        reminder.last_triggered_at = now
    else:
        reminder.status = 'completed'
        reminder.is_dismissed = True

    db.session.commit()
    return jsonify(reminder.to_dict())

@reminders_bp.route('/<id>', methods=['DELETE'])
@require_auth
@safe_route
def delete_reminder(id):
    """Delete a reminder permanently."""
    reminder = Reminder.query.get(id)
    if not reminder:
        raise NotFoundError("Reminder not found", code="REMINDER_NOT_FOUND")

    db.session.delete(reminder)
    db.session.commit()
    return jsonify({'success': True})
