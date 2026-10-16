import json
import logging
from datetime import datetime, date
from typing import Dict, Any, Tuple, List, Optional
from models import (
    db,
    AgentConfig,
    AgentPermission,
    AgentActionLog,
    Product,
    Inventory,
    Category,
    Worker,
    Bill,
)
from agents.tools import execute_read_tool, execute_mutating_tool, AgentToolRegistry
from agents.delete_policy import (
    DELETE_POLICY,
    BLOCKED_REASONS,
    get_delete_policy,
    get_entity_for_tool,
    is_deletion_tool,
    is_bulk_tool,
)

_log = logging.getLogger(__name__)

# Hardcoded ceilings where full autonomy is NEVER permitted
HARDCODED_CONFIRMATION_AGENTS = {"billing", "worker"}
HARDCODED_CONFIRMATION_TOOLS = {
    "propose_void_bill",
    "propose_create_bill",
    "propose_delete_category",
    "propose_delete_item_group",
    "propose_delete_expense",
    "propose_delete_expense_type",
    "propose_delete_reminder",
    "propose_bulk_delete_expenses",
    "propose_bulk_delete_reminders",
    "propose_bulk_delete_categories",
    "propose_bulk_delete_item_groups",
    "restore_deleted_item",
    "restore_last_bulk_delete",
    "delete_notification",
    "propose_export",
}

_TYPE_MAP = {
    "string": str,
    "integer": int,
    "number": (int, float),
    "boolean": bool,
    "array": list,
    "object": dict,
}


def validate_tool_args(tool_name: str, args: Dict[str, Any]) -> List[str]:
    """Validate incoming tool arguments against registry parameter schemas."""
    spec = AgentToolRegistry.get_tool_spec(tool_name)
    if not spec:
        return []

    params = spec.get("parameters", {})
    required = params.get("required", [])
    props = params.get("properties", {})
    errs = []

    for req_field in required:
        val = args.get(req_field)
        if val is None or val == "":
            errs.append(f"Missing required parameter '{req_field}'")

    for k, v in args.items():
        if k.startswith("_"):
            continue
        p_spec = props.get(k)
        if not p_spec:
            continue
        expected_type_name = p_spec.get("type")
        expected_type = _TYPE_MAP.get(expected_type_name)
        if expected_type and v is not None:
            if isinstance(v, bool) and expected_type_name != "boolean":
                errs.append(f"Parameter '{k}' must be of type {expected_type_name}")
            elif not isinstance(v, expected_type):
                if expected_type_name in ("number", "integer"):
                    try:
                        if expected_type_name == "integer":
                            int(v)
                        else:
                            float(v)
                    except (ValueError, TypeError):
                        errs.append(f"Parameter '{k}' must be of type {expected_type_name}")
                else:
                    errs.append(f"Parameter '{k}' must be of type {expected_type_name}")
        if "enum" in p_spec and v not in p_spec["enum"]:
            errs.append(f"Parameter '{k}' must be one of {p_spec['enum']}")

    return errs


def dry_run_tool(tool_name: str, args: Dict[str, Any]) -> Optional[str]:
    """Pre-proposal dry run verification against real database entities."""
    if tool_name in ("propose_adjust_stock", "propose_reset_stock_count"):
        inv_id = args.get("inventory_id")
        prod_id = args.get("product_id")
        if inv_id or prod_id:
            item = None
            if inv_id:
                try:
                    item = db.session.get(Inventory, int(inv_id))
                except Exception:
                    pass
            elif prod_id:
                item = Inventory.query.filter_by(product_id=prod_id).first()

            if not item:
                return "No matching inventory item found. Call lookup_product or get_inventory_status first."

            if tool_name == "propose_adjust_stock":
                try:
                    delta = float(args.get("delta_quantity", 0))
                    if item.stock + delta < 0:
                        return f"Stock adjustment of {delta} would take '{item.name}' below zero (current stock: {item.stock})."
                except (ValueError, TypeError):
                    return "Invalid delta_quantity."

    elif tool_name in (
        "propose_record_advance",
        "propose_mark_attendance",
        "propose_update_worker",
    ):
        w_id = args.get("worker_id")
        if w_id and not Worker.query.get(w_id):
            return f"Worker '{w_id}' does not exist. Call list_workers first to find the valid worker_id."

    elif tool_name in (
        "propose_void_bill",
        "propose_apply_bill_discount",
        "propose_recall_hold_bill",
    ):
        b_no = args.get("bill_no")
        if b_no:
            try:
                b_int = int(b_no)
            except (ValueError, TypeError):
                return f"Invalid bill_no: '{b_no}'"
            bill = Bill.query.filter_by(bill_no=b_int).first()
            if not bill:
                return f"Bill #{b_int} not found."
            if tool_name == "propose_void_bill" and bill.created_at.date() != date.today():
                return f"Bill #{b_int} was created on {bill.created_at.date()} (not today). Only same-day bills can be voided via agent."

    elif tool_name in ("propose_delete_category", "propose_update_category"):
        cat_id = args.get("category_id")
        if cat_id and not Category.query.get(cat_id):
            return f"Category #{cat_id} not found."

    elif tool_name in ("propose_bulk_update_prices", "propose_bulk_toggle_products"):
        cat_id = args.get("category_id")
        p_ids = args.get("product_ids") or []
        if cat_id or p_ids:
            query = Product.query
            if cat_id:
                query = query.filter_by(category_id=cat_id)
            if p_ids:
                query = query.filter(Product.product_id.in_(p_ids))
            if query.count() == 0:
                return "No products match the specified category/product criteria."

    return None


def generate_diff_summary(tool_name: str, args: Dict[str, Any]) -> str:
    """Generate a clean, human-readable diff description of the proposed action."""
    if tool_name == "propose_adjust_stock":
        delta = args.get("delta_quantity", 0)
        reason = args.get("reason", "Adjustment")
        target = args.get("product_id") or f"Inventory #{args.get('inventory_id')}"
        sign = "+" if delta > 0 else ""
        return f"Adjust stock of {target} by {sign}{delta} units (Reason: {reason})"

    elif tool_name == "propose_bulk_stock_adjustment":
        adjs = args.get("adjustments", [])
        return f"Apply batch stock adjustment across {len(adjs)} items (Note: {args.get('batch_note', 'Delivery/Restock')})"

    elif tool_name == "propose_update_threshold":
        return f"Set low stock alert threshold for item #{args.get('inventory_id')} to {args.get('alert_threshold')} units"

    elif tool_name == "propose_create_product":
        return f"Add new product '{args.get('name')}' priced at ₹{args.get('price')}"

    elif tool_name == "propose_update_product":
        changes = []
        if "name" in args:
            changes.append(f"Name → '{args['name']}'")
        if "price" in args:
            changes.append(f"Price → ₹{args['price']}")
        if "active" in args:
            changes.append(f"Status → {'Active' if args['active'] else 'Disabled'}")
        return f"Update product {args.get('product_id')}: {', '.join(changes)}"

    elif tool_name == "propose_variation_update":
        vars_list = args.get("variations", [])
        return f"Update product {args.get('product_id')} variations: {len(vars_list)} variant options configured"

    elif tool_name == "propose_group_reorder":
        return f"Reorder {len(args.get('group_orders', []))} item groups display sequence"

    elif tool_name == "propose_toggle_group_status":
        status = "Enable" if args.get("is_active") else "Disable"
        return f"{status} item group #{args.get('group_id')}"

    elif tool_name == "propose_delete_category":
        return f"Delete category #{args.get('category_id')} from catalog"

    elif tool_name == "propose_delete_item_group":
        action_note = (
            f" (Move categories to #{args.get('move_to')})" if args.get("action") == "move" else ""
        )
        return f"Delete item group #{args.get('group_id')}{action_note}"

    elif tool_name == "propose_create_bill":
        items = args.get("items", [])
        return f"Draft new bill with {len(items)} items ({args.get('order_type', 'dine-in')} / {args.get('payment_method', 'CASH')})"

    elif tool_name == "propose_split_payment_bill":
        items = args.get("items", [])
        return f"Draft split-payment bill ({len(items)} items: ₹{args.get('cash_amount', 0)} Cash + ₹{args.get('online_amount', 0)} UPI/Online)"

    elif tool_name == "propose_void_bill":
        return f"Void Bill #{args.get('bill_no')} (Reason: {args.get('reason')})"

    elif tool_name == "propose_mark_attendance":
        return f"Mark {args.get('status')} for worker {args.get('worker_id')} on {args.get('target_date', 'today')}"

    elif tool_name == "propose_record_advance":
        return f"Record salary advance of ₹{args.get('amount')} for worker {args.get('worker_id')} (Reason: {args.get('reason', 'Advance')})"

    elif tool_name == "propose_create_worker":
        return f"Register new worker '{args.get('name')}' ({args.get('role', 'Staff')}) with salary ₹{args.get('salary')}/month"

    elif tool_name == "propose_log_expense":
        return f"Record expense voucher: '{args.get('title')}' — ₹{args.get('amount')} under '{args.get('category')}'"

    elif tool_name == "propose_expense_type":
        return f"Create new expense category: '{args.get('name')}' ({args.get('description', '')})"

    elif tool_name == "propose_delete_expense":
        return f"Delete expense voucher #{args.get('expense_id')}"

    elif tool_name == "propose_delete_expense_type":
        return f"Delete expense category type #{args.get('type_id')}"

    elif tool_name == "propose_create_reminder":
        return f"Schedule reminder: '{args.get('title')}' for {args.get('reminder_time')}"

    elif tool_name == "propose_snooze_reminder":
        return f"Snooze reminder #{args.get('reminder_id')} by {args.get('minutes', 30)} minutes"

    elif tool_name == "propose_complete_reminder":
        return f"Mark reminder #{args.get('reminder_id')} as completed"

    elif tool_name == "propose_delete_reminder":
        return f"Delete reminder #{args.get('reminder_id')}"

    elif tool_name == "delete_notification":
        return f"Delete notification #{args.get('notification_id')}"

    elif tool_name == "propose_bulk_delete_expenses":
        filt = args.get("filter") or args
        constraints = []
        if filt.get("category"):
            constraints.append(f"Category: '{filt['category']}'")
        if filt.get("start_date") or filt.get("end_date"):
            constraints.append(
                f"Date: {filt.get('start_date', 'any')} to {filt.get('end_date', 'today')}"
            )
        if filt.get("expense_ids"):
            constraints.append(f"{len(filt['expense_ids'])} specific IDs")
        desc = ", ".join(constraints) if constraints else "filtered criteria"
        return f"Bulk delete expense records matching {desc}"

    elif tool_name == "propose_bulk_delete_reminders":
        filt = args.get("filter") or args
        desc = filt.get("status") or "filtered"
        return f"Bulk delete {desc} reminders"

    elif tool_name == "propose_bulk_delete_categories":
        cat_ids = args.get("category_ids", [])
        return f"Bulk delete {len(cat_ids)} unused categories"

    elif tool_name == "propose_bulk_delete_item_groups":
        group_ids = args.get("group_ids", [])
        return f"Bulk delete {len(group_ids)} empty item groups"

    elif tool_name == "restore_deleted_item":
        return f"Restore deleted record from Action #{args.get('action_id')}"

    elif tool_name == "restore_last_bulk_delete":
        return f"Undo and restore bulk deletion batch from Action #{args.get('action_id')}"

    elif tool_name == "propose_create_category":
        return f"Create category '{args.get('name')}'"

    elif tool_name == "propose_create_item_group":
        return f"Create item group '{args.get('name')}'"

    elif tool_name == "propose_update_category":
        return f"Update category #{args.get('category_id')}"

    elif tool_name == "propose_bulk_update_prices":
        pct = args.get("percentage_change")
        flat = args.get("flat_change")
        desc = f"{pct}%" if pct is not None else f"₹{flat}" if flat is not None else "custom"
        cat_id = args.get("category_id")
        p_ids = args.get("product_ids") or []
        query = Product.query
        if cat_id:
            query = query.filter_by(category_id=cat_id)
        if p_ids:
            query = query.filter(Product.product_id.in_(p_ids))
        count = query.count()
        scope = (
            f"category #{cat_id}"
            if cat_id
            else f"{len(p_ids)} selected products" if p_ids else "all products"
        )
        return f"Bulk update prices ({desc}) across {count} items in {scope}"

    elif tool_name == "propose_bulk_toggle_products":
        stat = "Active" if args.get("active") else "Disabled"
        cat_id = args.get("category_id")
        p_ids = args.get("product_ids") or []
        query = Product.query
        if cat_id:
            query = query.filter_by(category_id=cat_id)
        if p_ids:
            query = query.filter(Product.product_id.in_(p_ids))
        count = query.count()
        scope = (
            f"category #{cat_id}"
            if cat_id
            else f"{len(p_ids)} selected products" if p_ids else "all products"
        )
        return f"Bulk toggle products status to {stat} across {count} items in {scope}"

    elif tool_name == "propose_hold_bill":
        return f"Hold / park bill for {args.get('customer_name', 'customer')} ({len(args.get('items', []))} items)"

    elif tool_name == "propose_recall_hold_bill":
        return f"Recall and finalize held bill #{args.get('bill_no')}"

    elif tool_name == "propose_apply_bill_discount":
        return f"Apply {args.get('discount_value')}{'%' if args.get('discount_type') == 'percentage' else '₹'} discount on Bill #{args.get('bill_no')} (Reason: {args.get('reason')})"

    elif tool_name == "propose_create_raw_material":
        return f"Add raw material '{args.get('name')}' (₹{args.get('unit_price')}/{args.get('unit')}) to inventory"

    elif tool_name == "propose_update_inventory_item":
        return f"Update inventory raw material #{args.get('inventory_id')}"

    elif tool_name == "propose_reset_stock_count":
        return f"Reconcile physical stock count to {args.get('physical_count')} units (Reason: {args.get('reason')})"

    elif tool_name == "propose_bulk_mark_attendance":
        return f"Bulk mark {args.get('status', 'Present')} attendance for staff on {args.get('target_date', 'today')}"

    elif tool_name == "propose_update_worker":
        return f"Update worker profile for {args.get('worker_id')}"

    elif tool_name == "propose_create_worker_role":
        return f"Register staff designation role '{args.get('name')}'"

    elif tool_name == "propose_bulk_log_expenses":
        return f"Record {len(args.get('expenses', []))} expense vouchers in batch ({args.get('batch_note', 'Expenses')})"

    elif tool_name == "propose_update_expense":
        return f"Update expense voucher #{args.get('expense_id')}"

    elif tool_name == "propose_update_expense_type":
        return f"Update expense category #{args.get('type_id')}"

    elif tool_name == "propose_bulk_create_reminders":
        return f"Schedule {len(args.get('tasks', []))} checklist reminders for {args.get('template_name', 'Checklist')}"

    elif tool_name == "propose_update_reminder":
        return f"Update reminder #{args.get('reminder_id')} schedule"

    elif tool_name == "propose_mark_all_notifications_read":
        return "Mark all unread notifications as read"

    elif tool_name == "propose_export":
        return f"Export {args.get('report_type', 'sales')} report for {args.get('period', 'this_month')}"

    return f"Execute {tool_name} with arguments {json.dumps(args)}"


class PermissionGate:
    """Evaluates agent permissions, deletion policies, and gates execution with audit logs."""

    @staticmethod
    def is_agent_system_enabled() -> bool:
        """Check if the global master kill switch is active."""
        config = AgentConfig.query.first()
        if not config:
            return True
        return bool(config.enabled)

    @staticmethod
    def get_agent_tier(agent_name: str) -> str:
        """Get the configured tier for an agent, respecting hardcoded ceilings."""
        norm_name = agent_name.lower().strip()

        perm = AgentPermission.query.filter_by(agent_name=norm_name).first()
        tier = perm.tier if perm else "suggest_confirm"

        # Hardcoded security ceilings
        if norm_name in HARDCODED_CONFIRMATION_AGENTS:
            if tier == "full_autonomy":
                tier = "suggest_confirm"

        return tier

    @classmethod
    def dispatch_tool(
        cls,
        agent_name: str,
        tool_name: str,
        args: Dict[str, Any],
        actor_sub: str = "admin",
        user_message: str = "",
    ) -> Dict[str, Any]:
        """Dispatch a tool call through the permission gate and deletion policy."""
        if not cls.is_agent_system_enabled():
            return {
                "error": "Agentic AI is currently disabled by Master Kill Switch in Settings.",
                "blocked": True,
            }

        # 1. Check Deletion Policy First
        if is_deletion_tool(tool_name):
            policy = get_delete_policy(tool_name)
            if policy == "blocked":
                entity = get_entity_for_tool(tool_name)
                info = BLOCKED_REASONS.get(entity, BLOCKED_REASONS["product"])
                return {
                    "blocked": True,
                    "error": f"Direct deletion of {entity} records is restricted by policy.",
                    "structured_notice": {
                        "title": {
                            "icon": (
                                "inventory"
                                if entity == "product"
                                else "staff" if entity == "worker" else "billing"
                            ),
                            "text": info["title"],
                        },
                        "sections": [
                            {
                                "type": "insight_block",
                                "icon": "alert_warning",
                                "heading": info["heading"],
                                "body": info["body"],
                            },
                            {
                                "type": "action_list",
                                "icon": "tip",
                                "heading": info["guidance_title"],
                                "items": info["steps"],
                            },
                        ],
                        "meta": {"status": "warning", "statusIcon": "status_warning"},
                    },
                }

        # Check agent tool allowlist if agent has one registered
        allowed_tools = AgentToolRegistry.get_agent_tool_names(agent_name)
        if allowed_tools and tool_name not in allowed_tools:
            return {
                "blocked": True,
                "error": f"Tool '{tool_name}' is not permitted for the {agent_name} agent.",
            }

        # Read-only tools bypass mutation gates
        if not AgentToolRegistry.is_mutating(tool_name):
            return execute_read_tool(tool_name, args)

        # Pre-proposal schema validation
        arg_errors = validate_tool_args(tool_name, args)
        if arg_errors:
            return {
                "status": "invalid",
                "error": f"Validation failed for {tool_name}: {'; '.join(arg_errors)}",
                "blocked": False,
            }

        # Pre-proposal entity existence / constraint dry run
        dry_error = dry_run_tool(tool_name, args)
        if dry_error:
            return {
                "status": "invalid",
                "error": dry_error,
                "blocked": False,
            }

        tier = cls.get_agent_tier(agent_name)

        # 2. Read-only tier check
        if tier == "read_only":
            return {
                "error": f"The {agent_name.capitalize()} Agent is configured as Read-Only. Mutation actions are blocked.",
                "blocked": True,
            }

        # 3. Action type determination
        if is_bulk_tool(tool_name):
            act_type = "bulk_delete" if is_deletion_tool(tool_name) else "bulk_mutation"
        elif is_deletion_tool(tool_name):
            act_type = "delete"
        elif "restore" in tool_name:
            act_type = "restore"
        else:
            act_type = "mutation_proposal"

        # 4. Hardcoded ceiling or Suggest & Confirm tier
        requires_confirm = (
            tier == "suggest_confirm"
            or is_bulk_tool(tool_name)
            or agent_name in HARDCODED_CONFIRMATION_AGENTS
            or tool_name in HARDCODED_CONFIRMATION_TOOLS
        )

        diff_text = generate_diff_summary(tool_name, args)

        if requires_confirm:
            # Create proposed action log in database
            action_log = AgentActionLog(
                agent_name=agent_name,
                action_type=act_type,
                tool_name=tool_name,
                args_json=json.dumps(args),
                diff_summary=diff_text,
                user_message=user_message,
                status="proposed",
                performed_by=actor_sub,
            )
            db.session.add(action_log)
            db.session.commit()

            return {
                "action_id": action_log.id,
                "status": "proposed",
                "diff_summary": diff_text,
                "agent_name": agent_name,
                "tool_name": tool_name,
                "args": args,
                "requires_confirmation": True,
                "message": f"Action proposed: {diff_text}. Awaiting human approval.",
            }

        # 5. Full Autonomy tier (safe, non-financial / low-risk free tools only)
        action_log = AgentActionLog(
            agent_name=agent_name,
            action_type=act_type,
            tool_name=tool_name,
            args_json=json.dumps(args),
            diff_summary=diff_text,
            user_message=user_message,
            status="proposed",
            performed_by=actor_sub,
        )
        db.session.add(action_log)
        db.session.commit()

        exec_res = execute_mutating_tool(tool_name, args)

        if exec_res.get("success", False):
            action_log.status = "executed"
            action_log.result_summary = json.dumps(exec_res)
            action_log.execution_timestamp = datetime.now()

            # Extract affected entity id if present
            entity_id = (
                exec_res.get("expense_id")
                or exec_res.get("product_id")
                or exec_res.get("worker_id")
                or exec_res.get("bill_no")
                or exec_res.get("reminder_id")
                or exec_res.get("category_id")
                or exec_res.get("group_id")
            )
            if entity_id:
                action_log.affected_entity_id = str(entity_id)

            db.session.commit()
            return {
                "action_id": action_log.id,
                "status": "executed",
                "diff_summary": diff_text,
                "result": exec_res,
                "requires_confirmation": False,
            }
        else:
            action_log.status = "failed"
            action_log.error_message = exec_res.get("error", "Unknown execution error")
            db.session.commit()
            return {
                "action_id": action_log.id,
                "status": "failed",
                "error": action_log.error_message,
                "requires_confirmation": False,
            }
