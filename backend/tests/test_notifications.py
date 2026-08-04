"""
Tests for Notification Center system endpoints and lifecycle.
"""

import json
import pytest
from datetime import datetime, timedelta
from models import db, Notification, Reminder


def test_create_and_get_notifications(client, init_database):
    """Test POST /api/notifications and GET /api/notifications."""
    payload = {
        "title": "Low Stock Warning",
        "message": "Butter Toast is running low (2 units left)",
        "type": "inventory",
        "priority": "warning",
        "action_route": "/inventory",
    }

    res = client.post(
        "/api/notifications",
        data=json.dumps(payload),
        content_type="application/json",
    )
    assert res.status_code == 201
    res_data = json.loads(res.data)
    assert res_data["success"] is True
    notif_id = res_data["notification"]["id"]

    # Retrieve notifications
    get_res = client.get("/api/notifications")
    assert get_res.status_code == 200
    get_data = json.loads(get_res.data)
    assert get_data["success"] is True
    assert get_data["unread_count"] >= 1
    assert any(n["id"] == notif_id for n in get_data["notifications"])


def test_notification_status_updates(client, init_database):
    """Test status transitions: unread -> read -> completed -> dismissed."""
    payload = {
        "title": "Bakery Order Ready",
        "message": "Order #104 is ready for pickup",
        "type": "bakery",
        "priority": "info",
    }
    create_res = client.post(
        "/api/notifications",
        data=json.dumps(payload),
        content_type="application/json",
    )
    notif_id = json.loads(create_res.data)["notification"]["id"]

    # Mark as read
    read_res = client.put(
        f"/api/notifications/{notif_id}/status",
        data=json.dumps({"status": "read"}),
        content_type="application/json",
    )
    assert read_res.status_code == 200
    assert json.loads(read_res.data)["notification"]["status"] == "read"

    # Mark as completed
    comp_res = client.put(
        f"/api/notifications/{notif_id}/status",
        data=json.dumps({"status": "completed"}),
        content_type="application/json",
    )
    assert comp_res.status_code == 200
    assert json.loads(comp_res.data)["notification"]["status"] == "completed"


def test_mark_all_read(client, init_database):
    """Test POST /api/notifications/mark-all-read."""
    client.post(
        "/api/notifications",
        data=json.dumps({"title": "Notif 1", "message": "Msg 1"}),
        content_type="application/json",
    )
    client.post(
        "/api/notifications",
        data=json.dumps({"title": "Notif 2", "message": "Msg 2"}),
        content_type="application/json",
    )

    mark_res = client.post("/api/notifications/mark-all-read")
    assert mark_res.status_code == 200

    get_res = client.get("/api/notifications?status=unread")
    get_data = json.loads(get_res.data)
    assert get_data["unread_count"] == 0


def test_reminder_done_integration(client, init_database):
    """Test that marking a reminder notification completed updates the associated Reminder model."""
    # Create reminder
    reminder = Reminder(
        title="Check Oven Temperature",
        description="Verify oven 2 temp is set to 200C",
        reminder_time=datetime.utcnow(),
        status="triggered",
        is_active=True,
    )
    db.session.add(reminder)
    db.session.commit()

    # Create associated notification
    notif_payload = {
        "title": "Reminder: Check Oven Temperature",
        "message": reminder.description,
        "type": "reminder",
        "priority": "warning",
        "related_id": reminder.id,
    }
    create_res = client.post(
        "/api/notifications",
        data=json.dumps(notif_payload),
        content_type="application/json",
    )
    notif_id = json.loads(create_res.data)["notification"]["id"]

    # Mark notification as completed
    comp_res = client.put(
        f"/api/notifications/{notif_id}/status",
        data=json.dumps({"status": "completed"}),
        content_type="application/json",
    )
    assert comp_res.status_code == 200

    # Verify reminder is updated in DB
    updated_reminder = Reminder.query.get(reminder.id)
    assert updated_reminder.status == "completed"
    assert updated_reminder.is_active is False
