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


def test_clear_all_notifications(client, init_database):
    """Test POST /api/notifications/clear-all."""
    client.post(
        "/api/notifications",
        data=json.dumps({"title": "Test 1", "message": "Msg 1"}),
        content_type="application/json",
    )
    client.post(
        "/api/notifications",
        data=json.dumps({"title": "Test 2", "message": "Msg 2"}),
        content_type="application/json",
    )

    clear_res = client.post("/api/notifications/clear-all")
    assert clear_res.status_code == 200
    assert json.loads(clear_res.data)["success"] is True

    get_res = client.get("/api/notifications")
    get_data = json.loads(get_res.data)
    assert get_data["total_count"] == 0
    assert len(get_data["notifications"]) == 0


def test_bill_notification_auto_cleanup_1_hour(client, init_database):
    """Test that bill notifications older than 1 hour are automatically purged."""
    from services.notification_service import NotificationService

    # 1. Add an old bill notification (created 2 hours ago)
    old_bill_notif = Notification(
        id="old-bill-notif-1",
        user_id="admin",
        title="Bill Created Successfully!",
        message="Bill #101 - Total: ₹500",
        type="billing",
        created_at=datetime.now() - timedelta(hours=2),
    )
    # 2. Add a recent bill notification (created 10 mins ago)
    recent_bill_notif = Notification(
        id="recent-bill-notif-2",
        user_id="admin",
        title="Bill Created Successfully!",
        message="Bill #102 - Total: ₹250",
        type="billing",
        created_at=datetime.now() - timedelta(minutes=10),
    )
    db.session.add(old_bill_notif)
    db.session.add(recent_bill_notif)
    db.session.commit()

    # Trigger get_notifications which runs auto_cleanup
    res = client.get("/api/notifications")
    assert res.status_code == 200
    data = json.loads(res.data)

    notif_ids = [n["id"] for n in data["notifications"]]
    # Old bill notification (> 1 hour) must be deleted
    assert "old-bill-notif-1" not in notif_ids
    # Recent bill notification (< 1 hour) must remain
    assert "recent-bill-notif-2" in notif_ids
