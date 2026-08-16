"""Delete Policy Registry & Parity Enforcement for InfoOS Multi-Agent Assistant.

Categorizes entities into three explicit buckets:
1. 'blocked': Cannot delete, only disable/inactive (history-bearing records: product, worker, bill).
2. 'confirm': May delete via propose_* + human confirmation (category, item_group, expense, expense_type, reminder).
3. 'free': Low-risk entities deletable freely if agent tier permits (notification, held_bill).
"""

from typing import Dict, Any, Optional

DELETE_POLICY = {
    "product": "blocked",
    "worker": "blocked",
    "bill": "blocked",
    "category": "confirm",
    "item_group": "confirm",
    "expense": "confirm",
    "expense_type": "confirm",
    "reminder": "confirm",
    "held_bill": "free",
    "notification": "free",
}

BLOCKED_REASONS = {
    "product": {
        "title": "Catalog Deletion Policy Notice",
        "heading": "Direct Product Deletion Restricted",
        "body": (
            "As an inventory and product assistant, direct permanent deletion of product catalog items is restricted "
            "because products carry historical bill transactions and sales analytics. "
            "To remove items from active POS terminals while preserving order history, please mark the product as inactive."
        ),
        "guidance_title": "How to Hide Products from POS",
        "steps": [
            {
                "title": "Update Product Status",
                "body": "Propose updating product status to 'Inactive' (active=False) to remove it from customer-facing screens.",
            },
            {
                "title": "Stock Adjustment",
                "body": "If you wish to clear remaining inventory due to discontinuation, propose a stock adjustment.",
            },
        ],
    },
    "worker": {
        "title": "Staff Records Deletion Policy Notice",
        "heading": "Staff Profile Deletion Restricted",
        "body": (
            "Permanent deletion of worker profiles is restricted because staff records maintain historical attendance, "
            "salary advances, and monthly payroll history. "
            "To deactivate staff members who are no longer working, propose updating their status to inactive."
        ),
        "guidance_title": "How to Deactivate Staff",
        "steps": [
            {
                "title": "Set Inactive Status",
                "body": "Propose setting worker active flag to false to exclude them from daily attendance rosters.",
            },
            {
                "title": "Reconcile Advances",
                "body": "Check and settle any remaining advance balances prior to closing the worker file.",
            },
        ],
    },
    "bill": {
        "title": "Billing Audit Deletion Policy Notice",
        "heading": "Customer Bill Deletion Restricted",
        "body": (
            "Direct deletion of customer bill records is restricted for accounting audit compliance and tax integrity. "
            "To invalidate an incorrectly created bill, use the Void Bill action instead."
        ),
        "guidance_title": "How to Invalidate Bills",
        "steps": [
            {
                "title": "Void Bill",
                "body": "Propose voiding the bill with a reason (e.g. 'Customer cancellation' or 'Entry error').",
            },
        ],
    },
}


def get_entity_for_tool(tool_name: str) -> str:
    """Extract entity type from a tool name."""
    norm = tool_name.lower().strip()
    if "product" in norm:
        return "product"
    if "worker" in norm or "staff" in norm:
        return "worker"
    if "bill" in norm and "held" not in norm:
        return "bill"
    if "held_bill" in norm:
        return "held_bill"
    if "category" in norm:
        return "category"
    if "group" in norm:
        return "item_group"
    if "expense_type" in norm:
        return "expense_type"
    if "expense" in norm:
        return "expense"
    if "reminder" in norm:
        return "reminder"
    if "notification" in norm:
        return "notification"
    return "unknown"


def is_deletion_tool(tool_name: str) -> bool:
    """Check if the tool performs a single or bulk deletion operation."""
    norm = tool_name.lower().strip()
    return "delete" in norm or "remove" in norm or "purge" in norm


def is_bulk_tool(tool_name: str) -> bool:
    """Check if tool performs a bulk / batch mutation."""
    return "bulk" in tool_name.lower() or "batch" in tool_name.lower()


def get_delete_policy(tool_name: str) -> str:
    """Return 'blocked', 'confirm', or 'free' for a tool. Unclassified defaults to 'blocked'."""
    if is_bulk_tool(tool_name):
        # Bulk operations ALWAYS require confirmation regardless of entity
        return "confirm"

    entity = get_entity_for_tool(tool_name)
    return DELETE_POLICY.get(entity, "blocked")
