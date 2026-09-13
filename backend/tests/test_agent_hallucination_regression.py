import pytest
import json
from datetime import date, timedelta
from unittest.mock import MagicMock, patch

from agents.fast_path import classify_intent_deterministic
from agents.tools import execute_read_tool, AgentToolRegistry
from agents.domain_agents import DomainAgent, get_status_label
from models import db, DailySalesSummary, Bill, Expense

# =============================================================================
# 1. DETERMINISTIC PRE-ROUTER REGRESSION TESTS
# =============================================================================


def test_best_selling_products_routes_to_analytics():
    """'What are the top 5 best selling products today?' must route to analytics, not product."""
    query = "What are the top 5 best selling products today?"
    domain = classify_intent_deterministic(query)
    assert domain == "analytics", f"Expected 'analytics', got {domain}"


def test_group_sales_queries_route_to_analytics():
    """Group sales queries must route to analytics, not product."""
    queries = [
        "who much money i earn from foods group",
        "whats the sales of foods group",
        "of what is the sales of this group",
        "i want the sales details why you show this",
    ]
    for q in queries:
        domain = classify_intent_deterministic(q)
        assert domain == "analytics", f"Query '{q}' expected 'analytics', got {domain}"


def test_vendor_lunch_bill_to_tiffin_provider_routes_to_expense():
    """Vendor meal payment mentioning 'workers' must route to expense, not worker."""
    query = "i give 3450 for the workers lunch bill to tiffin provider"
    domain = classify_intent_deterministic(query)
    assert domain == "expense", f"Expected 'expense', got {domain}"


def test_worker_salary_advance_routes_to_worker():
    """Explicit staff salary advances must route to worker, not expense."""
    queries = [
        "give Priya a 2000 advance",
        "i give advance to salman today",
    ]
    for q in queries:
        domain = classify_intent_deterministic(q)
        assert domain == "worker", f"Query '{q}' expected 'worker', got {domain}"


def test_vendor_drink_bill_routes_to_expense():
    """Vendor bills mentioning 'bill' must route to expense, not customer billing."""
    query = "today i give the 1000 to raju bhai for coldrink bill"
    domain = classify_intent_deterministic(query)
    assert domain == "expense", f"Expected 'expense', got {domain}"


def test_elliptical_worker_name_inherits_domain():
    """Short name follow-up with no domain keywords must inherit worker domain from history."""
    history = [
        {
            "role": "user",
            "content": "today i give 300 ruppes to my worker for the biryani at dinner",
        },
        {
            "role": "assistant",
            "content": json.dumps(
                {"title": {"icon": "attendance", "text": "Salary Advance Clarification"}}
            ),
            "agent": "worker",
        },
    ]
    query = "dsmiuddin"
    domain = classify_intent_deterministic(query, history=history)
    assert domain == "worker", f"Expected 'worker' inherited domain, got {domain}"


def test_elliptical_followup_with_domain_keywords_switches_domain():
    """Short follow-up (<=3 words) that contains its own domain keywords must NOT blindly inherit.
    It must switch to the new domain.
    """
    history = [
        {"role": "user", "content": "how are the sales today"},
        {
            "role": "assistant",
            "content": json.dumps(
                {"title": {"icon": "sales_comparison", "text": "Sales Overview"}}
            ),
            "agent": "analytics",
        },
    ]
    # 2 words, but contains product-specific intent ("pizza price")
    query = "pizza price"
    domain = classify_intent_deterministic(query, history=history)
    assert domain == "product", f"Expected 'product' switch from 'pizza price', got {domain}"


# =============================================================================
# 2. KPI TOOL DATE-RANGE AGGREGATION REGRESSION TESTS
# =============================================================================


def test_get_sales_kpi_summary_schema_has_new_enums():
    """Verify that get_sales_kpi_summary schema contains the expanded period enum."""
    analytics_tools = AgentToolRegistry.get_analytics_tools()
    kpi_tool = next(t for t in analytics_tools if t["name"] == "get_sales_kpi_summary")
    period_enum = kpi_tool["parameters"]["properties"]["period"]["enum"]

    expected_enums = [
        "today",
        "yesterday",
        "last_7_days",
        "last_30_days",
        "this_month",
        "last_month",
        "this_year",
        "all",
    ]
    for e in expected_enums:
        assert e in period_enum, f"Expected '{e}' in period enum: {period_enum}"


def test_get_sales_kpi_summary_aggregates_date_ranges(app):
    """Verify that get_sales_kpi_summary performs multi-day aggregation for this_month, last_month, this_year."""
    with app.app_context():
        # Clean test entries in DailySalesSummary
        DailySalesSummary.query.delete()
        today = date.today()

        # Insert 3 historical daily summaries
        d1 = today - timedelta(days=2)
        d2 = today - timedelta(days=1)
        d3 = today

        s1 = DailySalesSummary(
            date=d1,
            total_sales=1000.0,
            total_orders=10,
            total_expenses=200.0,
            net_profit=800.0,
            average_bill_value=100.0,
        )
        s2 = DailySalesSummary(
            date=d2,
            total_sales=2000.0,
            total_orders=20,
            total_expenses=400.0,
            net_profit=1600.0,
            average_bill_value=100.0,
        )
        s3 = DailySalesSummary(
            date=d3,
            total_sales=3000.0,
            total_orders=30,
            total_expenses=600.0,
            net_profit=2400.0,
            average_bill_value=100.0,
        )

        db.session.add_all([s1, s2, s3])
        db.session.commit()

        # 1. Test last_7_days (should sum all 3 days: sales=6000, orders=60, exp=1200)
        res_7d = execute_read_tool("get_sales_kpi_summary", {"period": "last_7_days"})
        assert res_7d["total_sales"] == 6000.0
        assert res_7d["total_orders"] == 60
        assert res_7d["total_expenses"] == 1200.0
        assert res_7d["net_profit"] == 4800.0
        assert "start_date" in res_7d
        assert "end_date" in res_7d

        # 2. Test this_year (should include all records from this calendar year)
        res_year = execute_read_tool("get_sales_kpi_summary", {"period": "this_year"})
        assert res_year["total_sales"] >= 6000.0
        assert res_year["total_orders"] >= 60

        # 3. Test yesterday (should only return d2: 2000.0)
        res_yest = execute_read_tool("get_sales_kpi_summary", {"period": "yesterday"})
        assert res_yest["total_sales"] == 2000.0
        assert res_yest["total_orders"] == 20


# =============================================================================
# 3. NO INTERNAL STATUS STRING LEAK REGRESSION TEST
# =============================================================================


def test_domain_agent_never_leaks_status_label_on_synthesis_failure():
    """Assert that a second-turn synthesis failure produces valid structured fallback JSON
    and NEVER leaks internal status text like 'I am executing the tool...' or status labels.
    """
    agent = DomainAgent(
        name="product",
        base_prompt="You are product agent.",
        tools=[
            {
                "name": "search_products",
                "description": "search",
                "parameters": {"type": "object", "properties": {}},
            }
        ],
    )

    # Mock adapter where turn 1 returns a tool call, and turn 2 raises an exception (synthesis failure)
    mock_adapter = MagicMock()
    tool_call = MagicMock()
    tool_call.name = "search_products"
    tool_call.args = {"query": "tandoori"}
    tool_call.id = "call_1"

    # Turn 1: tool call, Turn 2: exception
    from agents.llm_adapter import AgentResponse

    first_resp = AgentResponse(content=None, tool_calls=[tool_call])
    mock_adapter.chat.side_effect = [first_resp, Exception("Gemini remote disconnected")]

    with patch(
        "agents.permission_gate.PermissionGate.dispatch_tool",
        return_value={"items": [{"name": "Tandoori Pizza", "price": 250}]},
    ):
        events = list(
            agent.run_stream(
                user_message="tandoori", adapter=mock_adapter, model_name="gemini-3.5-flash-lite"
            )
        )

    final_event = next(e for e in events if e[0] == "final")
    payload = final_event[1]
    final_response = payload["response"]

    # Assertions
    assert (
        "I am executing the tool" not in final_response
    ), "Leaked raw intermediate execution placeholder!"
    assert final_response != get_status_label("search_products"), "Leaked raw status label text!"

    # Must be valid structured JSON fallback
    parsed = json.loads(final_response)
    assert "title" in parsed
    assert "sections" in parsed
    assert "meta" in parsed
