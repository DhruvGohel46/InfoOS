import json
import pytest
from datetime import datetime, timedelta
from models import (
    db,
    Expense,
    ExpenseItem,
    Category,
    ItemGroup,
    Reminder,
    Notification,
    AgentActionLog,
)
from agents.delete_policy import (
    DELETE_POLICY,
    get_delete_policy,
    get_entity_for_tool,
    is_deletion_tool,
)
from agents.permission_gate import PermissionGate
from agents.undo_service import UndoService
from agents.tools import execute_mutating_tool


def test_delete_policy_registry():
    """Verify entity classifications match the parity specification."""
    assert DELETE_POLICY["product"] == "blocked"
    assert DELETE_POLICY["worker"] == "blocked"
    assert DELETE_POLICY["bill"] == "blocked"
    assert DELETE_POLICY["category"] == "confirm"
    assert DELETE_POLICY["item_group"] == "confirm"
    assert DELETE_POLICY["expense"] == "confirm"
    assert DELETE_POLICY["expense_type"] == "confirm"
    assert DELETE_POLICY["reminder"] == "confirm"
    assert DELETE_POLICY["notification"] == "free"
    assert DELETE_POLICY["held_bill"] == "free"

    # Default for unclassified
    assert get_delete_policy("propose_delete_unknown") == "blocked"


def test_blocked_deletion_short_circuits(app):
    """Verify deleting a product returns structured policy refusal notice without database changes."""
    with app.app_context():
        res = PermissionGate.dispatch_tool(
            "product", "propose_delete_product", {"product_id": "P123"}
        )
        assert res.get("blocked") is True
        assert "Catalog Deletion Policy Notice" in str(res)
        assert res.get("structured_notice") is not None


def test_single_expense_delete_and_restore(app):
    """Verify single expense deletion creates snapshot and can be restored."""
    with app.app_context():
        exp = Expense(
            id="test-exp-1",
            title="Sample Packaging",
            category="Supplies",
            amount=500.0,
            payment_method="Cash",
            date=datetime.now(),
        )
        db.session.add(exp)
        db.session.commit()

        # Execute deletion
        exec_res = execute_mutating_tool("propose_delete_expense", {"expense_id": "test-exp-1"})
        assert exec_res["success"] is True
        assert db.session.get(Expense, "test-exp-1") is None

        # Snapshot exists
        snapshot = exec_res["snapshot"]
        assert snapshot["title"] == "Sample Packaging"
        assert snapshot["amount"] == 500.0

        # Restore from snapshot
        restore_res = UndoService.restore_snapshot(snapshot)
        assert restore_res["success"] is True
        restored_exp = db.session.get(Expense, "test-exp-1")
        assert restored_exp is not None
        assert restored_exp.title == "Sample Packaging"
        assert restored_exp.amount == 500.0


def test_bulk_delete_expenses_unbounded_rejected(app):
    """Verify bulk delete rejects empty / unbounded filters."""
    with app.app_context():
        res = execute_mutating_tool("propose_bulk_delete_expenses", {"filter": {}})
        assert res["success"] is False
        assert "Unbounded bulk delete rejected" in res["error"]


def test_bulk_delete_expenses_execution_and_batch_restore(app):
    """Verify bulk delete removes filtered items and can be restored in a batch."""
    with app.app_context():
        for i in range(3):
            exp = Expense(
                id=f"test-bulk-{i}",
                title=f"Batch Expense {i}",
                category="Utilities",
                amount=100.0 * (i + 1),
                payment_method="Cash",
                date=datetime.now(),
            )
            db.session.add(exp)
        db.session.commit()

        # Bulk delete
        res = execute_mutating_tool(
            "propose_bulk_delete_expenses", {"filter": {"category": "Utilities"}}
        )
        assert res["success"] is True
        assert res["deleted_count"] == 3
        assert len(res["snapshots"]) == 3

        # All deleted
        remaining = Expense.query.filter_by(category="Utilities").count()
        assert remaining == 0

        # Batch Restore
        batch_res = UndoService.restore_batch(res["snapshots"])
        assert batch_res["success"] is True
        assert batch_res["restored_count"] == 3

        # All restored
        restored_count = Expense.query.filter_by(category="Utilities").count()
        assert restored_count == 3


def test_undo_action_endpoint(app, client):
    """Test undoing an action through the API endpoint within 48h."""
    with app.app_context():
        exp = Expense(
            id="test-action-undo-1",
            title="Chairs Repair",
            category="Maintenance",
            amount=1200.0,
            payment_method="Cash",
            date=datetime.now(),
        )
        db.session.add(exp)
        db.session.commit()

        exec_res = execute_mutating_tool(
            "propose_delete_expense", {"expense_id": "test-action-undo-1"}
        )

        action_log = AgentActionLog(
            agent_name="expense",
            action_type="delete",
            tool_name="propose_delete_expense",
            args_json=json.dumps({"expense_id": "test-action-undo-1"}),
            diff_summary="Delete expense voucher 'Chairs Repair'",
            status="executed",
            result_summary=json.dumps(exec_res),
            updated_at=datetime.now(),
        )
        db.session.add(action_log)
        db.session.commit()
        action_id = action_log.id

    # Call undo API
    res = client.post(f"/api/agents/actions/{action_id}/undo")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert data["status"] == "restored"

    with app.app_context():
        # Verify expense is back in DB
        restored = db.session.get(Expense, "test-action-undo-1")
        assert restored is not None
        assert restored.title == "Chairs Repair"
