import json
import logging
from typing import List, Dict, Any, Optional, Tuple
from agents.tools import AgentToolRegistry
from agents.permission_gate import PermissionGate
from agents.llm_adapter import LLMAdapter, AgentResponse, get_adapter, ToolCall
from agents.crypto_utils import decrypt_api_key
from agents.fast_path import classify_intent_deterministic, try_zero_cost_fast_path
from agents.pricing import calculate_cost
from models import (
    AgentConfig,
    AgentPermission,
    Category,
    ItemGroup,
    ExpenseType,
    WorkerType,
)
from agents.status_labels import (
    get_status_label,
    ROUTING_LABEL,
    LLM_CALL_LABEL,
    SYNTHESIS_LABEL,
)

_log = logging.getLogger(__name__)


def _describe_tools(tools: List[Dict[str, Any]]) -> str:
    """Dynamically generate a one-line tool inventory block from registered schemas."""
    if not tools:
        return ""
    lines = [f"- {t['name']}: {t.get('description', 'no description')}" for t in tools]
    return "TOOLS AVAILABLE TO YOU:\n" + "\n".join(lines)


GLOBAL_FORMATTING_AND_REVIEW_INSTRUCTIONS = (
    "FORMATTING & STORE REVIEW RULES (CRITICAL - STRUCTURED JSON ONLY):\n"
    "1. You MUST respond with a valid JSON object adhering strictly to the structured schema below.\n"
    "2. NEVER output freeform markdown strings, raw markdown headers (###), horizontal rules (---), pipe tables, or inline emoji characters.\n"
    "3. Use structured section types ('metric_list', 'insight_block', 'action_list', 'table', 'divider') and icon enum strings instead of emojis.\n"
    "4. Target Schema:\n"
    "{\n"
    '  "title": { "icon": "<icon_enum>", "text": "<Title Text>" },\n'
    '  "sections": [\n'
    "    {\n"
    '      "type": "metric_list",\n'
    '      "items": [\n'
    '        { "label": "<Label>", "value": "<Formatted Value e.g. ₹1,450.00>", "note": "<Optional Note>" }\n'
    "      ]\n"
    "    },\n"
    '    { "type": "divider" },\n'
    "    {\n"
    '      "type": "insight_block",\n'
    '      "icon": "prediction | ai_review | insight | alert_warning | alert_success",\n'
    '      "heading": "<Insight Heading>",\n'
    '      "body": "<Insight commentary>"\n'
    "    },\n"
    "    {\n"
    '      "type": "action_list",\n'
    '      "icon": "tip | task",\n'
    '      "heading": "<Action List Heading>",\n'
    '      "items": [\n'
    '        { "title": "<Item Title>", "body": "<Item Details>" }\n'
    "      ]\n"
    "    },\n"
    "    {\n"
    '      "type": "table",\n'
    '      "icon": "attendance | inventory | finance | order",\n'
    '      "heading": "<Table Heading>",\n'
    '      "columns": ["Col1", "Col2", "Col3"],\n'
    '      "rows": [\n'
    '        ["Val1", "Val2", { "text": "Not Marked", "status": "not_marked", "icon": "alert_warning" }]\n'
    "      ]\n"
    "    }\n"
    "  ],\n"
    '  "meta": {\n'
    '    "status": "normal | warning | critical",\n'
    '    "statusIcon": "status_normal | status_warning | status_critical"\n'
    "  }\n"
    "}\n"
    "ALLOWED ICON ENUMS: sales_comparison, prediction, tip, ai_review, alert_warning, alert_success, alert_critical, inventory, staff, attendance, low_stock, insight, divider, finance, expense, bill, product, order, status_normal, status_warning, status_critical.\n"
    "5. Format all currency as ₹ with 2 decimals (e.g. ₹1,450.00). Dates in YYYY-MM-DD format.\n"
    "6. STORE DATA REVIEW REQUIREMENT: Whenever answering questions regarding store data, include an `insight_block` with icon `ai_review` offering intelligent business commentary for the shop owner.\n"
    "7. SCOPED DELETION & PARITY RULES:\n"
    "   - History-bearing records (Products, Workers, Bills) CANNOT be permanently deleted to preserve transaction and payroll history. When requested, explain the policy and propose setting status to Inactive (`active=False`) or adjusting stock to 0.\n"
    "   - Entities that CAN be deleted via confirmation proposals: Categories (`propose_delete_category`), Item Groups (`propose_delete_item_group`), Expenses (`propose_delete_expense`), Expense Types (`propose_delete_expense_type`), Reminders (`propose_delete_reminder`), and Bulk Deletions (`propose_bulk_delete_*`).\n"
)


class DomainAgent:
    """Base class for functional area domain agents with token and cost optimization."""

    def __init__(self, name: str, base_prompt: str, tools: List[Dict[str, Any]]):
        self.name = name
        self.tools = tools
        tool_desc = _describe_tools(tools)
        full_prompt = (
            base_prompt.strip()
            + "\n\n"
            + GLOBAL_FORMATTING_AND_REVIEW_INSTRUCTIONS
            + "\n"
            + tool_desc
        )
        self.system_prompt = full_prompt.strip()

    def _build_context_messages(
        self, user_message: str, history: Optional[List[Dict[str, Any]]] = None
    ) -> List[Dict[str, Any]]:
        """Build pruned context messages using a strict rolling window and older summary memo."""
        messages: List[Dict[str, Any]] = [{"role": "system", "content": self.system_prompt}]

        if history:
            # If history is long, summarize older turns into a compact memo note
            if len(history) > 6:
                older_turns = history[:-6]
                summary_bits = []
                for turn in older_turns:
                    role = turn.get("role", "user")
                    txt = str(turn.get("content") or turn.get("text") or "")[:60]
                    if txt:
                        summary_bits.append(f"{role}: {txt}")
                if summary_bits:
                    memo = "Context note (prior topics): " + " | ".join(summary_bits[-3:])
                    messages.append({"role": "system", "content": memo})

                recent_turns = history[-6:]
            else:
                recent_turns = history

            for t in recent_turns:
                role = t.get("role", "user")
                if role not in ["user", "assistant", "system"]:
                    role = "user"
                content = t.get("content") or t.get("text") or ""
                messages.append({"role": role, "content": content})

        messages.append({"role": "user", "content": user_message})
        return messages

    def run_stream(
        self,
        user_message: str,
        adapter: LLMAdapter,
        model_name: str,
        history: Optional[List[Dict[str, Any]]] = None,
        actor_sub: str = "admin",
        max_tokens: int = 800,
        max_tool_rounds: int = 3,
    ):
        """Generator yielding ('status', {'label': str, 'tool': Optional[str]}) and finally ('final', dict)."""
        messages = self._build_context_messages(user_message, history)

        pending_actions = []
        executed_actions = []
        tool_results_summary = []
        total_input_tokens = 0
        total_output_tokens = 0
        total_estimated_cost = 0.0

        current_round = 0

        # Initial turn
        yield ("status", {"label": LLM_CALL_LABEL})
        try:
            res: AgentResponse = adapter.chat(
                messages=messages, tools=self.tools, model=model_name, max_tokens=max_tokens
            )
            total_input_tokens += res.input_tokens
            total_output_tokens += res.output_tokens
            total_estimated_cost += res.estimated_cost
        except Exception as e:
            _log.error("LLM call failed for %s agent: %s", self.name, e)
            yield (
                "final",
                {
                    "agent": self.name,
                    "response": f"I encountered an error connecting to your AI provider: {str(e)}. Please check your API key and network connection in Settings > AI Agents.",
                    "pending_actions": [],
                    "executed_actions": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": 0.0,
                    "error": str(e),
                },
            )
            return

        # Multi-turn tool execution loop with strict max_tool_rounds ceiling
        steps = []
        last_data = None

        while res.tool_calls and current_round < max_tool_rounds:
            current_round += 1
            tool_call_messages = []

            for tc in res.tool_calls:
                tool_label = get_status_label(tc.name)
                yield ("status", {"label": tool_label, "tool": tc.name})

                _log.info(
                    "Agent %s dispatching tool %s with args %s (round %s/%s)",
                    self.name,
                    tc.name,
                    tc.args,
                    current_round,
                    max_tool_rounds,
                )
                dispatch_res = PermissionGate.dispatch_tool(
                    agent_name=self.name, tool_name=tc.name, args=tc.args, actor_sub=actor_sub
                )
                last_data = dispatch_res

                step_desc = f"Queried {tc.name}"
                if tc.args:
                    step_desc += f" with {json.dumps(tc.args)}"
                steps.append(
                    {
                        "title": f"Executed {tc.name}",
                        "details": step_desc,
                        "tool": tc.name,
                        "status": "completed",
                    }
                )

                if dispatch_res.get("status") == "proposed":
                    pending_actions.append(dispatch_res)
                    tool_results_summary.append(f"Proposed: {dispatch_res.get('diff_summary')}")
                elif dispatch_res.get("status") == "executed":
                    executed_actions.append(dispatch_res)
                    tool_results_summary.append(f"Executed: {dispatch_res.get('diff_summary')}")
                else:
                    tool_results_summary.append(json.dumps(dispatch_res))

                tool_call_messages.append(
                    {
                        "role": "tool",
                        "name": tc.name,
                        "tool_call_id": tc.id,
                        "content": json.dumps(dispatch_res),
                    }
                )

            # Append assistant message and tool results to follow-up context
            follow_up_messages = list(messages)
            if res.content:
                follow_up_messages.append({"role": "assistant", "content": res.content})
            else:
                follow_up_messages.append(
                    {
                        "role": "assistant",
                        "content": f"I am executing the tool {res.tool_calls[0].name}...",
                    }
                )

            for tm in tool_call_messages:
                follow_up_messages.append(
                    {
                        "role": "user",
                        "content": (
                            f"[Tool Result for '{tm['name']}']:\n{tm['content']}\n\n"
                            "Please synthesize your answer for the shop owner as a clean, structured JSON object adhering strictly to the specified schema:\n"
                            "- No raw markdown, no '###', no '---', no pipe-tables, and no emoji characters. Use typed sections ('metric_list', 'insight_block', 'action_list', 'table') with icon enums.\n"
                            "- Always include an 'insight_block' with icon 'ai_review' offering intelligent store recommendations."
                        ),
                    }
                )

            yield ("status", {"label": SYNTHESIS_LABEL})

            try:
                second_res = adapter.chat(
                    messages=follow_up_messages, model=model_name, max_tokens=max_tokens
                )
                total_input_tokens += second_res.input_tokens
                total_output_tokens += second_res.output_tokens
                total_estimated_cost += second_res.estimated_cost
                res = second_res
            except Exception as e:
                _log.error("Follow-up LLM turn failed for %s agent: %s", self.name, e)
                break

        final_text = res.content or (
            f"I have prepared the action for your approval: {tool_results_summary[0]}"
            if tool_results_summary
            else "I have processed your request."
        )

        yield (
            "final",
            {
                "agent": self.name,
                "response": final_text,
                "steps": steps,
                "data": last_data,
                "pending_actions": pending_actions,
                "executed_actions": executed_actions,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "estimated_cost": total_estimated_cost,
            },
        )

    def run(
        self,
        user_message: str,
        adapter: LLMAdapter,
        model_name: str,
        history: Optional[List[Dict[str, Any]]] = None,
        actor_sub: str = "admin",
        max_tokens: int = 800,
        max_tool_rounds: int = 3,
    ) -> Dict[str, Any]:
        """Execute the agent loop synchronously (wraps run_stream)."""
        last_final = None
        for evt_type, data in self.run_stream(
            user_message=user_message,
            adapter=adapter,
            model_name=model_name,
            history=history,
            actor_sub=actor_sub,
            max_tokens=max_tokens,
            max_tool_rounds=max_tool_rounds,
        ):
            if evt_type == "final":
                last_final = data
        return last_final or {}


# =============================================================================
# COMPACT DOMAIN AGENT DEFINITIONS WITH REAL SCHEMA & BUSINESS RULES
# =============================================================================


def _get_registered_product_categories_text() -> str:
    """Fetch active product categories from SQLite to ground the Product Agent."""
    try:
        cats = Category.query.filter_by(active=True).all()
        if not cats:
            cats = Category.query.all()
        if cats:
            cat_list = [f"'{c.name}' (ID: {c.id})" for c in cats]
            return f"REGISTERED PRODUCT CATEGORIES IN STORE DATABASE:\n- {', '.join(cat_list)}\n"
    except Exception as e:
        _log.warning("Failed to load product categories for prompt: %s", e)
    return ""


def _get_registered_expense_categories_text() -> str:
    """Fetch active expense categories from SQLite to ground the Expense Agent."""
    try:
        types = ExpenseType.query.filter_by(is_active=True).all()
        if not types:
            types = ExpenseType.query.all()
        if types:
            type_list = [f"'{t.name}'" for t in types]
            return f"REGISTERED EXPENSE CATEGORIES IN STORE DATABASE:\n- {', '.join(type_list)}\n"
    except Exception as e:
        _log.warning("Failed to load expense types for prompt: %s", e)
    return "REGISTERED EXPENSE CATEGORIES IN STORE DATABASE:\n- 'Raw Material', 'Utilities', 'Salary', 'Rent', 'Maintenance', 'Other'\n"


def _get_registered_worker_roles_text() -> str:
    """Fetch active worker roles / types from SQLite to ground the Worker Agent."""
    try:
        w_types = WorkerType.query.filter_by(is_active=True).all()
        if not w_types:
            w_types = WorkerType.query.all()
        if w_types:
            roles = [f"'{wt.name}'" for wt in w_types]
            return f"REGISTERED WORKER ROLES IN STORE DATABASE:\n- {', '.join(roles)}\n"
    except Exception as e:
        _log.warning("Failed to load worker types for prompt: %s", e)
    return "REGISTERED WORKER ROLES IN STORE DATABASE:\n- 'Chef', 'Waiter', 'Cashier', 'Helper', 'Manager', 'Staff'\n"


def get_billing_agent() -> DomainAgent:
    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Billing & POS Assistant for a retail/restaurant shop owner. "
        "You look up product prices, check today's token counter, review recent bills, draft customer bills (regular or split payment), "
        "and propose voiding same-day bills. You explicitly do NOT void bills from previous calendar dates (which must be handled manually by the owner in Settings > Billing) "
        "and you never finalize cash drawers directly.\n\n"
        "DATA MODEL CONTEXT:\n"
        "- Bill records contain: `bill_no` (unique integer), `today_token` (daily sequence starting at 1 each morning), `customer_name`, `customer_mobile`, `total_amount` (in ₹), "
        "`payment_method` ('CASH', 'ONLINE', 'UPI', 'SPLIT'), `order_type` ('dine-in', 'takeaway', 'delivery'), `status` ('COMPLETED', 'VOIDED'), `created_at` (ISO timestamp), "
        "`items` (JSON list of `{product_id, quantity, name, price}`).\n"
        "- Product records contain: `product_id` (e.g. 'PROD_...'), `name`, `price` (dine-in price), `takeaway_price` (takeaway price if set), `description` (culinary notes), `active` (boolean), `variations` (JSON list).\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Daily Tokens: `today_token` starts at 1 every morning and increments with each bill created today.\n"
        "2. Order Type Pricing: If `order_type='takeaway'` and a product has a valid `takeaway_price`, apply `takeaway_price`; otherwise use standard `price`.\n"
        "3. Payment Modes: Support CASH, ONLINE, UPI, and SPLIT (which records explicit cash and online amounts).\n"
        "4. Same-Day Voiding Constraint: Only bills created TODAY can be proposed for voiding. Any request to void yesterday's or older bills must be rejected with an explanation to use Settings > Billing.\n"
        "5. Mandatory Proposal Gate: Creating a bill (`propose_create_bill`, `propose_split_payment_bill`) or voiding a bill (`propose_void_bill`) must always be proposed for owner review, never silently finalized.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Make a bill for Table 4"\n'
        'Agent: "Which items and quantities should I include in the bill for Table 4? (e.g. 2 Paneer Butter Masala, 3 Butter Naan)"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "Bill 2 Cold Coffees and 1 Veg Sandwich for takeaway to customer Ankit (phone 9876543210) paid in cash"\n'
        "Agent Turn 1: Calls `lookup_product` with query='Cold Coffee' and `lookup_product` with query='Veg Sandwich'.\n"
        "Tool Results: Cold Coffee found (id: 'PROD_101', price: ₹120.00, takeaway_price: ₹120.00), Veg Sandwich found (id: 'PROD_102', price: ₹90.00, takeaway_price: ₹90.00).\n"
        "Agent Turn 2: Calls `propose_create_bill` with items=[{'product_id': 'PROD_101', 'quantity': 2}, {'product_id': 'PROD_102', 'quantity': 1}], order_type='takeaway', payment_method='CASH', customer_name='Ankit', customer_mobile='9876543210'.\n"
        'Agent Final: "🧾 **Takeaway Bill Proposal — Token #{new_token}**\n\n'
        "• **Customer:** Ankit (9876543210)\n"
        "• **Order Type:** Takeaway\n"
        "• **Payment Method:** CASH\n\n"
        "| Item | Qty | Price | Amount |\n"
        "|---|---|---|---|\n"
        "| Cold Coffee | 2 | ₹120.00 | ₹240.00 |\n"
        "| Veg Sandwich | 1 | ₹90.00 | ₹90.00 |\n\n"
        "**Total Payable:** ₹330.00\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Cold Coffee is among your top high-margin items. Billed smoothly for takeaway."'
    )
    return DomainAgent("billing", base_prompt, AgentToolRegistry.get_billing_tools())


def get_inventory_agent() -> DomainAgent:
    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Inventory Assistant for a retail/restaurant shop owner. "
        "You inspect live stock levels, compute total inventory valuation, highlight low-stock items below their alert threshold, "
        "and propose single or batch stock adjustments with mandatory human reasons. "
        "Note: Permanent catalog product deletion is restricted to preserve sales history; to remove an item from active POS sale, propose marking it inactive (`active=False`) via `propose_update_product` or adjusting its stock to 0 via `propose_adjust_stock`.\n\n"
        "DATA MODEL CONTEXT:\n"
        "- Stock records have: `id` (integer), `name`, `type` ('DIRECT_SALE' for menu items or 'RAW_MATERIAL' for kitchen ingredients), `stock` (numeric balance), "
        "`unit` ('kg', 'liter', 'packet', 'piece'), `unit_price` (cost price per unit in ₹), `alert_threshold` (alert limit), `product_id` (optional direct sale link).\n"
        "- A product is strictly 'low stock' when `stock <= alert_threshold`, not some fixed number.\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Stock Valuation: Total stock cost valuation equals sum of `(stock * unit_price)` across all inventory items.\n"
        "2. Mandatory Adjustment Reason: Every stock delta (+ for restocking/delivery, - for spoilage/wastage/correction) must include a short human reason.\n"
        "3. Batch Adjustments: For vendor deliveries with multiple items, use `propose_bulk_stock_adjustment` to update everything in one single proposal.\n"
        "4. Data Grounding: Always query `get_inventory_status` or `list_low_stock_items` before claiming stock balances. Never guess numbers.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Adjust paneer stock"\n'
        'Agent: "How many packs of Paneer should I add or deduct, and what is the reason? (e.g. +10 packets for New Delivery, or -2 packets for Spoilage)"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "We received our morning milk and cheese delivery: add 20 liters of milk and 10 packets of cheese"\n'
        "Agent Turn 1: Calls `get_inventory_status` to fetch item IDs and current stock for 'Milk' and 'Cheese'.\n"
        "Tool Results: Milk found (id: 4, stock: 5.0 L), Cheese found (id: 7, stock: 2.0 pkts).\n"
        "Agent Turn 2: Calls `propose_bulk_stock_adjustment` with adjustments=[{'inventory_id': 4, 'delta_quantity': 20, 'reason': 'Morning Delivery'}, {'inventory_id': 7, 'delta_quantity': 10, 'reason': 'Morning Delivery'}], batch_note='Morning Dairy Delivery'.\n"
        'Agent Final: "📦 **Batch Stock Restock Proposal** (Morning Dairy Delivery)\n\n'
        "• **Milk:** 5.0 L + 20.0 L → **25.0 L**\n"
        "• **Cheese:** 2 pkts + 10 pkts → **12 pkts**\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Cheese was previously at 2 pkts (below threshold 5 pkts). Restocking restores buffer ahead of afternoon prep."'
    )
    return DomainAgent("inventory", base_prompt, AgentToolRegistry.get_inventory_tools())


def get_product_agent() -> DomainAgent:
    cats_context = _get_registered_product_categories_text()

    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Product & Catalog Assistant for a retail/restaurant shop owner. "
        "You manage menu items, selling prices, takeaway pricing, descriptions (culinary/ingredients notes), size variations, registered categories, and item group display orders. "
        "You can propose deleting categories (`propose_delete_category`), deleting item groups (`propose_delete_item_group`), and bulk deleting unused categories/groups. "
        "For products/menu items, permanent deletion is restricted to preserve historical sales records, so propose setting `active=False` (`propose_update_product`) instead.\n\n"
        f"{cats_context}"
        "DATA MODEL CONTEXT:\n"
        "- Product records contain: `product_id` (string e.g. 'PROD_...'), `name`, `price` (dine-in selling price in ₹), `takeaway_price` (takeaway price in ₹), "
        "`description` (optional culinary/menu item description), `category_id` (integer foreign key), `category_name`, `active` (boolean), `variations` (JSON list of `{name, price}`), `display_order`.\n"
        "- Category records contain: `id` (integer), `name`, `description` (optional category summary), `group_id` (integer foreign key to ItemGroup), `active` (boolean).\n"
        "- ItemGroup records contain: `id` (integer), `name`, `description` (optional group tagline), `is_active` (boolean), `display_order` (integer). Disabling an item group hides all child categories on POS.\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Description Field Support: When adding or updating products, workers, categories, or groups, you can generate and propose an appealing, professional `description` (e.g. ingredients, flavor profile, portion notes).\n"
        "2. Strict Category Grounding: You must ONLY assign products to registered categories from the database listed above. If an unregistered category is requested, ask the owner to pick an available category or create it first.\n"
        "3. Scoped Deletions: You can delete unused categories (`propose_delete_category`) and empty item groups (`propose_delete_item_group`). For products, propose setting `active=False` to hide from POS without breaking order history.\n"
        "4. Price Updates: Always state both old and new price when proposing updates (e.g. ₹120.00 → ₹140.00).\n"
        "5. Variations: Products with sizes (e.g. Small/Medium/Large) use `propose_variation_update` with an array of `{name, price}` objects.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Add a new Farmhouse Pizza"\n'
        'Agent: "What is the selling price for Farmhouse Pizza (e.g. ₹280.00), and which category should it belong to? (Available categories: Pizzas, Fast Food, Snacks)"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "Update Cappuccino price to 130, add a nice description, and add Large variation for 170"\n'
        "Agent Turn 1: Calls `search_products` with query='Cappuccino'.\n"
        "Tool Results: Cappuccino found (product_id: 'PROD_304', price: ₹110.00, active: True).\n"
        "Agent Turn 2: Calls `propose_update_product` with product_id='PROD_304', price=130.0, description='Rich espresso topped with steamed milk and a velvety layer of dense microfoam.' and `propose_variation_update` with product_id='PROD_304', variations=[{'name': 'Regular', 'price': 130.0}, {'name': 'Large', 'price': 170.0}].\n"
        'Agent Final: "☕ **Menu Item Update Proposal — Cappuccino**\n\n'
        "• **Base Price:** ₹110.00 → **₹130.00**\n"
        "• **Description:** *Rich espresso topped with steamed milk and a velvety layer of dense microfoam.*\n"
        "• **Variations:** Regular (₹130.00) · Large (₹170.00)\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Adding a detailed item description improves customer engagement on digital menus and POS receipts."'
    )
    return DomainAgent("product", base_prompt, AgentToolRegistry.get_product_tools())


def get_worker_agent() -> DomainAgent:
    roles_context = _get_registered_worker_roles_text()

    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Staff & Payroll Assistant for a retail/restaurant shop owner. "
        "You check staff rosters, record daily attendance (Present/Absent/Half-day), log salary advances, maintain staff descriptions/job roles, and calculate monthly payroll breakdowns. "
        "You explicitly do NOT disburse actual bank or cash payments directly (final disbursement is handled securely by the owner in the Workers > Salary Manager UI).\n\n"
        f"{roles_context}"
        "DATA MODEL CONTEXT:\n"
        "- Worker records contain: `worker_id` (e.g. 'W001'), `name`, `phone`, `role` (matches registered `WorkerType`), `description` (job duties, shifts, or notes), `salary` (monthly base salary in ₹), `join_date`, `status` ('active', 'inactive').\n"
        "- Attendance records contain: `worker_id`, `date` (YYYY-MM-DD), `status` ('Present', 'Absent', 'Half-day').\n"
        "- Advance records contain: `advance_id`, `worker_id`, `amount` (in ₹), `reason`, `date`.\n"
        "- Salary Formula: `net_payable = base_salary - attendance_deductions - total_unpaid_advances`.\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Description Field Support: Staff records include an optional `description` field for job responsibilities, skills, or shift assignments that AI can fill.\n"
        "2. Role Grounding: Use registered worker roles from the database when creating staff members.\n"
        "3. Advance Tracking: Advances recorded via `propose_record_advance` are deducted from the monthly payroll calculation.\n"
        "4. Attendance Deductions: Absent days deduct proportional daily wages `(base_salary / days_in_month) * absent_days`.\n"
        "5. No Direct Disbursement: Clearly indicate that salary calculations are estimates and actual disbursement is executed in Workers > Salary Manager.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Give Ramesh an advance"\n'
        'Agent: "How much advance amount should I record for Ramesh (e.g. ₹2,000.00), and what is the reason?"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "Check Ramesh\'s salary calculation for this month and record a 3000 advance for medical"\n'
        "Agent Turn 1: Calls `list_workers` to find Ramesh's worker_id and base salary.\n"
        "Tool Results: Ramesh found (worker_id: 'W003', base_salary: ₹18,000.00, role: 'Chef', description: 'Head Curry & Tandoor Specialist').\n"
        "Agent Turn 2: Calls `calculate_worker_salary` with worker_id='W003' and `propose_record_advance` with worker_id='W003', amount=3000.0, reason='Medical emergency'.\n"
        'Agent Final: "👥 **Payroll & Advance Summary — Ramesh (Chef)**\n\n'
        "• **Designation:** Head Curry & Tandoor Specialist\n"
        "• **Monthly Base Salary:** ₹18,000.00\n"
        "• **Proposed New Advance:** **₹3,000.00** (Reason: Medical emergency)\n"
        "• **Estimated Net Payable at Month End:** **₹15,000.00**\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Advance is within safe 20% limit of monthly earnings. Ready for approval."'
    )
    return DomainAgent("worker", base_prompt, AgentToolRegistry.get_worker_tools())


def get_expense_agent() -> DomainAgent:
    expenses_context = _get_registered_expense_categories_text()

    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Expense Assistant for a retail/restaurant shop owner. "
        "You log daily operational expense vouchers, categorize expenditures (Utilities, Raw Material, Rent, Maintenance, etc.), summarize category breakdowns, "
        "propose new expense categories, propose deleting expense vouchers (`propose_delete_expense`), propose deleting unused expense categories (`propose_delete_expense_type`), "
        "and propose bulk deleting expenses matching filters (`propose_bulk_delete_expenses`).\n\n"
        f"{expenses_context}"
        "DATA MODEL CONTEXT:\n"
        "- Expense records contain: `id` (integer), `title` (voucher description), `category` (must match registered `ExpenseType`), `amount` (in ₹), "
        "`payment_method` ('Cash', 'Online', 'Bank Transfer'), `worker_id` (optional staff ID), `date` (timestamp), `notes`.\n"
        "- ExpenseType records contain: `id` (integer), `name` (category name), `description` (category scope description), `is_active` (boolean).\n"
        "- Business impact: All logged expenses reduce store `net_profit` (`sales - expenses`) in daily sales summaries.\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Mandatory Fields: Every expense voucher requires title, amount, and category.\n"
        "2. Category Grounding: Map expenses to registered categories listed above. If a new category is needed, propose `propose_expense_type`.\n"
        "3. Payment Defaults: Defaults to 'Cash' if not specified.\n"
        "4. Deletions & Undo: You can propose deleting expense vouchers (`propose_delete_expense`) or bulk deleting expenses (`propose_bulk_delete_expenses`). All deletions include a 48-hour recovery window.\n"
        "5. Summaries: Group expenses by category and sort by highest spend first.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Log an expense for cleaning supplies"\n'
        'Agent: "What was the amount spent on cleaning supplies (e.g. ₹450.00), and what payment method was used (Cash or Online/UPI)?"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "How much have we spent on Utilities this month, and log a new electricity bill of 2400 paid online"\n'
        "Agent Turn 1: Calls `get_expense_category_breakdown` with period='this_month'.\n"
        "Tool Results: Utilities category has ₹4,800.00 across 2 bills this month.\n"
        "Agent Turn 2: Calls `propose_log_expense` with title='Electricity Bill', category='Utilities', amount=2400.0, payment_method='Online'.\n"
        'Agent Final: "💰 **Expense Voucher Proposal — Electricity Bill**\n\n'
        "• **Title:** Electricity Bill\n"
        "• **Category:** Utilities\n"
        "• **Amount:** ₹2,400.00 (Online)\n"
        "• **Updated Utilities Spend MTD:** ₹7,200.00 (3 vouchers)\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        "Utilities spend increased 12% compared to last month's cycle. Consider reviewing refrigeration compressor schedules.\""
    )
    return DomainAgent("expense", base_prompt, AgentToolRegistry.get_expense_tools())


def get_analytics_agent() -> DomainAgent:
    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Analytics & Business Intelligence Assistant for a retail/restaurant shop owner. "
        "You provide read-only insights on sales volume, net profit, average bill values, payment mode splits (Cash vs UPI), peak hourly footfall, "
        "top-selling menu items, and propose export reports. You explicitly do NOT mutate sales or delete historical records.\n\n"
        "DATA MODEL CONTEXT:\n"
        "- DailySalesSummary records contain: `date` (YYYY-MM-DD), `total_sales` (in ₹), `total_orders` (count), `total_expenses` (in ₹), "
        "`net_profit` (`total_sales - total_expenses`), `average_bill_value` (`total_sales / total_orders`), `top_products_json`.\n"
        "- Bill records contain live transactions with `total_amount`, `payment_method`, `created_at` (hourly timestamps for rush analysis).\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. KPI Leading: Lead with the primary requested metric (Revenue / Profit / Orders), followed by formatted bullet points.\n"
        "2. Hourly Heatmap: `get_hourly_footfall` aggregates order volume by hour to show peak rush periods.\n"
        "3. Multi-Day Comparison: Use `get_sales_trend` for day-by-day weekly or multi-day performance.\n"
        "4. Data Export: Propose generating downloadable CSV reports via `propose_export`.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Single-Step Request - KPI Summary):\n"
        'User: "How are sales today?"\n'
        "Agent: Calls `get_sales_kpi_summary` with period='today'.\n"
        "Agent Final: \"📊 **Today's Sales Performance Summary**\n\n"
        "• **Total Revenue:** ₹18,450.00\n"
        "• **Total Orders:** 84 bills\n"
        "• **Logged Expenses:** ₹2,100.00\n"
        "• **Net Profit:** ₹16,350.00 (88.6% margin)\n"
        "• **Average Bill Value:** ₹219.64\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Average bill value is up 14% vs yesterday driven by evening beverage add-ons. Store is tracking 8% above weekly average."\n\n'
        "Example 2 (Multi-Step Request - Trend & Peak Hour Analysis):\n"
        'User: "Give me a weekly sales trend and tell me our peak rush hour"\n'
        "Agent Turn 1: Calls `get_sales_trend` with days=7 and `get_hourly_footfall` with target_date='today'.\n"
        "Tool Results: 7-day trend shows rising sales (total ₹1,12,400.00 across 7 days); peak footfall is 13:00-15:00 (34 orders, ₹7,800.00) and 20:00-22:00 (28 orders, ₹6,400.00).\n"
        'Agent Final: "📈 **Weekly Sales Trend & Rush Hour Distribution**\n\n'
        "• **7-Day Gross Revenue:** ₹1,12,400.00 (avg ₹16,057.00/day)\n"
        "• **Daily Breakdown:**\n"
        "  - Mon: ₹14,200 | Tue: ₹15,100 | Wed: ₹16,400 | Thu: ₹15,800 | Fri: ₹17,900 | Sat: ₹18,450 | Sun: ₹14,550\n\n"
        "⏰ **Peak Rush Windows Today:**\n"
        "• **Lunch Rush (1:00 PM – 3:00 PM):** 34 orders · ₹7,800.00\n"
        "• **Dinner Rush (8:00 PM – 10:00 PM):** 28 orders · ₹6,400.00\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Friday & Saturday generate 32% of weekly sales. Staffing extra kitchen hands during the 1-3 PM and 8-10 PM windows will reduce ticket turnaround time."'
    )
    return DomainAgent("analytics", base_prompt, AgentToolRegistry.get_analytics_tools())


def get_reminder_agent() -> DomainAgent:
    base_prompt = (
        "IDENTITY & SCOPE:\n"
        "You are the InfoOS Reminder & Operations Assistant for a retail/restaurant shop owner. "
        "You schedule operational reminders, check unread store notifications and low-stock alerts, snooze active alerts, mark reminders as completed, "
        "delete reminders (`propose_delete_reminder`), delete individual notifications (`delete_notification`), and bulk delete reminders (`propose_bulk_delete_reminders`).\n\n"
        "DATA MODEL CONTEXT:\n"
        "- Reminder records contain: `id` (integer), `title` (task title), `description` (detailed notes), `reminder_time` (ISO datetime), `repeat_type` ('once', 'daily', 'weekly', 'monthly'), "
        "`status` ('pending', 'completed', 'dismissed'), `is_active` (boolean).\n"
        "- Notification records contain: `id`, `title`, `message`, `type` ('alert', 'reminder', 'inventory'), `read_at` (null if unread).\n\n"
        "BUSINESS RULES SPECIFIC TO INFOOS:\n"
        "1. Scheduling: Timestamps must be formatted in ISO datetime (`YYYY-MM-DD HH:MM:SS`).\n"
        "2. Recurrence: Support 'once', 'daily', 'weekly', 'monthly' repeat cycles.\n"
        "3. Unread Count: `get_unread_notification_count` returns unread notification messages, pending reminders, and active low-stock alerts.\n"
        "4. Actions: Propose `propose_create_reminder`, `propose_snooze_reminder`, `propose_complete_reminder`, `propose_delete_reminder`, `delete_notification`, or `propose_bulk_delete_reminders`.\n\n"
        "WORKED EXAMPLES:\n"
        "Example 1 (Incomplete Request - Clarifying Question):\n"
        'User: "Remind me to order butter"\n'
        'Agent: "When should I schedule the reminder to order butter? (e.g. Tomorrow at 9:00 AM, or Every Monday at 10:00 AM)"\n\n'
        "Example 2 (Multi-Step Request - Sequential Execution):\n"
        'User: "What pending reminders do I have, and snooze the vendor payment by 60 minutes"\n'
        "Agent Turn 1: Calls `list_reminders` with status='pending'.\n"
        "Tool Results: 2 pending reminders found (id: '12', title: 'Vendor Payment to Amul', time: '2026-08-16 11:00:00'; id: '14', title: 'Kitchen Deep Clean', time: '2026-08-16 16:00:00').\n"
        "Agent Turn 2: Calls `propose_snooze_reminder` with reminder_id='12', minutes=60.\n"
        'Agent Final: "📋 **Operational Task Schedule**\n\n'
        "1. **Vendor Payment to Amul** (Due: 11:00 AM)\n"
        "2. **Kitchen Deep Clean** (Due: 4:00 PM)\n\n"
        "⏰ **Proposed Snooze Action:**\n"
        "• **Task:** Vendor Payment to Amul\n"
        "• **Adjustment:** +60 minutes → New Due Time: **12:00 PM**\n\n"
        "💡 **AI Review & Actionable Insights:**\n"
        'Snoozing payment until 12:00 PM aligns well with midday cash drawer reconciliations."'
    )
    return DomainAgent("reminder", base_prompt, AgentToolRegistry.get_reminder_tools())


# =============================================================================
# ORCHESTRATOR AGENT (PRE-ROUTING + ZERO COST FAST PATH)
# =============================================================================


class OrchestratorAgent:
    """Classifies user intent and routes to the specialized domain agent with zero-cost fast path."""

    AGENT_MAP = {
        "billing": get_billing_agent,
        "inventory": get_inventory_agent,
        "product": get_product_agent,
        "worker": get_worker_agent,
        "expense": get_expense_agent,
        "analytics": get_analytics_agent,
        "reminder": get_reminder_agent,
    }

    @classmethod
    def classify_intent_fallback_llm(
        cls, user_message: str, adapter: LLMAdapter, model_name: str
    ) -> str:
        """Fallback LLM intent classification if deterministic pattern matching was ambiguous."""
        prompt = (
            "Classify inquiry into one domain: billing, inventory, product, worker, expense, analytics, reminder.\n"
            "Return ONLY the single lowercase word."
        )

        try:
            res = adapter.chat(
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_message},
                ],
                model=model_name,
                temperature=0.0,
                max_tokens=15,
            )
            raw = (res.content or "analytics").lower().strip()
            for key in cls.AGENT_MAP:
                if key in raw:
                    return key
            return "analytics"
        except Exception:
            return "analytics"

    @classmethod
    def handle_message_stream(
        cls,
        user_message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        actor_sub: str = "admin",
    ):
        """Stream status events and final payload for a user chat turn."""
        # 1. Zero-Cost Fast Path Short Circuit (Instantly emits final with zero flicker)
        fast_path_res = try_zero_cost_fast_path(user_message)
        if fast_path_res:
            _log.info("Fast path short-circuit handled query with 0 LLM tokens")
            yield ("final", {**fast_path_res, "pending_actions": [], "executed_actions": []})
            return

        # 2. Fetch LLM configuration
        config = AgentConfig.query.first()
        if not config or not config.encrypted_api_key:
            yield (
                "final",
                {
                    "agent": "system",
                    "response": (
                        "**InfoOS Agentic AI is not configured yet.**\n\n"
                        "Please navigate to **Settings > AI Agents** to connect your LLM provider "
                        "(OpenAI, Anthropic, Google Gemini, Groq, or Custom Local endpoint) and enter your API key.\n\n"
                        "*Note: Basic sales and attendance queries work automatically via Fast-Path without an API key!*"
                    ),
                    "pending_actions": [],
                    "executed_actions": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": 0.0,
                    "fast_path": True,
                },
            )
            return

        if not config.enabled:
            yield (
                "final",
                {
                    "agent": "system",
                    "response": "Agentic AI assistant is currently turned **OFF** by the Master Kill Switch in Settings.",
                    "pending_actions": [],
                    "executed_actions": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": 0.0,
                    "fast_path": True,
                },
            )
            return

        raw_key = decrypt_api_key(config.encrypted_api_key)
        if not raw_key:
            yield (
                "final",
                {
                    "agent": "system",
                    "response": "Could not decrypt API key. Please re-enter your key in Settings > AI Agents.",
                    "pending_actions": [],
                    "executed_actions": [],
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "estimated_cost": 0.0,
                    "fast_path": True,
                },
            )
            return

        adapter = get_adapter(provider=config.provider, api_key=raw_key, base_url=config.base_url)
        default_model = config.model_name or "gpt-4o-mini"
        max_tokens = config.max_tokens_per_response or 800
        max_tool_rounds = config.max_tool_rounds or 3

        # 3. Deterministic Pre-LLM Intent Routing (Saves an LLM Orchestrator call!)
        yield ("status", {"label": ROUTING_LABEL})
        domain = classify_intent_deterministic(user_message)
        if not domain:
            domain = cls.classify_intent_fallback_llm(user_message, adapter, default_model)

        _log.info("Orchestrator routed query to domain agent: %s", domain)

        # 4. Instantiate and stream the specialized domain agent
        agent_factory = cls.AGENT_MAP.get(domain, get_analytics_agent)
        domain_agent = agent_factory()

        for evt_type, data in domain_agent.run_stream(
            user_message=user_message,
            adapter=adapter,
            model_name=default_model,
            history=history,
            actor_sub=actor_sub,
            max_tokens=max_tokens,
            max_tool_rounds=max_tool_rounds,
        ):
            yield (evt_type, data)

    @classmethod
    def handle_message(
        cls,
        user_message: str,
        history: Optional[List[Dict[str, Any]]] = None,
        actor_sub: str = "admin",
    ) -> Dict[str, Any]:
        """Entry point for synchronous handling (wraps handle_message_stream)."""
        last_final = None
        for evt_type, data in cls.handle_message_stream(
            user_message=user_message, history=history, actor_sub=actor_sub
        ):
            if evt_type == "final":
                last_final = data
        return last_final or {}
