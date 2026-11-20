import pytest
from models import db, Worker, Settings, MobileSyncQueue, MobileSyncLog
from services.mobile_sync_service import (
    is_sync_enabled,
    generate_signup_pin,
    _hash_pin,
    sync_worker,
    get_queue_depth,
)


def test_pin_generation():
    """PIN must be 6 digits and bcrypt hash must verify."""
    import bcrypt

    pin = generate_signup_pin()
    assert len(pin) == 6
    assert pin.isdigit()

    hashed = _hash_pin(pin)
    assert bcrypt.checkpw(pin.encode(), hashed.encode()) is True


def test_sync_disabled_by_default(app):
    """Sync must be off by default when no setting exists."""
    with app.app_context():
        # Clear setting if present
        Settings.query.filter_by(key="mobile_sync_enabled").delete()
        db.session.commit()
        assert is_sync_enabled() is False


def test_sync_worker_noop_when_disabled(app):
    """When sync is disabled, sync_worker must be a complete no-op without writing to queue."""
    with app.app_context():
        Settings.query.filter_by(key="mobile_sync_enabled").delete()
        db.session.commit()

        w = Worker(worker_id="W999", name="Test Chef", role="Chef", salary=15000.0)
        db.session.add(w)
        db.session.commit()

        initial_queue = MobileSyncQueue.query.count()
        initial_log = MobileSyncLog.query.count()

        sync_worker("W999", "upsert")

        assert MobileSyncQueue.query.count() == initial_queue
        assert MobileSyncLog.query.count() == initial_log


def test_sync_queues_when_enabled_and_no_remote(app):
    """When sync is enabled with a dummy URL/key, offline push safely falls back to local queue."""
    with app.app_context():
        db.session.merge(Settings(key="mobile_sync_enabled", value="true"))
        db.session.merge(
            Settings(key="mobile_sync_supabase_url", value="https://dummyproject123.supabase.co")
        )
        db.session.merge(
            Settings(key="mobile_sync_supabase_anon_key", value="dummy_anon_key_for_testing")
        )
        w = Worker(worker_id="W998", name="Test Waiter", role="Waiter", salary=12000.0)
        db.session.add(w)
        db.session.commit()

        sync_worker("W998", "upsert", plain_pin="123456")

        # Should have enqueued the item because dummyproject123.supabase.co is unreachable
        queue_item = MobileSyncQueue.query.filter_by(worker_id="W998").first()
        assert queue_item is not None
        assert queue_item.operation == "upsert"
        assert "W998" in queue_item.payload_json
        assert "signup_pin_hash" in queue_item.payload_json

        # Should have logged the queued event
        log_entry = MobileSyncLog.query.filter_by(worker_id="W998").first()
        assert log_entry is not None
        assert log_entry.status == "queued"


def test_mobile_sync_settings_api(client):
    """Settings endpoint should return masked keys and allow updating."""
    # Test GET settings
    res = client.get("/api/mobile-sync/settings")
    assert res.status_code == 200
    data = res.get_json()
    assert "enabled" in data
    assert "supabase_url" in data

    # Test PUT settings
    put_res = client.put(
        "/api/mobile-sync/settings",
        json={"enabled": True, "supabase_url": "https://testbrand.supabase.co"},
    )
    assert put_res.status_code == 200
    put_data = put_res.get_json()
    assert put_data["success"] is True

    # Test status endpoint
    status_res = client.get("/api/mobile-sync/status")
    assert status_res.status_code == 200
    status_data = status_res.get_json()
    assert "queue_depth" in status_data
    assert "enabled" in status_data
