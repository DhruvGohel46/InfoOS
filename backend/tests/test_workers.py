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
