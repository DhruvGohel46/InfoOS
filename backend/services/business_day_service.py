"""
=============================================================================
 BUSINESS DAY SERVICE — services/business_day_service.py
=============================================================================

 Manages operational business day calculation, turnover/cutoff times, and
 temporary schedule/festival date-range overrides.

 Key rules:
 1. Operational Day Determination:
    - Default cutoff is 00:00 (midnight).
    - If cutoff is e.g. 03:00, orders between 00:00 and 02:59:59 belong to
      the previous calendar date's operational day (the same shift).
 2. 30-Minute Post-Closing Buffer Rule:
    - If shop closing time is set and closing extends to or past the cutoff,
      or is within 30 minutes of the cutoff, the effective cutoff is
      automatically pushed to at least 30 minutes after closing time.
 3. Temporary Date-Range Overrides:
    - Support for custom cutoff & operating hours for festivals/holidays
      (e.g., 2026-10-20 to 2026-10-26 open until 03:00 AM).
=============================================================================
"""

import json
import uuid
import logging
from datetime import datetime, date, time, timedelta
from typing import Dict, Any, List, Optional, Tuple
from models import db, Settings

logger = logging.getLogger(__name__)

DEFAULT_CUTOFF_TIME = "00:00"
DEFAULT_OPEN_TIME = "09:00"
DEFAULT_CLOSE_TIME = "23:00"


def parse_time_str(time_str: Optional[str], default: str = "00:00") -> time:
    """Parse 'HH:MM' string to datetime.time."""
    if not time_str:
        time_str = default
    try:
        parts = time_str.strip().split(":")
        return time(int(parts[0]), int(parts[1]))
    except Exception:
        return time(0, 0)


def format_time_obj(t: time) -> str:
    """Format datetime.time to 'HH:MM' string."""
    return f"{t.hour:02d}:{t.minute:02d}"


def add_minutes_to_time(t: time, minutes: int) -> time:
    """Add minutes to a time object, wrapping around 24 hours if needed."""
    dummy_dt = datetime(2000, 1, 1, t.hour, t.minute) + timedelta(minutes=minutes)
    return dummy_dt.time()


def time_to_shift_minutes(t: time, shift_anchor_hour: int = 6) -> int:
    """
    Convert time to linear minutes relative to a daytime shift anchor (default 06:00 AM).
    Hours between 06:00 and 23:59 map to minutes 0 .. 1079.
    Early morning hours 00:00 to 05:59 map to minutes 1080 .. 1439 (late night of that shift).
    """
    total = t.hour * 60 + t.minute
    anchor = shift_anchor_hour * 60
    if total >= anchor:
        return total - anchor
    else:
        return (24 * 60 - anchor) + total


def shift_minutes_to_time(m: int, shift_anchor_hour: int = 6) -> time:
    """Convert linear shift minutes back to datetime.time."""
    anchor = shift_anchor_hour * 60
    real_minutes = (m + anchor) % (24 * 60)
    hour = real_minutes // 60
    minute = real_minutes % 60
    return time(hour, minute)


def compute_effective_cutoff(close_time_str: Optional[str], cutoff_time_str: Optional[str]) -> time:
    """
    Apply the 30-minute post-closing safety buffer rule:
    If close_time is set, ensure cutoff_time is at least 30 minutes after close_time
    in terms of the shift timeline.
    """
    cutoff = parse_time_str(cutoff_time_str, DEFAULT_CUTOFF_TIME)
    if not close_time_str:
        return cutoff

    close = parse_time_str(close_time_str, DEFAULT_CLOSE_TIME)
    close_shift_mins = time_to_shift_minutes(close)
    cutoff_shift_mins = time_to_shift_minutes(cutoff)

    # Required minimum cutoff is 30 mins after closing
    min_cutoff_shift_mins = close_shift_mins + 30

    if cutoff_shift_mins < min_cutoff_shift_mins:
        return shift_minutes_to_time(min_cutoff_shift_mins)

    return cutoff


class BusinessDayService:
    """Centralized service managing operational business days and turnovers."""

    @classmethod
    def get_setting(cls, key: str, default: str = "") -> str:
        """Fetch setting value from db."""
        try:
            s = Settings.query.get(key)
            return s.value if s and s.value is not None else default
        except Exception:
            return default

    @classmethod
    def set_setting(cls, key: str, value: str, group: str = "business_day") -> None:
        """Store setting value in db."""
        try:
            s = Settings.query.get(key)
            if not s:
                s = Settings(key=key, value=value, group_name=group)
                db.session.add(s)
            else:
                s.value = value
            db.session.commit()
        except Exception as e:
            db.session.rollback()
            logger.error("Error setting %s: %s", key, e)

    @classmethod
    def get_all_overrides(cls) -> List[Dict[str, Any]]:
        """Retrieve all configured date-range overrides."""
        raw = cls.get_setting("business_day_overrides", "[]")
        try:
            overrides = json.loads(raw)
            return overrides if isinstance(overrides, list) else []
        except Exception:
            return []

    @classmethod
    def save_all_overrides(cls, overrides: List[Dict[str, Any]]) -> None:
        """Persist date-range overrides list."""
        cls.set_setting("business_day_overrides", json.dumps(overrides))

    @classmethod
    def get_active_override(cls, dt: Optional[datetime] = None) -> Optional[Dict[str, Any]]:
        """
        Check if the given datetime/date falls into an active temporary override window.
        """
        if dt is None:
            dt = datetime.now()
        target_date_str = dt.strftime("%Y-%m-%d")

        for override in cls.get_all_overrides():
            if not override.get("is_active", True):
                continue
            s_date = override.get("start_date")
            e_date = override.get("end_date")
            if s_date and e_date:
                if s_date <= target_date_str <= e_date:
                    return override
        return None

    @classmethod
    def get_effective_cutoff_time(cls, dt: Optional[datetime] = None) -> time:
        """
        Resolve the effective cutoff time for a given datetime, applying:
        1. Temporary override if active.
        2. Default configured cutoff if not.
        3. Automatic 30-minute post-closing safety buffer rule.
        """
        override = cls.get_active_override(dt)
        if override:
            raw_cutoff = override.get("cutoff_time")
            raw_close = override.get("close_time")
            return compute_effective_cutoff(raw_close, raw_cutoff)

        raw_cutoff = cls.get_setting("business_day_cutoff_time", DEFAULT_CUTOFF_TIME)
        raw_close = (
            cls.get_setting("business_day_close_time")
            or cls.get_setting("shop_close_time")
            or DEFAULT_CLOSE_TIME
        )
        return compute_effective_cutoff(raw_close, raw_cutoff)

    @classmethod
    def get_business_date(cls, dt: Optional[datetime] = None) -> date:
        """
        Determine the operational business date for a given datetime.
        If the time is earlier than the cutoff time, it belongs to the previous day.
        """
        if dt is None:
            dt = datetime.now()

        cutoff = cls.get_effective_cutoff_time(dt)

        if cutoff == time(0, 0):
            return dt.date()

        if dt.time() < cutoff:
            return dt.date() - timedelta(days=1)
        else:
            return dt.date()

    @classmethod
    def get_business_day_window(cls, b_date: Optional[date] = None) -> Tuple[datetime, datetime]:
        """
        Get the [start_datetime, end_datetime) range for a given operational business date.
        """
        if b_date is None:
            b_date = cls.get_business_date()

        # For start_dt, use the cutoff active on b_date
        sample_start = datetime.combine(b_date, time(12, 0))
        cutoff = cls.get_effective_cutoff_time(sample_start)
        start_dt = datetime.combine(b_date, cutoff)

        # For end_dt, the next day's turnover marks the end
        next_date = b_date + timedelta(days=1)
        sample_end = datetime.combine(next_date, time(12, 0))
        next_cutoff = cls.get_effective_cutoff_time(sample_end)
        end_dt = datetime.combine(next_date, next_cutoff)

        return (start_dt, end_dt)

    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """Get current live business day status for UI pills and headers."""
        now = datetime.now()
        b_date = cls.get_business_date(now)
        start_dt, end_dt = cls.get_business_day_window(b_date)
        override = cls.get_active_override(now)
        effective_cutoff = cls.get_effective_cutoff_time(now)
        default_cutoff = parse_time_str(
            cls.get_setting("business_day_cutoff_time", DEFAULT_CUTOFF_TIME)
        )
        default_close = parse_time_str(
            cls.get_setting("business_day_close_time")
            or cls.get_setting("shop_close_time")
            or DEFAULT_CLOSE_TIME
        )

        seconds_until_turnover = max(0, int((end_dt - now).total_seconds()))

        buffer_applied = (effective_cutoff != default_cutoff) and (override is None)

        return {
            "current_time": now.strftime("%Y-%m-%d %H:%M:%S"),
            "operational_date": b_date.strftime("%Y-%m-%d"),
            "business_date": b_date.strftime("%Y-%m-%d"),
            "window_start": start_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "window_end": end_dt.strftime("%Y-%m-%d %H:%M:%S"),
            "effective_cutoff_time": format_time_obj(effective_cutoff),
            "cutoff_time": format_time_obj(effective_cutoff),
            "default_cutoff_time": format_time_obj(default_cutoff),
            "default_close_time": format_time_obj(default_close),
            "seconds_until_turnover": seconds_until_turnover,
            "has_active_override": override is not None,
            "active_override": override,
            "buffer_rule_applied": buffer_applied,
        }

    @classmethod
    def add_or_update_override(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """Add or update an override in the schedule."""
        overrides = cls.get_all_overrides()
        o_id = data.get("id") or str(uuid.uuid4())[:8]

        # Ensure 30-min buffer between close_time and cutoff_time
        close_t = data.get("close_time") or DEFAULT_CLOSE_TIME
        cutoff_t = data.get("cutoff_time") or DEFAULT_CUTOFF_TIME
        effective_cutoff = compute_effective_cutoff(close_t, cutoff_t)

        item = {
            "id": o_id,
            "name": data.get("name") or "Special Schedule",
            "start_date": data.get("start_date") or date.today().strftime("%Y-%m-%d"),
            "end_date": data.get("end_date") or date.today().strftime("%Y-%m-%d"),
            "open_time": data.get("open_time") or DEFAULT_OPEN_TIME,
            "close_time": close_t,
            "cutoff_time": format_time_obj(effective_cutoff),
            "is_active": bool(data.get("is_active", True)),
        }

        # Replace existing or append
        existing_idx = next((i for i, o in enumerate(overrides) if o.get("id") == o_id), None)
        if existing_idx is not None:
            overrides[existing_idx] = item
        else:
            overrides.append(item)

        cls.save_all_overrides(overrides)
        return item

    @classmethod
    def delete_override(cls, o_id: str) -> bool:
        """Remove a date-range override by ID."""
        overrides = cls.get_all_overrides()
        filtered = [o for o in overrides if o.get("id") != o_id]
        if len(filtered) != len(overrides):
            cls.save_all_overrides(filtered)
            return True
        return False
