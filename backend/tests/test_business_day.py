import pytest
from datetime import datetime, date, time
from services.business_day_service import (
    BusinessDayService,
    compute_effective_cutoff,
    parse_time_str,
    time_to_shift_minutes,
)


def test_time_parsing_and_shift_minutes():
    """Verify time parsing and linear shift minutes conversion."""
    assert parse_time_str("03:30") == time(3, 30)
    assert parse_time_str("invalid") == time(0, 0)

    # 10:00 AM is 4 hours after 06:00 AM anchor = 240 mins
    assert time_to_shift_minutes(time(10, 0)) == 240
    # 02:00 AM is late night = 20 hours after 06:00 AM anchor = 1200 mins
    assert time_to_shift_minutes(time(2, 0)) == 1200


def test_30_minute_buffer_rule():
    """
    If shop closing time is greater than or equal to reset time (or within 30 mins),
    the effective reset time must be at least 30 minutes after shop closing time.
    """
    # Case 1: Closing at 23:00, cutoff at 00:00 (1 hour buffer) -> stays 00:00
    assert compute_effective_cutoff("23:00", "00:00") == time(0, 0)

    # Case 2: Closing at 23:45, cutoff at 00:00 (only 15 min buffer) -> pushes to 00:15
    assert compute_effective_cutoff("23:45", "00:00") == time(0, 15)

    # Case 3: Closing at 02:00 AM, cutoff set to 02:00 AM -> pushes to 02:30 AM
    assert compute_effective_cutoff("02:00", "02:00") == time(2, 30)

    # Case 4: Closing at 02:30 AM, cutoff set to 01:00 AM (closing > reset) -> pushes to 03:00 AM
    assert compute_effective_cutoff("02:30", "01:00") == time(3, 0)

    # Case 5: Festival night closing at 03:00 AM -> pushes to at least 03:30 AM
    assert compute_effective_cutoff("03:00", "03:00") == time(3, 30)


def test_business_date_mapping(app):
    """Verify orders before/after cutoff map to correct operational business date."""
    with app.app_context():
        # Set default cutoff to 03:00 AM, close at 02:00 AM
        BusinessDayService.set_setting("business_day_cutoff_time", "03:00")
        BusinessDayService.set_setting("business_day_close_time", "02:00")
        # Ensure overrides are clean
        BusinessDayService.save_all_overrides([])

        # Oct 16, 23:30 (before midnight) -> Business date Oct 16
        dt1 = datetime(2026, 10, 16, 23, 30, 0)
        assert BusinessDayService.get_business_date(dt1) == date(2026, 10, 16)

        # Oct 17, 01:45 AM (past midnight, before 03:00 AM cutoff) -> STILL Business date Oct 16
        dt2 = datetime(2026, 10, 17, 1, 45, 0)
        assert BusinessDayService.get_business_date(dt2) == date(2026, 10, 16)

        # Oct 17, 03:05 AM (after 03:00 AM cutoff) -> Business date Oct 17
        dt3 = datetime(2026, 10, 17, 3, 5, 0)
        assert BusinessDayService.get_business_date(dt3) == date(2026, 10, 17)

        # Query window for Oct 16 operational day
        start_dt, end_dt = BusinessDayService.get_business_day_window(date(2026, 10, 16))
        assert start_dt == datetime(2026, 10, 16, 3, 0)
        assert end_dt == datetime(2026, 10, 17, 3, 0)


def test_temporary_date_range_override(app):
    """Verify temporary overrides apply within date range and expire outside."""
    with app.app_context():
        BusinessDayService.set_setting("business_day_cutoff_time", "00:00")
        BusinessDayService.set_setting("business_day_close_time", "23:00")

        # Create festival override for Oct 20 to Oct 25
        BusinessDayService.add_or_update_override(
            {
                "id": "fest-test-1",
                "name": "Diwali Extended Hours",
                "start_date": "2026-10-20",
                "end_date": "2026-10-25",
                "open_time": "10:00",
                "close_time": "03:00",
                "cutoff_time": "03:30",
                "is_active": True,
            }
        )

        # Oct 18 (before festival) -> default cutoff 00:00
        dt_before = datetime(2026, 10, 18, 1, 0, 0)
        assert BusinessDayService.get_effective_cutoff_time(dt_before) == time(0, 0)

        # Oct 22, 02:00 AM (during festival) -> festival cutoff 03:30
        dt_during = datetime(2026, 10, 22, 2, 0, 0)
        assert BusinessDayService.get_effective_cutoff_time(dt_during) == time(3, 30)
        # Because it's before 03:30 AM, it maps to Oct 21 operational day
        assert BusinessDayService.get_business_date(dt_during) == date(2026, 10, 21)

        # Oct 27 (after festival) -> reverted back to default cutoff 00:00
        dt_after = datetime(2026, 10, 27, 1, 0, 0)
        assert BusinessDayService.get_effective_cutoff_time(dt_after) == time(0, 0)

        # Clean up
        BusinessDayService.delete_override("fest-test-1")


def test_business_day_api_routes(client):
    """Test /api/business-day API endpoints."""
    # 1. Get status
    res = client.get("/api/business-day/status")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "business_date" in data
    assert "cutoff_time" in data
    assert "buffer_rule_applied" in data

    # 2. Update settings
    res = client.put(
        "/api/business-day/settings",
        json={
            "open_time": "09:00",
            "close_time": "01:00",
            "cutoff_time": "01:00",  # buffer rule should push to 01:30
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["settings"]["effective_cutoff_time"] == "01:30"
    assert data["settings"]["buffer_rule_applied"] is True

    # 3. Create schedule override
    res = client.post(
        "/api/business-day/overrides",
        json={
            "name": "Weekend Late Night",
            "start_date": "2026-11-01",
            "end_date": "2026-11-02",
            "open_time": "10:00",
            "close_time": "02:00",
            "cutoff_time": "02:30",
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    override_id = data["override"]["id"]
    assert override_id is not None

    # 4. List overrides
    res = client.get("/api/business-day/overrides")
    assert res.status_code == 200
    data = res.get_json()
    assert any(o["id"] == override_id for o in data["overrides"])

    # 5. Delete override
    res = client.delete(f"/api/business-day/overrides/{override_id}")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
