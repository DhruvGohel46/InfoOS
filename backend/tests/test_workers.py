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
