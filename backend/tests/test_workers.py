"""
Tests for worker management endpoints.
Worker tables use no schema prefix in SQLite test environment (TESTING=True).
"""

import json
import uuid
import pytest

# ─── Helpers ───────────────────────────────────────────────────────────────

WORKER_PAYLOAD = {
    "name": "Raju Kumar",
    "role": "Cashier",
    "phone": "9876543210",
    "salary": 15000.0,
    "status": "Active",
}


def _create_worker(client):
    """Helper to POST a worker and return the response."""
    return client.post(
        "/api/workers",
        data=json.dumps(WORKER_PAYLOAD),
        content_type="application/json",
    )


# ─── Tests ──────────────────────────────────────────────────────────────────


def test_get_workers_returns_list(client, init_database):
    """GET /api/workers should return a JSON list."""
    response = client.get("/api/workers")
    assert response.status_code == 200
    data = json.loads(response.data)
    # Response is a direct list (no wrapper dict in this endpoint)
    assert isinstance(data, list)


def test_create_worker_success(client, init_database):
    """POST /api/workers should create a worker and return worker_id."""
    response = _create_worker(client)
    assert response.status_code in (200, 201)
    data = json.loads(response.data)
    assert "worker_id" in data or data.get("success") is True


def test_create_worker_missing_name(client, init_database):
    """POST /api/workers without required 'name' should return 422."""
    payload = {k: v for k, v in WORKER_PAYLOAD.items() if k != "name"}
    response = client.post(
        "/api/workers",
        data=json.dumps(payload),
        content_type="application/json",
    )
    # Workers route returns 400 for validation failures (marshmallow)
    assert response.status_code in (400, 422)
    data = json.loads(response.data)
    assert data["success"] is False


def test_get_worker_not_found(client, init_database):
    """GET /api/workers/<invalid_id> should return 404."""
    fake_id = str(uuid.uuid4())
    response = client.get(f"/api/workers/{fake_id}")
    assert response.status_code == 404
    data = json.loads(response.data)
    assert data["success"] is False


def test_create_worker_with_type(client, init_database):
    """POST /api/workers with worker_type_id should set it and sync role."""
    # First, create a WorkerType
    wt_payload = {"name": "Assistant", "description": "Helper role"}
    wt_response = client.post(
        "/api/worker-types",
        data=json.dumps(wt_payload),
        content_type="application/json",
    )
    assert wt_response.status_code == 201
    wt_data = json.loads(wt_response.data)
    wt_id = wt_data["worker_type"]["id"]

    # Now create a worker using this worker_type_id
    worker_payload = {
        "name": "Amit Sharma",
        "worker_type_id": wt_id,
        "phone": "9876543211",
        "salary": 12000.0,
        "status": "active",
    }
    response = client.post(
        "/api/workers",
        data=json.dumps(worker_payload),
        content_type="application/json",
    )
    assert response.status_code in (200, 201)
    data = json.loads(response.data)

    # Verify worker got worker_type_id and synced role
    worker_id = data["worker_id"]
    get_response = client.get(f"/api/workers/{worker_id}")
    assert get_response.status_code == 200
    get_data = json.loads(get_response.data)
    assert get_data["worker_type_id"] == wt_id
    assert get_data["role"] == "Assistant"


def test_worker_salary_day_and_mode_migration(client, init_database):
    """Test salary_day creation, editing, and GLOBAL -> WORKER migration logic."""
    # 1. Create a worker with salary_day = 15
    w_payload = {
        "name": "Rajesh Kumar",
        "salary": 20000.0,
        "salary_day": 15,
        "status": "active",
    }
    resp = client.post("/api/workers", data=json.dumps(w_payload), content_type="application/json")
    assert resp.status_code in (200, 201)
    w_id = json.loads(resp.data)["worker_id"]

    # Check worker salary_day
    get_resp = client.get(f"/api/workers/{w_id}")
    assert get_resp.status_code == 200
    assert json.loads(get_resp.data)["salary_day"] == 15

    # 2. Set global salary day to 10 and toggle mode to WORKER
    settings_payload = {
        "global_salary_day": "10",
        "salary_date_mode": "WORKER",
    }
    set_resp = client.put(
        "/api/settings", data=json.dumps(settings_payload), content_type="application/json"
    )
    assert set_resp.status_code == 200

    # 3. Create another worker without explicit salary_day during WORKER mode
    w2_payload = {"name": "Suresh Patel", "salary": 18000.0}
    w2_resp = client.post(
        "/api/workers", data=json.dumps(w2_payload), content_type="application/json"
    )
    assert w2_resp.status_code in (200, 201)
    w2_id = json.loads(w2_resp.data)["worker_id"]

    # Switch GLOBAL -> WORKER migration check:
    # Set mode back to GLOBAL first
    client.put(
        "/api/settings",
        data=json.dumps({"salary_date_mode": "GLOBAL"}),
        content_type="application/json",
    )
    # Now switch to WORKER again
    client.put(
        "/api/settings",
        data=json.dumps({"salary_date_mode": "WORKER"}),
        content_type="application/json",
    )

    # w2 should have inherited global_salary_day (10)
    w2_get = client.get(f"/api/workers/{w2_id}")
    assert json.loads(w2_get.data)["salary_day"] == 10


def test_worker_join_date_save_and_update(client, init_database):
    """Test that join_date / Start Date is properly persisted on creation and update."""
    payload = {
        "name": "Karan Sharma",
        "salary": 25000.0,
        "join_date": "2026-03-12",
        "description": "Lead Chef",
        "status": "active",
    }
    resp = client.post("/api/workers", data=json.dumps(payload), content_type="application/json")
    assert resp.status_code in (200, 201)
    w_id = json.loads(resp.data)["worker_id"]

    get_resp = client.get(f"/api/workers/{w_id}")
    assert get_resp.status_code == 200
    data = json.loads(get_resp.data)
    assert data["join_date"] == "2026-03-12"
    assert data["description"] == "Lead Chef"

    # Now update join_date and description
    update_payload = {
        "join_date": "2026-06-18",
        "description": "Senior Executive Chef",
    }
    put_resp = client.put(
        f"/api/workers/{w_id}",
        data=json.dumps(update_payload),
        content_type="application/json",
    )
    assert put_resp.status_code == 200

    # Verify updated
    get_resp2 = client.get(f"/api/workers/{w_id}")
    assert get_resp2.status_code == 200
    data2 = json.loads(get_resp2.data)
    assert data2["join_date"] == "2026-06-18"
    assert data2["description"] == "Senior Executive Chef"


def test_effective_salary_day_fallback_and_dynamic_partitioning(client, init_database):
    """Test fallback to Start Date (join_date) in WORKER mode and dynamic advance partitioning."""
    from services.worker_service import WorkerService
    from models import Worker, Advance, db
    from datetime import date

    # Set mode to WORKER
    client.put(
        "/api/settings",
        data=json.dumps({"salary_date_mode": "WORKER", "global_salary_day": "1"}),
        content_type="application/json",
    )

    # Worker with Start Date = 12th, no explicit salary_day
    payload = {
        "name": "Pooja Verma",
        "salary": 30000.0,
        "join_date": "2026-04-12",
        "status": "active",
    }
    resp = client.post("/api/workers", data=json.dumps(payload), content_type="application/json")
    w_id = json.loads(resp.data)["worker_id"]

    worker = Worker.query.get(w_id)
    worker.salary_day = None  # Ensure no explicit salary_day
    db.session.commit()

    # Effective salary day should be 12 (from join_date)
    eff_day = WorkerService.get_effective_salary_day(worker)
    assert eff_day == 12

    # Now give explicit salary_day = 20
    worker.salary_day = 20
    db.session.commit()
    eff_day2 = WorkerService.get_effective_salary_day(worker)
    assert eff_day2 == 20

    # Now generate salary for May 2026
    adv = Advance(worker_id=w_id, amount=2000.0, reason="Medical", date=date(2026, 5, 10))
    db.session.add(adv)
    db.session.commit()

    # Period for May 2026 with salary_day=20: April 21 to May 20
    # Advance on May 10 falls within May 2026 cycle
    payment = WorkerService.generate_salary(w_id, month=5, year=2026)
    assert payment.advance_deduction == 2000.0
    assert payment.final_salary == 28000.0

    # Mark paid and verify locking
    WorkerService.mark_salary_paid(payment.payment_id)
    assert payment.paid is True
