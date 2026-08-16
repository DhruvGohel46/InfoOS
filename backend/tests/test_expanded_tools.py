import json
import pytest
from datetime import datetime, date
from models import (
    db,
    Product,
    Category,
    ItemGroup,
    Inventory,
    Bill,
    Worker,
    WorkerType,
    Attendance,
    Advance,
    Expense,
    ExpenseType,
    Reminder,
    Notification,
    DailySalesSummary,
)
from agents.tools import AgentToolRegistry, execute_read_tool, execute_mutating_tool
from agents.permission_gate import generate_diff_summary


def test_tool_registry_expanded_counts():
    """Verify tool counts across all domain agents."""
    billing_tools = AgentToolRegistry.get_billing_tools()
    inv_tools = AgentToolRegistry.get_inventory_tools()
    prod_tools = AgentToolRegistry.get_product_tools()
    worker_tools = AgentToolRegistry.get_worker_tools()
    exp_tools = AgentToolRegistry.get_expense_tools()
    analytics_tools = AgentToolRegistry.get_analytics_tools()
    rem_tools = AgentToolRegistry.get_reminder_tools()

    assert len(billing_tools) >= 13
    assert len(inv_tools) >= 11
    assert len(prod_tools) >= 19
    assert len(worker_tools) >= 13
    assert len(exp_tools) >= 13
    assert len(analytics_tools) >= 11
    assert len(rem_tools) >= 14

    all_names = AgentToolRegistry.all_tool_names()
    assert len(all_names) >= 94  # Across all agents


def test_billing_expanded_tools(app):
    with app.app_context():
        # 1. Propose Hold Bill
        hold_res = execute_mutating_tool(
            "propose_hold_bill",
            {
                "items": [{"product_id": "TEST_P1", "quantity": 2}],
                "customer_name": "Karan Hold",
                "customer_mobile": "9998887776",
                "table_no": "T-12",
            },
        )
        assert hold_res["success"] is True
        bill_no = hold_res["bill_no"]

        # 2. Recall Hold Bill
        recall_res = execute_mutating_tool(
            "propose_recall_hold_bill",
            {"bill_no": bill_no, "payment_method": "UPI"},
        )
        assert recall_res["success"] is True
        assert recall_res["status"] == "CONFIRMED"

        # 3. Apply Bill Discount
        disc_res = execute_mutating_tool(
            "propose_apply_bill_discount",
            {
                "bill_no": bill_no,
                "discount_type": "flat",
                "discount_value": 10.0,
                "reason": "VIP Promo",
            },
        )
        assert disc_res["success"] is True

        # 4. Customer Order History
        hist_res = execute_read_tool("get_customer_order_history", {"query": "9998887776"})
        assert hist_res["found"] is True
        assert hist_res["total_orders"] >= 1

        # 5. Bill Payment Summary
        pay_res = execute_read_tool(
            "get_bill_payment_summary", {"target_date": date.today().isoformat()}
        )
        assert "total_collection" in pay_res


def test_inventory_expanded_tools(app):
    with app.app_context():
        # 1. Propose Create Raw Material
        create_res = execute_mutating_tool(
            "propose_create_raw_material",
            {
                "name": "Mozzarella Cheese",
                "unit": "kg",
                "unit_price": 450.0,
                "alert_threshold": 3.0,
                "initial_stock": 10.0,
            },
        )
        assert create_res["success"] is True
        inv_id = create_res["inventory_id"]

        # 2. Propose Update Inventory Item
        upd_res = execute_mutating_tool(
            "propose_update_inventory_item",
            {"inventory_id": inv_id, "alert_threshold": 5.0, "unit_price": 460.0},
        )
        assert upd_res["success"] is True

        # 3. Propose Reset Stock Count
        reset_res = execute_mutating_tool(
            "propose_reset_stock_count",
            {"inventory_id": inv_id, "physical_count": 8.5, "reason": "Weekly Stock Audit"},
        )
        assert reset_res["success"] is True
        assert reset_res["reconciled_stock"] == 8.5

        # 4. Stock Consumption Rate
        rate_res = execute_read_tool(
            "get_stock_consumption_rate", {"query": "Mozzarella", "days": 7}
        )
        assert "consumption_rates" in rate_res

        # 5. Inventory Logs
        logs_res = execute_read_tool("get_inventory_logs", {"limit": 10})
        assert "logs" in logs_res


def test_product_expanded_tools(app):
    with app.app_context():
        # 1. Propose Create Item Group
        grp_res = execute_mutating_tool(
            "propose_create_item_group",
            {"name": "Bakery Delights", "description": "Fresh baked treats", "display_order": 5},
        )
        assert grp_res["success"] is True
        grp_id = grp_res["group_id"]

        # 2. Propose Create Category
        cat_res = execute_mutating_tool(
            "propose_create_category",
            {"name": "Croissants & Buns", "group_id": grp_id, "description": "Butter croissants"},
        )
        assert cat_res["success"] is True
        cat_id = cat_res["category_id"]

        # 3. Propose Update Category
        upd_cat = execute_mutating_tool(
            "propose_update_category",
            {"category_id": cat_id, "name": "Artisan Croissants"},
        )
        assert upd_cat["success"] is True

        # 4. Propose Create Product
        prod_res = execute_mutating_tool(
            "propose_create_product",
            {
                "name": "Almond Croissant",
                "price": 140.0,
                "category_id": cat_id,
                "description": "Filled with almond frangipane",
            },
        )
        assert prod_res["success"] is True
        prod_id = prod_res["product_id"]

        # 5. Product Details
        detail_res = execute_read_tool("get_product_details", {"product_id": prod_id})
        assert detail_res["found"] is True
        assert detail_res["name"] == "Almond Croissant"

        # 6. Bulk Update Prices
        bulk_price = execute_mutating_tool(
            "propose_bulk_update_prices",
            {"category_id": cat_id, "percentage_change": 10.0},
        )
        assert bulk_price["success"] is True

        # 7. Bulk Toggle Products
        toggle_res = execute_mutating_tool(
            "propose_bulk_toggle_products",
            {"category_id": cat_id, "active": False},
        )
        assert toggle_res["success"] is True
        assert toggle_res["new_status"] == "disabled"


def test_worker_expanded_tools(app):
    with app.app_context():
        # 1. Propose Create Worker Role
        role_res = execute_mutating_tool(
            "propose_create_worker_role",
            {"name": "Sous Chef", "description": "Second in kitchen command"},
        )
        assert role_res["success"] is True

        # 2. List Worker Roles
        roles_list = execute_read_tool("list_worker_roles", {})
        assert roles_list["count"] >= 1

        # 3. Propose Create Worker
        w_res = execute_mutating_tool(
            "propose_create_worker",
            {"name": "Rohan Sharma", "salary": 19000.0, "role": "Sous Chef", "phone": "9811122233"},
        )
        assert w_res["success"] is True
        w_id = w_res["worker_id"]

        # 4. Propose Update Worker
        upd_w = execute_mutating_tool(
            "propose_update_worker",
            {"worker_id": w_id, "salary": 20000.0, "description": "Evening shift lead"},
        )
        assert upd_w["success"] is True

        # 5. Bulk Mark Attendance
        bulk_att = execute_mutating_tool(
            "propose_bulk_mark_attendance",
            {"status": "Present", "target_date": date.today().isoformat()},
        )
        assert bulk_att["success"] is True
        assert bulk_att["marked_count"] >= 1

        # 6. Worker Advances
        adv_res = execute_mutating_tool(
            "propose_record_advance",
            {"worker_id": w_id, "amount": 1500.0, "reason": "Travel fuel"},
        )
        assert adv_res["success"] is True

        adv_list = execute_read_tool("get_worker_advances", {"worker_id": w_id})
        assert adv_list["total_unpaid_advances"] >= 1500.0


def test_expense_expanded_tools(app):
    with app.app_context():
        # 1. Propose Update Expense Type
        types = ExpenseType.query.all()
        if types:
            upd_t = execute_mutating_tool(
                "propose_update_expense_type",
                {"type_id": types[0].id, "description": "Updated category description"},
            )
            assert upd_t["success"] is True

        # 2. Propose Bulk Log Expenses
        bulk_exp = execute_mutating_tool(
            "propose_bulk_log_expenses",
            {
                "expenses": [
                    {
                        "title": "Paper Napkins",
                        "category": "Utilities",
                        "amount": 250.0,
                        "payment_method": "Cash",
                    },
                    {
                        "title": "Cleaning Solution",
                        "category": "Utilities",
                        "amount": 350.0,
                        "payment_method": "Cash",
                    },
                ],
                "batch_note": "Morning Grocery/Supplies",
            },
        )
        assert bulk_exp["success"] is True
        assert bulk_exp["logged_count"] == 2

        # 3. Log single expense & Update it
        single_exp = execute_mutating_tool(
            "propose_log_expense",
            {
                "title": "Trash Bags",
                "category": "Utilities",
                "amount": 120.0,
                "payment_method": "Cash",
            },
        )
        e_id = single_exp["expense_id"]

        upd_exp = execute_mutating_tool(
            "propose_update_expense",
            {"expense_id": str(e_id), "amount": 140.0, "title": "Heavy Duty Trash Bags"},
        )
        assert upd_exp["success"] is True
        assert upd_exp["amount"] == 140.0

        # 4. Get Expense by ID
        get_e = execute_read_tool("get_expense_by_id", {"expense_id": str(e_id)})
        assert get_e["found"] is True
        assert get_e["expense"]["title"] == "Heavy Duty Trash Bags"

        # 5. Recurring Expense Forecast
        fore_res = execute_read_tool("get_recurring_expense_forecast", {})
        assert "projected_monthly_fixed_costs" in fore_res


def test_analytics_expanded_tools(app):
    with app.app_context():
        # 1. Category Sales Breakdown
        cat_sales = execute_read_tool("get_category_sales_breakdown", {"period": "this_month"})
        assert "category_breakdown" in cat_sales

        # 2. Order Type Breakdown
        order_types = execute_read_tool("get_order_type_breakdown", {"period": "this_month"})
        assert "order_types" in order_types

        # 3. Peak Days Analysis
        peak_days = execute_read_tool("get_peak_days_analysis", {"days": 30})
        assert "day_of_week_ranking" in peak_days

        # 4. Dead Stock Report
        dead_stock = execute_read_tool("get_dead_stock_report", {"days_threshold": 14})
        assert "dead_products" in dead_stock

        # 5. Profit Margin Analysis
        margin_res = execute_read_tool("get_profit_margin_analysis", {"period": "this_month"})
        assert "net_profit_margin_pct" in margin_res


def test_reminder_expanded_tools(app):
    with app.app_context():
        # 1. Propose Bulk Create Reminders
        bulk_rem = execute_mutating_tool(
            "propose_bulk_create_reminders",
            {
                "template_name": "Store Opening Checklist",
                "tasks": [
                    {
                        "title": "Check Ice Machine",
                        "reminder_time": "2026-08-16 08:30:00",
                        "repeat_type": "daily",
                    },
                    {
                        "title": "Turn on Espresso Boiler",
                        "reminder_time": "2026-08-16 08:45:00",
                        "repeat_type": "daily",
                    },
                ],
            },
        )
        assert bulk_rem["success"] is True
        assert bulk_rem["scheduled_count"] == 2

        # 2. Single reminder creation & update
        single_rem = execute_mutating_tool(
            "propose_create_reminder",
            {
                "title": "Order Fresh Milk",
                "reminder_time": "2026-08-16 17:00:00",
                "repeat_type": "daily",
            },
        )
        r_id = single_rem["reminder_id"]

        upd_rem = execute_mutating_tool(
            "propose_update_reminder",
            {"reminder_id": str(r_id), "title": "Order Organic Milk"},
        )
        assert upd_rem["success"] is True

        # 3. List Notifications
        notifs = execute_read_tool("list_notifications", {"status": "all"})
        assert "notifications" in notifs

        # 4. Propose Mark All Notifications Read
        mark_res = execute_mutating_tool("propose_mark_all_notifications_read", {})
        assert mark_res["success"] is True


def test_diff_summaries_coverage():
    """Verify that permission gate generates diff summaries for all mutating proposal tools."""
    summary = generate_diff_summary("propose_create_category", {"name": "Deserts"})
    assert "Deserts" in summary

    summary2 = generate_diff_summary(
        "propose_hold_bill", {"customer_name": "Amit", "items": [1, 2]}
    )
    assert "Amit" in summary2

    summary3 = generate_diff_summary(
        "propose_create_raw_material", {"name": "Butter", "unit_price": 500, "unit": "kg"}
    )
    assert "Butter" in summary3
