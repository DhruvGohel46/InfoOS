"""Deterministic Pre-LLM Routing & Zero-Cost Fast Path Short Circuit.

Optimizes token usage and latency by:
1. Routing user queries to target domain agents using pattern matching without an LLM Orchestrator call.
2. Executing frequent read-only queries (sales, attendance, stock alerts, reminders) directly from SQLite at 0 tokens and $0.00 cost.
"""

import json
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple
from agents.tools import execute_read_tool

# Regex patterns for deterministic domain classification
DOMAIN_PATTERNS = {
    "analytics": [
        r"\b(sales?|revenue|profit|income|turnover|earnings?|orders? count|summary for|kpi|business performance)\b",
        r"\b(how much (did we (make|sell|earn)|we made|sold|earned)|sell today|sold today|top selling|best selling)\b",
    ],
    "worker": [
        r"\b(workers?|staffs?|employees?|attendance|present|absent|salary|payroll|advance|wage|shift)\b",
        r"\b(who is (here|working|present|absent)|mark (in|out|present))\b",
    ],
    "inventory": [
        r"\b(inventory|stocks?|quantity|units left|low stock|out of stock|restock|threshold|spoilage|shrinkage)\b",
        r"\b(how many .+ (left|in stock))\b",
    ],
    "product": [
        r"\b(products?|items?|menus?|catalogs?|price of|category|categories|groups?|recipes?|variations?|addons?)\b",
        r"\b(add (new )?(item|product|dish)|update price|toggle group)\b",
    ],
    "expense": [
        r"\b(expenses?|spends?|bill payment|utility|rent|maintenance|paid out|cost spent)\b",
        r"\b(log expense|record expense|spent on)\b",
    ],
    "reminder": [
        r"\b(reminders?|tasks?|alerts?|alarms?|schedules?|notify me|remind me|todo)\b",
    ],
    "billing": [
        r"\b(bills?|receipts?|invoices?|kots?|void bill|cancel order|refund|table no)\b",
    ],
}


def classify_intent_deterministic(query: str) -> Optional[str]:
    """Classify user intent into target domain without invoking an LLM.

    Returns the domain name or None if ambiguous.
    """
    text = query.lower().strip()
    for domain, patterns in DOMAIN_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                return domain
    return None


def try_zero_cost_fast_path(query: str) -> Optional[Dict[str, Any]]:
    """Check if query is a standard read-only question that can be answered

    directly from local SQLite services with zero LLM API cost (0 tokens).
    """
    text = query.lower().strip().replace("'", "").replace("’", "").strip(" ?.")

    # 1. Today's Sales / Business Performance
    if re.search(
        r"^(todays?\s+(sales?|profit|revenue|summary|performance)|sales?\s+today|how\s+(are|were|was)\s+(the\s+)?sales?\s+today|what\s+(are|were|is|was)\s+todays?\s+sales?)$",
        text,
    ):
        res = execute_read_tool("get_sales_kpi_summary", {"period": "today"})
        if "total_sales" in res:
            orders = res.get("total_orders", 0)
            sales = res.get("total_sales", 0.0)
            profit = res.get("net_profit", 0.0)
            expenses = res.get("total_expenses", 0.0)
            avg = res.get("average_bill_value", 0.0)

            structured_payload = {
                "title": {"icon": "sales_comparison", "text": "Today's Sales Performance Summary"},
                "sections": [
                    {
                        "type": "metric_list",
                        "items": [
                            {"label": "Total Revenue", "value": f"₹{sales:,.2f}"},
                            {"label": "Total Orders", "value": f"{orders} bills"},
                            {"label": "Net Profit", "value": f"₹{profit:,.2f}"},
                            {"label": "Expenses Logged", "value": f"₹{expenses:,.2f}"},
                            {"label": "Average Bill Value", "value": f"₹{avg:,.2f}"},
                        ],
                    },
                    {"type": "divider"},
                    {
                        "type": "insight_block",
                        "icon": "ai_review",
                        "heading": "AI Review & Actionable Insights",
                        "body": (
                            "Today's store sales are tracking in real-time. "
                            + (
                                f"Average bill value is ₹{avg:,.2f}. Review high-margin item pairings to increase basket size during evening peak hours."
                                if sales > 0
                                else "Trading day is in progress. Ensure billing registers and POS terminals are ready for peak customer footfall."
                            )
                        ),
                    },
                ],
                "meta": {"status": "normal", "statusIcon": "status_normal"},
            }

            return {
                "handled": True,
                "agent": "analytics",
                "response": json.dumps(structured_payload),
                "data": res,
                "steps": [
                    {
                        "title": "Queried Sales Summary",
                        "details": "Read today's KPIs from local SQLite database",
                        "tool": "get_sales_kpi_summary",
                        "status": "completed",
                    }
                ],
                "fast_path": True,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
            }

    # 2. Yesterday's Sales
    if re.search(r"^(yesterdays?\s+(sales?|profit|revenue|summary)|sales?\s+yesterday)$", text):
        res = execute_read_tool("get_sales_kpi_summary", {"period": "yesterday"})
        if "total_sales" in res:
            orders = res.get("total_orders", 0)
            sales = res.get("total_sales", 0.0)
            profit = res.get("net_profit", 0.0)
            expenses = res.get("total_expenses", 0.0)
            avg = res.get("average_bill_value", 0.0)

            structured_payload = {
                "title": {
                    "icon": "sales_comparison",
                    "text": "Yesterday's Sales Performance Summary",
                },
                "sections": [
                    {
                        "type": "metric_list",
                        "items": [
                            {"label": "Total Revenue", "value": f"₹{sales:,.2f}"},
                            {"label": "Total Orders", "value": f"{orders} bills"},
                            {"label": "Net Profit", "value": f"₹{profit:,.2f}"},
                            {"label": "Expenses Logged", "value": f"₹{expenses:,.2f}"},
                            {"label": "Average Bill Value", "value": f"₹{avg:,.2f}"},
                        ],
                    },
                    {"type": "divider"},
                    {
                        "type": "insight_block",
                        "icon": "ai_review",
                        "heading": "AI Review & Actionable Insights",
                        "body": "Yesterday completed with steady transaction volume. Compare ticket velocity against weekly trends to optimize floor staffing.",
                    },
                ],
                "meta": {"status": "normal", "statusIcon": "status_normal"},
            }

            return {
                "handled": True,
                "agent": "analytics",
                "response": json.dumps(structured_payload),
                "data": res,
                "steps": [
                    {
                        "title": "Queried Yesterday's Sales",
                        "details": "Read yesterday's KPIs from local SQLite database",
                        "tool": "get_sales_kpi_summary",
                        "status": "completed",
                    }
                ],
                "fast_path": True,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
            }

    # 3. Who is present today / Staff Attendance
    if re.search(
        r"^(who is (present|working|here) today|todays?\s+attendance|show present workers|attendance today)$",
        text,
    ):
        res = execute_read_tool("get_worker_attendance", {})
        if "attendance" in res:
            records = res.get("attendance", [])
            present = [r for r in records if r.get("status") in ["Present", "present"]]

            table_rows = []
            for w in records:
                st = w.get("status") or "Not Marked"
                is_p = st.lower() == "present"
                table_rows.append(
                    [
                        w.get("worker_id") or "W001",
                        w.get("name") or w.get("worker_name", "Staff"),
                        w.get("role") or "Staff",
                        {
                            "text": st,
                            "status": "present" if is_p else "not_marked",
                            "icon": "alert_success" if is_p else "alert_warning",
                        },
                    ]
                )

            structured_payload = {
                "title": {
                    "icon": "attendance",
                    "text": f"Staff Attendance Report — {datetime.now().strftime('%Y-%m-%d')}",
                },
                "sections": [
                    {
                        "type": "metric_list",
                        "items": [
                            {"label": "Total Active Staff", "value": str(len(records))},
                            {"label": "Attendance Marked Today", "value": str(len(present))},
                            {
                                "label": "Unmarked Attendance",
                                "value": str(len(records) - len(present)),
                            },
                        ],
                    },
                    {"type": "divider"},
                    {
                        "type": "table",
                        "icon": "attendance",
                        "heading": "Today's Roster Status",
                        "columns": ["Worker ID", "Name", "Role", "Status Today"],
                        "rows": (
                            table_rows
                            if table_rows
                            else [
                                [
                                    "-",
                                    "No Active Staff",
                                    "-",
                                    {"text": "None", "status": "normal", "icon": "alert_success"},
                                ]
                            ]
                        ),
                    },
                    {"type": "divider"},
                    {
                        "type": "insight_block",
                        "icon": "ai_review",
                        "heading": "AI Review & Actionable Insights",
                        "body": (
                            "All active staff have their attendance recorded for today."
                            if len(present) == len(records) and len(records) > 0
                            else "Unmarked staff attendance detected. Please update daily attendance records (Present / Absent / Half-day) before peak service hours to maintain accurate shift logs and payroll calculations."
                        ),
                    },
                ],
                "meta": {
                    "status": (
                        "normal" if len(present) == len(records) and len(records) > 0 else "warning"
                    ),
                    "statusIcon": (
                        "status_normal"
                        if len(present) == len(records) and len(records) > 0
                        else "status_warning"
                    ),
                },
            }

            return {
                "handled": True,
                "agent": "worker",
                "response": json.dumps(structured_payload),
                "data": res,
                "steps": [
                    {
                        "title": "Queried Staff Attendance",
                        "details": "Read active worker attendance from local SQLite database",
                        "tool": "get_worker_attendance",
                        "status": "completed",
                    }
                ],
                "fast_path": True,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
            }

    # 4. Low Stock Inventory Items
    if re.search(
        r"^(check\s+)?(low stock( items)?|out of stock( items)?|items low in stock|what items are low)$",
        text,
    ):
        res = execute_read_tool("get_inventory_status", {"low_stock_only": True})
        if "inventory" in res:
            items = res.get("inventory", [])
            table_rows = []
            for item in items:
                table_rows.append(
                    [
                        item.get("name", "Item"),
                        f"{item.get('stock', 0)} {item.get('unit', 'units')}",
                        str(item.get("alert_threshold", 0)),
                        {"text": "Low Stock", "status": "warning", "icon": "alert_warning"},
                    ]
                )

            structured_payload = {
                "title": {
                    "icon": "low_stock" if items else "inventory",
                    "text": "Low Stock Inventory Report",
                },
                "sections": [
                    {
                        "type": "metric_list",
                        "items": [
                            {"label": "Total Low Stock Items", "value": str(len(items))},
                            {
                                "label": "Store Alert Status",
                                "value": "Action Required" if items else "All Systems Normal",
                                "note": (
                                    "Items at or below threshold"
                                    if items
                                    else "No items currently at or below alert thresholds"
                                ),
                            },
                        ],
                    },
                    *(
                        [
                            {"type": "divider"},
                            {
                                "type": "table",
                                "icon": "inventory",
                                "heading": "Critical Inventory Thresholds",
                                "columns": ["Item Name", "Current Stock", "Threshold", "Status"],
                                "rows": table_rows,
                            },
                        ]
                        if items
                        else []
                    ),
                    {"type": "divider"},
                    {
                        "type": "insight_block",
                        "icon": "ai_review",
                        "heading": "AI Review & Actionable Insights",
                        "body": (
                            "Great news! Based on live inventory records, all stock items and raw materials are resting safely above designated alert thresholds. No urgent restocks are required at this moment."
                            if not items
                            else f"{len(items)} items have crossed their minimum safety threshold. Review vendor lead times and initiate restocking to avoid operational interruptions during peak trading hours."
                        ),
                    },
                ],
                "meta": {
                    "status": "warning" if items else "normal",
                    "statusIcon": "status_warning" if items else "status_normal",
                },
            }

            return {
                "handled": True,
                "agent": "inventory",
                "response": json.dumps(structured_payload),
                "data": res,
                "steps": [
                    {
                        "title": "Queried Low Stock Status",
                        "details": "Checked inventory safety thresholds from local SQLite database",
                        "tool": "get_inventory_status",
                        "status": "completed",
                    }
                ],
                "fast_path": True,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
            }

    # 5. Active Reminders
    if re.search(r"^(show|list|check|what are)?\s*(my )?(active )?reminders( list)?$", text):
        res = execute_read_tool("get_pending_reminders", {"limit": 5})
        if "reminders" in res:
            rems = res.get("reminders", [])
            action_items = [
                {
                    "title": r.get("title", "Task"),
                    "body": f"Scheduled Due: {r.get('reminder_time', 'N/A')}",
                }
                for r in rems
            ]

            structured_payload = {
                "title": {"icon": "task", "text": "Operational Task & Reminders Schedule"},
                "sections": [
                    {
                        "type": "metric_list",
                        "items": [
                            {"label": "Active Reminders", "value": str(len(rems))},
                            {
                                "label": "Status",
                                "value": "Pending Actions" if rems else "All Clear",
                            },
                        ],
                    },
                    *(
                        [
                            {"type": "divider"},
                            {
                                "type": "action_list",
                                "icon": "task",
                                "heading": "Pending Reminders",
                                "items": action_items,
                            },
                        ]
                        if rems
                        else []
                    ),
                    {"type": "divider"},
                    {
                        "type": "insight_block",
                        "icon": "ai_review",
                        "heading": "AI Review & Actionable Insights",
                        "body": "Operational tasks and vendor schedules are synchronized with your store calendar.",
                    },
                ],
                "meta": {"status": "normal", "statusIcon": "status_normal"},
            }

            return {
                "handled": True,
                "agent": "reminder",
                "response": json.dumps(structured_payload),
                "data": res,
                "steps": [
                    {
                        "title": "Queried Active Reminders",
                        "details": "Read pending task alerts from local SQLite database",
                        "tool": "get_pending_reminders",
                        "status": "completed",
                    }
                ],
                "fast_path": True,
                "input_tokens": 0,
                "output_tokens": 0,
                "estimated_cost": 0.0,
            }

    return None
