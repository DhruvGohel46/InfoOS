import pytest
import json
from unittest.mock import MagicMock
from models import db, Inventory, Product, Worker, Bill, Expense
from agents.tools import AgentToolRegistry, execute_mutating_tool
from agents.permission_gate import (
    PermissionGate,
    validate_tool_args,
    dry_run_tool,
    HARDCODED_CONFIRMATION_TOOLS,
    generate_diff_summary,
)
from agents.domain_agents import DomainAgent
from agents.llm_adapter import AgentResponse, ToolCall


def test_registry_classification_completeness(app):
    """All tools registered in AgentToolRegistry must be classified as mutating or read-only."""
    with app.app_context():
        all_names = AgentToolRegistry.all_tool_names()
        assert len(all_names) > 30

        for name in all_names:
            is_mut = AgentToolRegistry.is_mutating(name)
            if name.startswith("propose_") or name in (
                "delete_notification",
                "restore_deleted_item",
                "restore_last_bulk_delete",
            ):
                assert is_mut is True, f"Tool {name} should be mutating"
            else:
                assert is_mut is False, f"Tool {name} should be read-only"

            # Every mutating tool must be able to generate a diff summary without crashing
            if is_mut:
                diff = generate_diff_summary(name, {})
                assert isinstance(diff, str) and len(diff) > 0


def test_parameter_validation_catches_missing_and_wrong_types(app):
    """Schema validator must catch missing mandatory parameters and wrong datatypes."""
    with app.app_context():
        # Missing worker_id and amount for propose_record_advance
        errs = validate_tool_args("propose_record_advance", {})
        assert any("worker_id" in e for e in errs)
        assert any("amount" in e for e in errs)

        # Invalid type (string for delta_quantity instead of number)
        errs_type = validate_tool_args(
            "propose_adjust_stock", {"delta_quantity": "not_a_number", "reason": "Restock"}
        )
        assert any("delta_quantity" in e for e in errs_type)


def test_dry_run_catches_negative_stock_and_missing_entities(app):
    """Dry run must reject operations that would drop stock below 0 or reference non-existent workers."""
    with app.app_context():
        # Clean / setup test product & inventory
        prod = Product.query.filter_by(product_id="DRY-RUN-1").first()
        if not prod:
            prod = Product(product_id="DRY-RUN-1", name="Dry Run Item", price=50.0)
            db.session.add(prod)
            db.session.commit()

        inv = Inventory.query.filter_by(product_id="DRY-RUN-1").first()
        if not inv:
            inv = Inventory(
                product_id="DRY-RUN-1",
                name="Dry Run Item",
                type="DIRECT_SALE",
                stock=10,
                unit="pcs",
            )
            db.session.add(inv)
            db.session.commit()
        else:
            inv.stock = 10
            db.session.commit()

        try:
            # Stock deduction of -15 should be caught by dry run because current stock is 10
            err = dry_run_tool(
                "propose_adjust_stock",
                {"product_id": "DRY-RUN-1", "delta_quantity": -15, "reason": "Spoilage"},
            )
            assert err is not None
            assert "below zero" in err

            # Non-existent worker ID
            err_w = dry_run_tool(
                "propose_record_advance",
                {"worker_id": "non_existent_worker_999", "amount": 500, "reason": "Advance"},
            )
            assert err_w is not None
            assert "does not exist" in err_w
        finally:
            if inv in db.session:
                db.session.delete(inv)
            if prod in db.session:
                db.session.delete(prod)
            db.session.commit()


def test_multi_round_tool_chaining(app):
    """DomainAgent.run_stream must support multi-round chaining: read tool round 1 -> proposal round 2 -> synthesis round 3."""
    with app.app_context():
        agent = DomainAgent(
            name="worker",
            base_prompt="Worker agent",
            tools=AgentToolRegistry.get_worker_tools(),
        )

        mock_adapter = MagicMock()

        # Turn 1: LLM calls list_workers
        tc1 = ToolCall(id="call_1", name="list_workers", args={})
        res1 = AgentResponse(
            content="", tool_calls=[tc1], input_tokens=10, output_tokens=5, estimated_cost=0.001
        )

        # Turn 2: LLM receives worker list and calls propose_record_advance
        w = Worker.query.filter_by(worker_id="W-CHAIN-1").first()
        if not w:
            w = Worker(worker_id="W-CHAIN-1", name="Chain Worker", salary=10000.0, role="Chef")
            db.session.add(w)
            db.session.commit()

        try:
            tc2 = ToolCall(
                id="call_2",
                name="propose_record_advance",
                args={"worker_id": "W-CHAIN-1", "amount": 1000, "reason": "Medical"},
            )
            res2 = AgentResponse(
                content="",
                tool_calls=[tc2],
                input_tokens=15,
                output_tokens=10,
                estimated_cost=0.002,
            )

            # Turn 3: Synthesis final response
            final_json = json.dumps(
                {
                    "title": {"icon": "staff", "text": "Advance Proposal Staged"},
                    "sections": [
                        {
                            "type": "insight_block",
                            "icon": "alert_warning",
                            "heading": "Approval Required",
                            "body": "Staged ₹1,000.00 advance for Chain Worker. Awaiting approval.",
                        }
                    ],
                    "meta": {"status": "warning", "statusIcon": "status_warning"},
                }
            )
            res3 = AgentResponse(
                content=final_json,
                tool_calls=None,
                input_tokens=20,
                output_tokens=30,
                estimated_cost=0.003,
            )

            mock_adapter.chat.side_effect = [res1, res2, res3]

            events = list(
                agent.run_stream(
                    user_message="Give 1000 advance to Chain Worker",
                    adapter=mock_adapter,
                    model_name="mock-model",
                    max_tool_rounds=3,
                )
            )

            # Must have dispatched tools across rounds
            tool_events = [data for evt, data in events if evt == "status" and "tool" in data]
            dispatched_tool_names = [t["tool"] for t in tool_events if t.get("tool")]
            assert "list_workers" in dispatched_tool_names
            assert "propose_record_advance" in dispatched_tool_names

            # Final event must be final
            final_events = [data for evt, data in events if evt == "final"]
            assert len(final_events) == 1
            assert len(final_events[0]["pending_actions"]) == 1
            assert final_events[0]["pending_actions"][0]["tool_name"] == "propose_record_advance"
        finally:
            if w in db.session:
                db.session.delete(w)
            db.session.commit()


def test_mutating_tool_deferred_when_paired_with_read(app):
    """When a read tool and mutating tool are issued in the same turn, the mutating tool must be deferred."""
    with app.app_context():
        agent = DomainAgent(
            name="worker",
            base_prompt="Worker agent",
            tools=AgentToolRegistry.get_worker_tools(),
        )

        mock_adapter = MagicMock()

        # Turn 1: LLM returns both list_workers AND propose_record_advance with a guess ID
        tc1 = ToolCall(id="call_read", name="list_workers", args={})
        tc2 = ToolCall(
            id="call_mut",
            name="propose_record_advance",
            args={"worker_id": "guess_id", "amount": 500, "reason": "Advance"},
        )
        res1 = AgentResponse(
            content="",
            tool_calls=[tc1, tc2],
            input_tokens=10,
            output_tokens=10,
            estimated_cost=0.001,
        )

        # Turn 2: Synthesis response
        res2 = AgentResponse(
            content="Final synthesized response",
            tool_calls=None,
            input_tokens=15,
            output_tokens=15,
            estimated_cost=0.002,
        )

        mock_adapter.chat.side_effect = [res1, res2]

        events = list(
            agent.run_stream(
                user_message="Find worker and give advance",
                adapter=mock_adapter,
                model_name="mock-model",
                max_tool_rounds=2,
            )
        )

        final_events = [data for evt, data in events if evt == "final"]
        assert len(final_events) == 1
        # propose_record_advance was deferred so it should NOT be in pending_actions
        assert len(final_events[0]["pending_actions"]) == 0
