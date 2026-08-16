import pytest
import json
import os
import sys

# Ensure backend directory is on sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import create_app
from models import db, AgentConfig, AgentPermission, AgentActionLog, Inventory, Product
from agents.crypto_utils import encrypt_api_key, decrypt_api_key, mask_api_key
from agents.permission_gate import PermissionGate
from agents.tools import execute_read_tool, execute_mutating_tool


@pytest.fixture
def app_client():
    app = create_app("default")
    app.config["TESTING"] = True
    with app.app_context():
        db.create_all()
        yield app.test_client()


def test_crypto_utils():
    raw = "sk-ant-api03-secret-key-123456789"
    encrypted = encrypt_api_key(raw)
    assert encrypted != raw
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == raw
    masked = mask_api_key(raw)
    assert masked.startswith("sk-a")
    assert masked.endswith("6789")
    assert "••••••••" in masked


def test_worker_role_blocked(app_client):
    """Assert worker role gets 403 Forbidden on agent routes."""
    headers = {"X-User-Role": "worker"}
    res = app_client.get("/api/agents/config", headers=headers)
    assert res.status_code == 403
    data = res.get_json()
    assert data["code"] == "WORKER_ACCESS_FORBIDDEN"

    res2 = app_client.post("/api/agents/chat", json={"message": "hello"}, headers=headers)
    assert res2.status_code == 403


def test_admin_config_endpoints(app_client):
    """Test getting and updating agent config."""
    res = app_client.get("/api/agents/config")
    assert res.status_code == 200
    data = res.get_json()
    assert "config" in data

    # Update config
    update_payload = {
        "provider": "openai",
        "model_name": "gpt-4o-mini",
        "api_key": "sk-test-key-12345678",
        "enabled": True,
    }
    res2 = app_client.post("/api/agents/config", json=update_payload)
    assert res2.status_code == 200
    assert res2.get_json()["config"]["has_api_key"] is True


def test_agent_permissions_endpoint(app_client):
    """Test reading and updating permissions."""
    res = app_client.get("/api/agents/permissions")
    assert res.status_code == 200
    perms = res.get_json()["permissions"]
    assert len(perms) >= 7

    # Ensure hardcoded ceiling is enforced
    billing_perm = next(p for p in perms if p["agent_name"] == "billing")
    assert billing_perm["is_ceiling_locked"] is True

    # Attempt to set billing to full_autonomy -> should clamp to suggest_confirm
    res2 = app_client.put(
        "/api/agents/permissions",
        json={"permissions": [{"agent_name": "billing", "tier": "full_autonomy", "enabled": True}]},
    )
    assert res2.status_code == 200

    res3 = app_client.get("/api/agents/permissions")
    b_updated = next(p for p in res3.get_json()["permissions"] if p["agent_name"] == "billing")
    assert b_updated["tier"] == "suggest_confirm"


def test_suggest_and_confirm_flow(app_client):
    """Test proposing, approving, and rejecting mutating actions."""
    with app_client.application.app_context():
        # Dispatch a stock adjustment proposal
        dispatch_res = PermissionGate.dispatch_tool(
            agent_name="inventory",
            tool_name="propose_adjust_stock",
            args={"delta_quantity": 5, "reason": "Test Stock Restock"},
        )
        assert dispatch_res["status"] == "proposed"
        assert dispatch_res["requires_confirmation"] is True
        action_id = dispatch_res["action_id"]

        # Reject action
        reject_res = app_client.post(f"/api/agents/actions/{action_id}/reject")
        assert reject_res.status_code == 200
        assert reject_res.get_json()["status"] == "rejected"

        # Create another action and approve it
        dispatch_res2 = PermissionGate.dispatch_tool(
            agent_name="reminder",
            tool_name="propose_create_reminder",
            args={"title": "Test Reminder", "reminder_time": "2026-08-15T18:00:00"},
        )
        action_id2 = dispatch_res2["action_id"]
        approve_res = app_client.post(f"/api/agents/actions/{action_id2}/approve")
        assert approve_res.status_code == 200
        assert approve_res.get_json()["status"] == "executed"


def test_audit_logs_endpoint(app_client):
    """Test retrieving audit logs."""
    res = app_client.get("/api/agents/logs")
    assert res.status_code == 200
    data = res.get_json()
    assert "logs" in data
    assert data["count"] >= 1
