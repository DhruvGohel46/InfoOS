"""Deterministic Pre-LLM Routing & Zero-Cost Fast Path Short Circuit.

Optimizes token usage and latency by:
1. Routing user queries to target domain agents using pattern matching without an LLM Orchestrator call.
2. Executing frequent read-only queries (sales, attendance, stock alerts, reminders) directly from SQLite at 0 tokens and $0.00 cost.
"""

import json
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, Tuple, List
from agents.tools import execute_read_tool

# =============================================================================
# ORDER-DEPENDENT DOMAIN CLASSIFICATION PATTERNS
#
# CRITICAL NOTICE ON MATCH ORDER:
# Python dict iteration preserves insertion order (Python 3.7+). The ordering
# of keys in DOMAIN_PATTERNS is strictly order-dependent and intentional:
#
# 1. 'analytics' MUST precede 'product' and 'billing':
#    Queries like "What are the top 5 best selling products today?" or "whats
#    the sales of foods group" contain product-level nouns ('products', 'group')
#    AND analytics intents ('best selling', 'sales', 'revenue', 'earn'). If
#    'product' is checked first, the user's intent is misrouted to the catalog
#    agent which lacks financial/sales tools, inducing tool hallucination.
#
# 2. 'expense' MUST precede generic 'billing':
#    Queries like "today i give 1000 to raju bhai for coldrink bill" contain
#    the word 'bill' which would otherwise trigger POS customer billing. Vendor,
#    supplier, utility, and petty cash spending must resolve to 'expense'.
#
# 3. Vendor indicators MUST disambiguate from worker-adjacent words:
#    Phrases like "workers lunch bill to tiffin provider" contain "workers"
#    but describe third-party vendor expenses, not staff salary/advances.
# =============================================================================
DOMAIN_PATTERNS = {
    "analytics": [
        r"\b(sales?|revenue|profit|income|turnover|earnings?|orders?\s+count|summary\s+for|kpi|business\s+performance)\b",
        r"\b(how\s+much\s+(did\s+we\s+(make|sell|earn)|we\s+made|sold|earned)|sell\s+today|sold\s+today|top\s+selling|best\s+selling|most\s+selling|worst\s+selling|dead\s+stock)\b",
        r"\b(money\s+i\s+earn|earn\s+from|sales\s+of|sales\s+details?)\b",
    ],
    "expense": [
        r"\b(log\s+expense|record\s+expense|add\s+expense|spent\s+on|paid\s+out|cost\s+spent|petty\s+cash)\b",
        r"\b(give|gave|giving|paid|pay|payment|spent|bought|purchased|kharch|kharcha)\b.*\b(to|for|bhai|ben|vendor|supplier|bill|cash|rs|rupees?|\d+k?)\b",
        r"\b(expenses?|spends?|utility\s+bill|rent\s+payment|maintenance\s+cost|dairy\s+bill|milk\s+bill|coldrink\s+bill|tiffin\s+(bill|provider))\b",
    ],
    "worker": [
        r"\b(workers?|staffs?|employees?|attendance|present|absent|salary|payroll|advance|wage|shift)\b",
        r"\b(who\s+is\s+(here|working|present|absent)|mark\s+(in|out|present))\b",
    ],
    "inventory": [
        r"\b(inventory|stocks?|quantity|units\s+left|low\s+stock|out\s+of\s+stock|restock|threshold|spoilage|shrinkage)\b",
        r"\b(how\s+many\s+.+\s+(left|in\s+stock))\b",
    ],
    "product": [
        r"\b(products?|items?|menus?|catalogs?|prices?|price\s+of|category|categories|groups?|recipes?|variations?|addons?)\b",
        r"\b(add\s+(new\s+)?(item|product|dish)|update\s+price|toggle\s+group|change\s+.+\s+price)\b",
    ],
    "reminder": [
        r"\b(reminders?|tasks?|alerts?|alarms?|schedules?|notify\s+me|remind\s+me|todo)\b",
    ],
    "billing": [
        r"\b(customer\s+bills?|pos\s+bills?|recent\s+bills?|bill\s+history|sales?\s+bills?|table\s+no|void\s+bill|cancel\s+order|refund|kots?|pos\s+receipt)\b",
        r"\b(show|get|list|fetch|view)\s+(recent\s+)?(bills?|invoices?|receipts?)\b",
    ],
}


VENDOR_EXPENSE_INDICATORS = {
    "tiffin provider",
    "tiffin",
    "coldrink bill",
    "dairy bill",
    "milk bill",
    "tea bill",
    "lunch bill",
    "dinner bill",
    "raw material",
    "vendor",
    "supplier",
    "electricity bill",
    "rent payment",
}

EMPLOYEE_PAYROLL_KEYWORDS = {
    "advance",
    "salary",
    "attendance",
    "present",
    "absent",
    "shift",
    "payroll",
    "wage",
}


def _extract_prior_domain(history: List[Dict[str, Any]]) -> Optional[str]:
    """Inspect recent turns in history to extract the last active domain agent."""
    if not history:
        return None
    for turn in reversed(history):
        # 1. Direct agent attribute
        agent = turn.get("agent") or turn.get("routed_agent")
        if agent and agent in DOMAIN_PATTERNS:
            return agent
        # 2. Check content for structured JSON icon/title hints from assistant turn
        content = turn.get("content") or turn.get("text") or ""
        if isinstance(content, str) and content.strip().startswith("{"):
            try:
                parsed = json.loads(content)
                icon = parsed.get("title", {}).get("icon", "")
                icon_map = {
                    "attendance": "worker",
                    "staff": "worker",
                    "expense": "expense",
                    "sales_comparison": "analytics",
                    "finance": "analytics",
                    "prediction": "analytics",
                    "product": "product",
                    "inventory": "inventory",
                    "low_stock": "inventory",
                    "bill": "billing",
                    "task": "reminder",
                }
                if icon in icon_map:
                    return icon_map[icon]
            except Exception:
                pass
        # 3. Check text of the prior turn against domain patterns
        if isinstance(content, str) and len(content.strip()) > 3:
            for domain, patterns in DOMAIN_PATTERNS.items():
                for pat in patterns:
                    if re.search(pat, content, re.IGNORECASE):
                        return domain
    return None


def classify_intent_deterministic(
    query: str, history: Optional[List[Dict[str, Any]]] = None
) -> Optional[str]:
    """Classify user intent into target domain without invoking an LLM.

    Returns the domain name or None if ambiguous.
    """
    text = query.lower().strip()
    words = text.split()

    # Disambiguation Step 0: Explicit reminder commands take precedence over topics mentioned within
    # (e.g. "Remind me to call supplier at 4 PM" -> reminder, not expense)
    if re.search(
        r"\b(reminders?|tasks?|alerts?|alarms?|schedules?|notify\s+me|remind\s+me|todo)\b", text
    ):
        return "reminder"

    # Disambiguation Step 1: Vendor expenses take precedence over incidental worker words
    # (e.g. "i give 3450 for the workers lunch bill to tiffin provider" -> expense)
    has_vendor_indicator = any(ind in text for ind in VENDOR_EXPENSE_INDICATORS)
    has_employee_advance = any(kw in text for kw in ["advance", "salary", "payroll", "wage"])

    if has_vendor_indicator and not has_employee_advance:
        return "expense"

    # Disambiguation Step 2: Check worker payroll / attendance keywords
    if any(kw in text for kw in EMPLOYEE_PAYROLL_KEYWORDS):
        return "worker"

    # Disambiguation Step 3: Handle direct bill creation requests
    if re.search(r"\b(create|make|new|generate)\s+(a\s+)?bill\b", text):
        return "billing"

    # Disambiguation Step 4: Check ordered domain patterns (Analytics before Product/Billing)
    matched_domain = None
    for domain, patterns in DOMAIN_PATTERNS.items():
        for pat in patterns:
            if re.search(pat, text, re.IGNORECASE):
                matched_domain = domain
                break
        if matched_domain:
            break

    # Additional requirement for short follow-up continuity:
    # If the user input is short (<= 3 words, e.g. "dsmiuddin", "tandoori", "yes"):
    # - If matched_domain is ALREADY found from domain-specific keywords (e.g. "pizza price" -> product),
    #   do NOT inherit; switch to the new domain.
    # - Only if matched_domain is None, AND history has a prior active domain, inherit that prior domain.
    if len(words) <= 3 and matched_domain is None and history:
        prior_domain = _extract_prior_domain(history)
        if prior_domain:
            return prior_domain

    return matched_domain


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
