import json
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional, Set
from sqlalchemy import func, desc, or_
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
    SalaryPayment,
    Expense,
    ExpenseType,
    ExpenseItem,
    Reminder,
    Notification,
    DailySalesSummary,
    AuditEvent,
)
from services.db_service import DatabaseService
from services.worker_service import WorkerService
from agents.undo_service import UndoService

_log = logging.getLogger(__name__)
_db_svc = DatabaseService()

# In-memory session tool result cache with TTL (60s)
_TOOL_CACHE: Dict[str, Any] = {}
CACHE_TTL_SECONDS = 60.0


def _get_cached_tool_result(tool_name: str, args: Dict[str, Any]) -> Optional[Any]:
    cache_key = f"{tool_name}:{json.dumps(args or {}, sort_keys=True)}"
    if cache_key in _TOOL_CACHE:
        entry_time, result = _TOOL_CACHE[cache_key]
        if (datetime.now().timestamp() - entry_time) < CACHE_TTL_SECONDS:
            return result
        else:
            del _TOOL_CACHE[cache_key]
    return None


def _set_cached_tool_result(tool_name: str, args: Dict[str, Any], result: Any):
    cache_key = f"{tool_name}:{json.dumps(args or {}, sort_keys=True)}"
    _TOOL_CACHE[cache_key] = (datetime.now().timestamp(), result)


def clear_tool_cache():
    """Flush the in-memory tool cache when a mutation occurs."""
    _TOOL_CACHE.clear()


# =============================================================================
# TOOL SCHEMAS & REGISTRY
# =============================================================================


class AgentToolRegistry:
    """Registry providing schemas and execution handlers for domain agent tools."""

    @staticmethod
    def get_billing_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "lookup_product",
                "description": "Look up products by name or product ID to check price, stock, and variations (max 10 results).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Product name or ID keyword to search",
                        }
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "get_recent_bills",
                "description": "Fetch the most recent bills created today (default limit 10, max 20).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Number of bills to return (default: 10, max: 20)",
                        }
                    },
                },
            },
            {
                "name": "get_bill_by_number",
                "description": "Look up complete line items, customer details, and payment info for a specific bill or token.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_no": {"type": "integer", "description": "Bill Number to look up"},
                        "token_no": {
                            "type": "integer",
                            "description": "Today's Token Number to look up",
                        },
                    },
                },
            },
            {
                "name": "get_daily_token_count",
                "description": "Get today's total bills count and current highest token number issued.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_hold_bills",
                "description": "List currently parked or held customer bills.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_customer_order_history",
                "description": "Query all previous bills, total lifetime spend, and average order value for a customer by mobile number or name.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Customer mobile number or customer name",
                        },
                        "limit": {"type": "integer", "default": 10},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "get_bill_payment_summary",
                "description": "Get today's total collection and bill counts split across Cash, UPI, Online, and Split payment methods.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD (defaults to today)",
                        }
                    },
                },
            },
            {
                "name": "propose_create_bill",
                "description": "Propose creating a new customer bill with itemized products, order type, and payment mode.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "description": "List of items with product_id and quantity",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "quantity": {"type": "number"},
                                    "name": {"type": "string"},
                                },
                                "required": ["product_id", "quantity"],
                            },
                        },
                        "payment_method": {
                            "type": "string",
                            "enum": ["CASH", "ONLINE", "UPI", "SPLIT"],
                            "default": "CASH",
                        },
                        "order_type": {
                            "type": "string",
                            "enum": ["dine-in", "takeaway", "delivery"],
                            "default": "dine-in",
                        },
                        "customer_name": {"type": "string"},
                        "customer_mobile": {"type": "string"},
                        "table_no": {"type": "string"},
                    },
                    "required": ["items"],
                },
            },
            {
                "name": "propose_split_payment_bill",
                "description": "Propose creating a bill with split payment amounts across Cash and UPI/Online.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "description": "List of items with product_id and quantity",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "quantity": {"type": "number"},
                                },
                                "required": ["product_id", "quantity"],
                            },
                        },
                        "cash_amount": {"type": "number", "description": "Cash portion in ₹"},
                        "online_amount": {
                            "type": "number",
                            "description": "UPI/Online portion in ₹",
                        },
                        "order_type": {
                            "type": "string",
                            "enum": ["dine-in", "takeaway", "delivery"],
                            "default": "dine-in",
                        },
                        "customer_name": {"type": "string"},
                        "customer_mobile": {"type": "string"},
                        "table_no": {"type": "string"},
                    },
                    "required": ["items", "cash_amount", "online_amount"],
                },
            },
            {
                "name": "propose_hold_bill",
                "description": "Propose parking/holding an active order draft so cashier can resume it later.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "items": {
                            "type": "array",
                            "description": "List of items with product_id and quantity",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "string"},
                                    "quantity": {"type": "number"},
                                },
                                "required": ["product_id", "quantity"],
                            },
                        },
                        "order_type": {"type": "string", "default": "dine-in"},
                        "customer_name": {"type": "string"},
                        "customer_mobile": {"type": "string"},
                        "table_no": {"type": "string"},
                        "note": {"type": "string"},
                    },
                    "required": ["items"],
                },
            },
            {
                "name": "propose_recall_hold_bill",
                "description": "Propose converting a held/parked bill into a finalized active bill with payment.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_no": {
                            "type": "integer",
                            "description": "Bill number of the held bill",
                        },
                        "payment_method": {
                            "type": "string",
                            "enum": ["CASH", "ONLINE", "UPI", "SPLIT"],
                            "default": "CASH",
                        },
                    },
                    "required": ["bill_no"],
                },
            },
            {
                "name": "propose_apply_bill_discount",
                "description": "Propose applying a flat or percentage discount to a bill created today.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_no": {"type": "integer", "description": "Bill number"},
                        "discount_type": {"type": "string", "enum": ["percentage", "flat"]},
                        "discount_value": {
                            "type": "number",
                            "description": "% discount (e.g. 10) or flat ₹ amount (e.g. 50)",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Reason e.g. Owner Discount, Festival Offer",
                        },
                    },
                    "required": ["bill_no", "discount_type", "discount_value", "reason"],
                },
            },
            {
                "name": "propose_void_bill",
                "description": "Propose voiding or canceling a bill created TODAY only (older bills are locked).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bill_no": {"type": "integer", "description": "The bill number to void"},
                        "reason": {
                            "type": "string",
                            "description": "Mandatory human reason for voiding",
                        },
                    },
                    "required": ["bill_no", "reason"],
                },
            },
        ]

    @staticmethod
    def get_inventory_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "get_inventory_status",
                "description": "List inventory stock levels, unit prices, and threshold alerts (capped to 25 items).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "low_stock_only": {
                            "type": "boolean",
                            "description": "Filter to only items below alert threshold",
                        }
                    },
                },
            },
            {
                "name": "list_low_stock_items",
                "description": "Bulk query all inventory items where stock <= alert_threshold, sorted by urgency.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {
                            "type": "integer",
                            "description": "Max items to return (default: 20)",
                        }
                    },
                },
            },
            {
                "name": "get_stock_valuation",
                "description": "Calculate total rupee valuation of current stock on hand across raw materials and products.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_stock_consumption_rate",
                "description": "Calculate estimated daily consumption rate and projected days of stock remaining based on recent orders.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Optional product or raw material name",
                        },
                        "days": {
                            "type": "integer",
                            "default": 7,
                            "description": "Historical days to average (default 7)",
                        },
                    },
                },
            },
            {
                "name": "get_inventory_logs",
                "description": "Review recent stock adjustments, restockings, and spoilage audit logs with timestamps.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 15},
                    },
                },
            },
            {
                "name": "propose_adjust_stock",
                "description": "Propose adjusting the stock quantity of a single inventory item or product.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {
                            "type": "string",
                            "description": "Product ID if direct sale item",
                        },
                        "inventory_id": {
                            "type": "integer",
                            "description": "Inventory ID if raw material",
                        },
                        "delta_quantity": {
                            "type": "number",
                            "description": "+ to add stock, - to deduct",
                        },
                        "reason": {
                            "type": "string",
                            "description": "Mandatory reason e.g. Delivery, Spoilage, Wastage",
                        },
                    },
                    "required": ["delta_quantity", "reason"],
                },
            },
            {
                "name": "propose_bulk_stock_adjustment",
                "description": "Propose updating stock quantities for multiple items in a single batch proposal (e.g. after truck delivery).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "adjustments": {
                            "type": "array",
                            "description": "List of adjustments with inventory_id or product_id, delta_quantity, and reason",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "inventory_id": {"type": "integer"},
                                    "product_id": {"type": "string"},
                                    "delta_quantity": {"type": "number"},
                                    "reason": {"type": "string"},
                                },
                                "required": ["delta_quantity"],
                            },
                        },
                        "batch_note": {
                            "type": "string",
                            "description": "Batch summary note e.g. Weekly Vendor Restock",
                        },
                    },
                    "required": ["adjustments"],
                },
            },
            {
                "name": "propose_update_threshold",
                "description": "Propose updating the low-stock alert threshold for an inventory item.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "inventory_id": {"type": "integer"},
                        "alert_threshold": {"type": "number"},
                    },
                    "required": ["inventory_id", "alert_threshold"],
                },
            },
            {
                "name": "propose_create_raw_material",
                "description": "Propose registering a new raw material or kitchen ingredient in inventory.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Material name e.g. Paneer, Amul Butter",
                        },
                        "unit": {
                            "type": "string",
                            "enum": ["kg", "liter", "packet", "piece"],
                            "default": "kg",
                        },
                        "unit_price": {"type": "number", "description": "Cost price per unit in ₹"},
                        "alert_threshold": {
                            "type": "number",
                            "description": "Low stock warning limit",
                        },
                        "initial_stock": {"type": "number", "default": 0.0},
                    },
                    "required": ["name", "unit", "unit_price"],
                },
            },
            {
                "name": "propose_update_inventory_item",
                "description": "Propose updating raw material details (name, unit, unit price, threshold).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "inventory_id": {"type": "integer", "description": "Inventory ID"},
                        "name": {"type": "string"},
                        "unit": {"type": "string", "enum": ["kg", "liter", "packet", "piece"]},
                        "unit_price": {"type": "number"},
                        "alert_threshold": {"type": "number"},
                    },
                    "required": ["inventory_id"],
                },
            },
            {
                "name": "propose_reset_stock_count",
                "description": "Propose setting the exact physical count for an item after manual stock count reconciliation.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "inventory_id": {"type": "integer"},
                        "product_id": {"type": "string"},
                        "physical_count": {
                            "type": "number",
                            "description": "Exact physical count measured",
                        },
                        "reason": {
                            "type": "string",
                            "default": "Physical Stock Count Reconciliation",
                        },
                    },
                    "required": ["physical_count"],
                },
            },
        ]

    @staticmethod
    def get_product_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "search_products",
                "description": "Search the product catalog for menu items, pricing, variations, and active status (max 20). NOTE: For sales figures, revenue, or top/best selling products, use the analytics agent tools.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Product name or ID keyword"},
                        "active_only": {"type": "boolean", "default": False},
                        "limit": {"type": "integer", "default": 20},
                    },
                },
            },
            {
                "name": "get_categories_and_groups",
                "description": "Retrieve all product categories and item groups with hierarchy.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_category_list",
                "description": "List all active registered product categories in the database.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_group_list",
                "description": "List all top-level item groups with their active status and display order.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_product_details",
                "description": "Get detailed specs for a specific product including category hierarchy, variations, and stock link.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string", "description": "Product ID or exact name"},
                    },
                    "required": ["product_id"],
                },
            },
            {
                "name": "propose_create_product",
                "description": "Propose adding a new product to the catalog under a registered category.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Name of the product"},
                        "price": {"type": "number", "description": "Dine-in selling price in ₹"},
                        "takeaway_price": {"type": "number"},
                        "category_id": {
                            "type": "integer",
                            "description": "Category ID from database",
                        },
                        "description": {
                            "type": "string",
                            "description": "Optional culinary or menu item description for customers",
                        },
                        "variations": {"type": "array", "items": {"type": "object"}},
                    },
                    "required": ["name", "price"],
                },
            },
            {
                "name": "propose_update_product",
                "description": "Propose updating an existing product's name, price, category, description, or status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string", "description": "ID of product to update"},
                        "name": {"type": "string"},
                        "price": {"type": "number"},
                        "takeaway_price": {"type": "number"},
                        "category_id": {"type": "integer"},
                        "description": {
                            "type": "string",
                            "description": "Updated culinary or menu item description",
                        },
                        "active": {"type": "boolean"},
                    },
                    "required": ["product_id"],
                },
            },
            {
                "name": "propose_variation_update",
                "description": "Propose updating size/portion variations for an existing product (e.g. Small/Medium/Large).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_id": {"type": "string", "description": "Product ID"},
                        "variations": {
                            "type": "array",
                            "description": "Array of variation objects with name and price",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "name": {"type": "string"},
                                    "price": {"type": "number"},
                                },
                                "required": ["name", "price"],
                            },
                        },
                    },
                    "required": ["product_id", "variations"],
                },
            },
            {
                "name": "propose_group_reorder",
                "description": "Propose updating display sort order of item groups on the POS screen.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "group_orders": {
                            "type": "array",
                            "description": "List of {group_id, display_order}",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "group_id": {"type": "integer"},
                                    "display_order": {"type": "integer"},
                                },
                                "required": ["group_id", "display_order"],
                            },
                        }
                    },
                    "required": ["group_orders"],
                },
            },
            {
                "name": "propose_toggle_group_status",
                "description": "Propose enabling or disabling an item group in real-time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "group_id": {"type": "integer", "description": "Item group ID"},
                        "is_active": {
                            "type": "boolean",
                            "description": "True to enable, False to disable",
                        },
                    },
                    "required": ["group_id", "is_active"],
                },
            },
            {
                "name": "propose_create_category",
                "description": "Propose creating a new menu category with name, group_id, and optional description.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Category name"},
                        "group_id": {"type": "integer", "description": "Item group ID"},
                        "description": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
            {
                "name": "propose_create_item_group",
                "description": "Propose creating a new top-level item group with display order and description.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Group name e.g. Beverages, Fast Food",
                        },
                        "description": {"type": "string"},
                        "display_order": {"type": "integer", "default": 0},
                        "color": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
            {
                "name": "propose_update_category",
                "description": "Propose updating a category name, description, group_id, or active status.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category_id": {"type": "integer", "description": "Category ID"},
                        "name": {"type": "string"},
                        "group_id": {"type": "integer"},
                        "description": {"type": "string"},
                        "active": {"type": "boolean"},
                    },
                    "required": ["category_id"],
                },
            },
            {
                "name": "propose_bulk_update_prices",
                "description": "Propose adjusting prices across multiple products at once (e.g. +10% increase or flat adjustment).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category_id": {
                            "type": "integer",
                            "description": "Optional category to target all its products",
                        },
                        "percentage_change": {
                            "type": "number",
                            "description": "Percentage change e.g. +10 or -5",
                        },
                        "flat_change": {
                            "type": "number",
                            "description": "Flat ₹ delta to add or subtract",
                        },
                        "product_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Specific list of product IDs",
                        },
                    },
                },
            },
            {
                "name": "propose_bulk_toggle_products",
                "description": "Propose enabling or disabling multiple products simultaneously (e.g. deactivate morning specials).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "product_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of product IDs",
                        },
                        "category_id": {
                            "type": "integer",
                            "description": "Category ID to toggle all items",
                        },
                        "active": {
                            "type": "boolean",
                            "description": "True to activate, False to disable",
                        },
                    },
                    "required": ["active"],
                },
            },
            {
                "name": "propose_delete_category",
                "description": "Propose deleting a category from the database if no products are assigned (or deactivating if products exist).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category_id": {
                            "type": "integer",
                            "description": "ID of category to delete",
                        }
                    },
                    "required": ["category_id"],
                },
            },
            {
                "name": "propose_delete_item_group",
                "description": "Propose deleting an item group. If it contains active categories, specify action='move' and move_to=<group_id>.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "group_id": {
                            "type": "integer",
                            "description": "ID of item group to delete",
                        },
                        "action": {
                            "type": "string",
                            "enum": ["move", "delete"],
                            "description": "Action if group contains categories",
                        },
                        "move_to": {
                            "type": "integer",
                            "description": "Target group ID if moving categories",
                        },
                    },
                    "required": ["group_id"],
                },
            },
            {
                "name": "propose_bulk_delete_categories",
                "description": "Propose bulk deleting multiple unused categories by IDs (max 500).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category_ids": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "List of category IDs to delete",
                        }
                    },
                    "required": ["category_ids"],
                },
            },
            {
                "name": "propose_bulk_delete_item_groups",
                "description": "Propose bulk deleting multiple item groups by IDs (max 500).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "group_ids": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "List of group IDs to delete",
                        }
                    },
                    "required": ["group_ids"],
                },
            },
        ]

    @staticmethod
    def get_worker_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "list_workers",
                "description": "List workers with roles, contact, base salary, and status (max 20).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["active", "inactive", "all"],
                            "default": "active",
                        },
                        "role": {"type": "string", "description": "Filter by job role"},
                        "limit": {"type": "integer", "default": 20},
                    },
                },
            },
            {
                "name": "get_worker_attendance",
                "description": "Get attendance status for all workers on a specific date (YYYY-MM-DD).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD date (defaults to today)",
                        }
                    },
                },
            },
            {
                "name": "get_attendance_summary",
                "description": "Summarize month-to-date present, absent, and half-day counts across workers.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": {
                            "type": "integer",
                            "description": "Month number 1-12 (defaults to current)",
                        },
                        "year": {"type": "integer", "description": "Year (defaults to current)"},
                    },
                },
            },
            {
                "name": "get_pending_payroll",
                "description": "Calculate monthly payroll estimates for all active staff (base - unpaid leaves - advances = net payable).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "month": {"type": "integer", "description": "Month number 1-12"},
                        "year": {"type": "integer", "description": "Year"},
                    },
                },
            },
            {
                "name": "calculate_worker_salary",
                "description": "Calculate detailed monthly salary breakdown, leave deductions, and unpaid advances for a specific worker.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "worker_id": {"type": "string", "description": "Worker ID"},
                        "month": {"type": "integer", "description": "Month 1-12"},
                        "year": {"type": "integer", "description": "Year"},
                    },
                    "required": ["worker_id"],
                },
            },
            {
                "name": "get_worker_advances",
                "description": "Get advance disbursement history and unpaid balance for a worker.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "worker_id": {"type": "string", "description": "Worker ID"},
                    },
                    "required": ["worker_id"],
                },
            },
            {
                "name": "list_worker_roles",
                "description": "List all registered staff job designations/roles with staff counts.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "propose_create_worker",
                "description": "Propose registering a new staff member with name, role, salary, description, phone, and joining date.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Full name of worker (Mandatory)",
                        },
                        "salary": {
                            "type": "number",
                            "description": "Monthly base salary in ₹ (Mandatory)",
                        },
                        "role": {
                            "type": "string",
                            "description": "Job role e.g. Chef, Waiter, Cashier, Helper",
                        },
                        "description": {
                            "type": "string",
                            "description": "Job duties, responsibilities, or staff notes",
                        },
                        "phone": {"type": "string", "description": "Phone number"},
                        "join_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD (defaults to today)",
                        },
                    },
                    "required": ["name", "salary"],
                },
            },
            {
                "name": "propose_update_worker",
                "description": "Propose updating an existing worker's details (phone, base salary, role, notes, status).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "worker_id": {"type": "string", "description": "Worker ID"},
                        "name": {"type": "string"},
                        "phone": {"type": "string"},
                        "role": {"type": "string"},
                        "salary": {"type": "number"},
                        "description": {"type": "string"},
                        "status": {"type": "string", "enum": ["active", "inactive"]},
                    },
                    "required": ["worker_id"],
                },
            },
            {
                "name": "propose_mark_attendance",
                "description": "Propose marking daily attendance record for a worker.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "worker_id": {"type": "string", "description": "Worker ID"},
                        "status": {"type": "string", "enum": ["Present", "Absent", "Half-day"]},
                        "target_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD (defaults to today)",
                        },
                    },
                    "required": ["worker_id", "status"],
                },
            },
            {
                "name": "propose_bulk_mark_attendance",
                "description": "Propose marking attendance for all active staff in one batch (e.g. mark all Present today).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["Present", "Absent", "Half-day"],
                            "default": "Present",
                        },
                        "target_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD (defaults to today)",
                        },
                        "worker_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Optional list of specific worker IDs; if omitted, marks all active staff",
                        },
                    },
                },
            },
            {
                "name": "propose_record_advance",
                "description": "Propose recording a salary advance given to a worker.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "worker_id": {"type": "string", "description": "Worker ID"},
                        "amount": {"type": "number", "description": "Advance amount in ₹"},
                        "reason": {"type": "string", "description": "Reason for advance"},
                    },
                    "required": ["worker_id", "amount"],
                },
            },
            {
                "name": "propose_create_worker_role",
                "description": "Propose registering a new staff role / designation type in the system.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {
                            "type": "string",
                            "description": "Role name e.g. Bartender, Floor Manager",
                        },
                        "description": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
        ]

    @staticmethod
    def get_expense_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "list_expense_types",
                "description": "List all registered business expense categories in the database.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "list_recent_expenses",
                "description": "List recent operational expenses filtered by limit, category, or date range (max 20).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "limit": {"type": "integer", "default": 15},
                        "category": {"type": "string"},
                        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                    },
                },
            },
            {
                "name": "get_expense_category_breakdown",
                "description": "Aggregate spending grouped by expense category for a date range (highest spend first).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": ["today", "this_month", "all"],
                            "default": "this_month",
                        }
                    },
                },
            },
            {
                "name": "get_expense_by_id",
                "description": "Get complete voucher details, linked staff, and sub-items for a specific expense voucher.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expense_id": {"type": "string", "description": "Expense ID"},
                    },
                    "required": ["expense_id"],
                },
            },
            {
                "name": "get_recurring_expense_forecast",
                "description": "Estimate upcoming fixed monthly operational expenditures (Rent, Salaries, Utilities) based on history.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "propose_log_expense",
                "description": "Propose recording an operational expense voucher with title, amount, category, and payment method.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Title/Description of expense"},
                        "category": {"type": "string", "description": "Registered category name"},
                        "amount": {"type": "number", "description": "Amount spent in ₹"},
                        "payment_method": {
                            "type": "string",
                            "enum": ["Cash", "Online", "Bank Transfer"],
                            "default": "Cash",
                        },
                        "worker_id": {
                            "type": "string",
                            "description": "Optional worker ID if linked",
                        },
                        "notes": {"type": "string"},
                    },
                    "required": ["title", "category", "amount"],
                },
            },
            {
                "name": "propose_bulk_log_expenses",
                "description": "Propose logging multiple expense receipts in a single batch proposal (e.g. daily petty cash reconciliation).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expenses": {
                            "type": "array",
                            "description": "List of expense items",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "category": {"type": "string"},
                                    "amount": {"type": "number"},
                                    "payment_method": {"type": "string", "default": "Cash"},
                                    "notes": {"type": "string"},
                                },
                                "required": ["title", "category", "amount"],
                            },
                        },
                        "batch_note": {"type": "string", "default": "Daily Petty Cash Expenses"},
                    },
                    "required": ["expenses"],
                },
            },
            {
                "name": "propose_update_expense",
                "description": "Propose updating or correcting an existing expense voucher (title, amount, category, payment method).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expense_id": {"type": "string", "description": "Expense ID to update"},
                        "title": {"type": "string"},
                        "category": {"type": "string"},
                        "amount": {"type": "number"},
                        "payment_method": {"type": "string"},
                        "notes": {"type": "string"},
                    },
                    "required": ["expense_id"],
                },
            },
            {
                "name": "propose_expense_type",
                "description": "Propose registering a new expense category type in the database.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "New category name"},
                        "description": {"type": "string"},
                    },
                    "required": ["name"],
                },
            },
            {
                "name": "propose_update_expense_type",
                "description": "Propose renaming or updating description of an existing expense category.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type_id": {"type": "integer", "description": "Expense type ID"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "is_active": {"type": "boolean"},
                    },
                    "required": ["type_id"],
                },
            },
            {
                "name": "propose_delete_expense",
                "description": "Propose deleting an individual expense voucher by ID.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expense_id": {
                            "type": "string",
                            "description": "ID of expense to delete",
                        }
                    },
                    "required": ["expense_id"],
                },
            },
            {
                "name": "propose_delete_expense_type",
                "description": "Propose deleting an expense category type (only permitted if no recorded expenses use this type).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "type_id": {
                            "type": "integer",
                            "description": "ID of expense type to delete",
                        }
                    },
                    "required": ["type_id"],
                },
            },
            {
                "name": "propose_bulk_delete_expenses",
                "description": "Propose bulk deleting expenses matching a specific filter (date range, category, amount range, or specific IDs). Max 500 rows.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "category": {"type": "string", "description": "Filter by category name"},
                        "start_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "end_date": {"type": "string", "description": "YYYY-MM-DD"},
                        "min_amount": {"type": "number"},
                        "max_amount": {"type": "number"},
                        "expense_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Specific list of expense IDs",
                        },
                    },
                },
            },
        ]

    @staticmethod
    def get_analytics_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "get_sales_kpi_summary",
                "description": "Get pre-aggregated sales performance KPIs (revenue, orders, expenses, net profit, average bill value).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": [
                                "today",
                                "yesterday",
                                "last_7_days",
                                "last_30_days",
                                "this_month",
                                "last_month",
                                "this_year",
                                "all",
                            ],
                            "default": "today",
                        }
                    },
                },
            },
            {
                "name": "get_sales_trend",
                "description": "Get multi-day sales and order volume comparison (last N days). Use this to compare daily or monthly sales trends over time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "integer",
                            "default": 7,
                            "description": "Number of days (default: 7)",
                        }
                    },
                },
            },
            {
                "name": "get_hourly_footfall",
                "description": "Get hourly breakdown of order counts and revenue to identify peak rush hours.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "target_date": {
                            "type": "string",
                            "description": "YYYY-MM-DD (defaults to today)",
                        }
                    },
                },
            },
            {
                "name": "get_top_selling_products",
                "description": "Get the top selling products by quantity and sales volume (max 10).",
                "parameters": {
                    "type": "object",
                    "properties": {"limit": {"type": "integer", "default": 10}},
                },
            },
            {
                "name": "get_payment_mode_breakdown",
                "description": "Get revenue split across cash vs digital/online payment modes.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "get_category_sales_breakdown",
                "description": "Aggregate sales revenue and order counts broken down by product categories.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": ["today", "this_month", "last_30_days", "all"],
                            "default": "this_month",
                        },
                    },
                },
            },
            {
                "name": "get_order_type_breakdown",
                "description": "Compare Dine-In vs Takeaway vs Delivery: revenue, order count, average ticket size, and % share.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": ["today", "this_month", "last_30_days"],
                            "default": "this_month",
                        },
                    },
                },
            },
            {
                "name": "get_peak_days_analysis",
                "description": "Analyze average revenue and order volume by day of the week (Monday through Sunday) over the last 30/90 days.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days": {
                            "type": "integer",
                            "default": 30,
                            "description": "Days to analyze (e.g. 30, 60, 90)",
                        },
                    },
                },
            },
            {
                "name": "get_dead_stock_report",
                "description": "Identify menu items or products that have had 0 sales in the last N days (slow-moving/dead catalog items).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "days_threshold": {
                            "type": "integer",
                            "default": 14,
                            "description": "Inactivity days threshold (default 14)",
                        },
                    },
                },
            },
            {
                "name": "get_profit_margin_analysis",
                "description": "Compute overall gross profit margin %, net margin, and expense-to-revenue ratios.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "period": {
                            "type": "string",
                            "enum": ["today", "this_month", "all"],
                            "default": "this_month",
                        },
                    },
                },
            },
            {
                "name": "propose_export",
                "description": "Propose generating an export report of sales or expenses for the owner to download.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "report_type": {
                            "type": "string",
                            "enum": ["sales", "expenses", "inventory"],
                            "default": "sales",
                        },
                        "period": {"type": "string", "default": "this_month"},
                    },
                    "required": ["report_type"],
                },
            },
        ]

    @staticmethod
    def get_reminder_tools() -> List[Dict[str, Any]]:
        return [
            {
                "name": "list_reminders",
                "description": "List active, pending, or triggered operational reminders (max 20).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["pending", "triggered", "all"],
                            "default": "pending",
                        },
                        "limit": {"type": "integer", "default": 20},
                    },
                },
            },
            {
                "name": "get_unread_notification_count",
                "description": "Get count of unread notifications, pending task alerts, and low stock warnings.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "list_notifications",
                "description": "List system notifications, reminders, and low-stock alerts with read/unread filter.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["unread", "read", "all"],
                            "default": "unread",
                        },
                        "limit": {"type": "integer", "default": 20},
                    },
                },
            },
            {
                "name": "propose_create_reminder",
                "description": "Schedule a new operational task or reminder alert with target date/time.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Reminder title/task"},
                        "reminder_time": {
                            "type": "string",
                            "description": "YYYY-MM-DD HH:MM:SS or ISO datetime",
                        },
                        "repeat_type": {
                            "type": "string",
                            "enum": ["once", "daily", "weekly", "monthly"],
                            "default": "once",
                        },
                        "description": {"type": "string"},
                    },
                    "required": ["title", "reminder_time"],
                },
            },
            {
                "name": "propose_bulk_create_reminders",
                "description": "Propose scheduling a checklist of multiple daily operational tasks (e.g. Opening or Closing Store Checklist).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "template_name": {
                            "type": "string",
                            "description": "e.g. Morning Opening Checklist or Evening Closing Checklist",
                        },
                        "tasks": {
                            "type": "array",
                            "description": "List of tasks with title and time",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "title": {"type": "string"},
                                    "reminder_time": {"type": "string"},
                                    "repeat_type": {"type": "string", "default": "daily"},
                                },
                                "required": ["title", "reminder_time"],
                            },
                        },
                    },
                    "required": ["tasks"],
                },
            },
            {
                "name": "propose_snooze_reminder",
                "description": "Snooze an active reminder by a specified number of minutes.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reminder_id": {"type": "string"},
                        "minutes": {"type": "integer", "default": 30},
                    },
                    "required": ["reminder_id"],
                },
            },
            {
                "name": "propose_complete_reminder",
                "description": "Mark an operational reminder as completed.",
                "parameters": {
                    "type": "object",
                    "properties": {"reminder_id": {"type": "string"}},
                    "required": ["reminder_id"],
                },
            },
            {
                "name": "propose_update_reminder",
                "description": "Propose updating reminder title, description, time, or recurrence.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reminder_id": {"type": "string", "description": "Reminder ID"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "reminder_time": {"type": "string"},
                        "repeat_type": {
                            "type": "string",
                            "enum": ["once", "daily", "weekly", "monthly"],
                        },
                    },
                    "required": ["reminder_id"],
                },
            },
            {
                "name": "propose_delete_reminder",
                "description": "Propose permanently removing an operational reminder task.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "reminder_id": {
                            "type": "string",
                            "description": "Reminder ID to delete",
                        }
                    },
                    "required": ["reminder_id"],
                },
            },
            {
                "name": "delete_notification",
                "description": "Delete or dismiss a single notification record.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "notification_id": {
                            "type": "string",
                            "description": "Notification ID to delete",
                        }
                    },
                    "required": ["notification_id"],
                },
            },
            {
                "name": "propose_mark_all_notifications_read",
                "description": "Propose marking all currently unread notifications as read.",
                "parameters": {"type": "object", "properties": {}},
            },
            {
                "name": "propose_bulk_delete_reminders",
                "description": "Propose bulk deleting completed or old reminders matching a filter (status, before_date, or reminder_ids). Max 500 rows.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "status": {
                            "type": "string",
                            "enum": ["completed", "dismissed", "all"],
                            "description": "Filter by status",
                        },
                        "before_date": {
                            "type": "string",
                            "description": "Delete reminders before YYYY-MM-DD",
                        },
                        "reminder_ids": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Specific list of reminder IDs",
                        },
                    },
                },
            },
            {
                "name": "restore_deleted_item",
                "description": "Restore a recently deleted item using its snapshot data within the 48-hour recovery window.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action_id": {
                            "type": "integer",
                            "description": "Action log ID that executed the deletion",
                        }
                    },
                    "required": ["action_id"],
                },
            },
            {
                "name": "restore_last_bulk_delete",
                "description": "Restore an entire batch of bulk-deleted records within the 48-hour recovery window.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "action_id": {
                            "type": "integer",
                            "description": "Action log ID of the bulk deletion",
                        }
                    },
                    "required": ["action_id"],
                },
            },
        ]

    @staticmethod
    def get_prediction_tools() -> List[Dict[str, Any]]:
        """Tool schemas for the Sales Prediction domain agent (WARMP pipeline)."""
        return [
            {
                "name": "get_sales_history_for_prediction",
                "description": (
                    "Fetch daily sales totals, order counts, and average bill value for a given trailing period. "
                    "Core historical baseline tool for WARMP steps 1 and 2. Queries DailySalesSummary directly; "
                    "falls back to Bill aggregation when summary rows are absent."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "trailing_days": {
                            "type": "integer",
                            "description": "Number of past days to fetch (default: 90, min: 14, max: 365).",
                            "default": 90,
                        },
                        "group_by": {
                            "type": "string",
                            "enum": ["day", "weekday", "week", "month"],
                            "description": "Aggregation granularity. 'weekday' returns per-day-of-week averages (Mon–Sun).",
                            "default": "day",
                        },
                        "include_top_products": {
                            "type": "boolean",
                            "description": "If true, also returns top 10 products by revenue share over the period.",
                            "default": False,
                        },
                    },
                },
            },
            {
                "name": "get_top_products_for_prediction",
                "description": (
                    "Returns the top N products by historical revenue contribution over a trailing period. "
                    "Used for product-level demand disaggregation in WARMP step 5."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "top_n": {
                            "type": "integer",
                            "description": "Number of top products to return (default: 15)",
                            "default": 15,
                        },
                        "trailing_days": {
                            "type": "integer",
                            "description": "Historical window to compute product ranks (default: 60 days)",
                            "default": 60,
                        },
                        "group_by_time_slot": {
                            "type": "boolean",
                            "description": "If true, splits product demand by time slot (morning/lunch/evening/night).",
                            "default": False,
                        },
                    },
                },
            },
            {
                "name": "get_regional_festivals_and_holidays",
                "description": (
                    "Fetch upcoming regional festivals, public holidays, and dry days for the shop's city and state "
                    "(automatically read from profile.db — do NOT pass location manually). "
                    "Returns events with pre-computed holiday multiplier (H) values for WARMP step 3."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "from_date": {
                            "type": "string",
                            "description": "Start date for calendar lookup (YYYY-MM-DD). Defaults to tomorrow.",
                        },
                        "to_date": {
                            "type": "string",
                            "description": "End date for calendar lookup (YYYY-MM-DD). Defaults to 14 days from now.",
                        },
                        "include_regional": {
                            "type": "boolean",
                            "description": "Include state-specific regional festivals (e.g. Ganesh Chaturthi for Maharashtra).",
                            "default": True,
                        },
                        "include_national": {
                            "type": "boolean",
                            "description": "Include national public holidays applicable to all states.",
                            "default": True,
                        },
                        "include_dry_days": {
                            "type": "boolean",
                            "description": "Flag government-declared dry days or restricted trading hours.",
                            "default": True,
                        },
                    },
                },
            },
            {
                "name": "get_weather_forecast",
                "description": (
                    "Fetch a multi-day weather forecast for the shop's location (city, state, pincode from profile.db). "
                    "Returns daily conditions and a pre-computed weather_multiplier per day for WARMP step 4. "
                    "Uses Open-Meteo free API — no API key required. Pincode is geocoded via a bundled India pincode table."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "forecast_days": {
                            "type": "integer",
                            "description": "Number of days to forecast ahead (default: 7, max: 14).",
                            "default": 7,
                        },
                        "include_historical_weather_correlation": {
                            "type": "boolean",
                            "description": "If true, compute weather-to-sales correlation from prior-year same-period weather data.",
                            "default": False,
                        },
                    },
                },
            },
            {
                "name": "run_sales_prediction",
                "description": (
                    "Execute the full WARMP prediction pipeline for a given future date range. "
                    "This is the PRIMARY orchestrating tool — always call this for any forecast request. "
                    "Internally chains: sales history → top products → regional holidays → weather forecast → WARMP assembly. "
                    "Returns a day-by-day revenue, order, and product-demand forecast with confidence intervals, "
                    "staffing recommendations, and inventory pre-order suggestions."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "predict_from": {
                            "type": "string",
                            "description": "Start date of the prediction window (YYYY-MM-DD). Defaults to tomorrow.",
                        },
                        "predict_to": {
                            "type": "string",
                            "description": "End date of the prediction window (YYYY-MM-DD). Max 14 days ahead.",
                        },
                        "include_product_forecast": {
                            "type": "boolean",
                            "description": "If true, predicts per-product demand quantities for inventory pre-ordering.",
                            "default": True,
                        },
                        "include_staffing_recommendation": {
                            "type": "boolean",
                            "description": "If true, recommends minimum staff headcount per shift based on predicted orders.",
                            "default": True,
                        },
                        "include_confidence_intervals": {
                            "type": "boolean",
                            "description": "If true, attaches +/-% confidence ranges to all predictions.",
                            "default": True,
                        },
                    },
                },
            },
            {
                "name": "get_prediction_accuracy_report",
                "description": (
                    "Compare past WARMP predictions against actual sales results to measure forecast accuracy. "
                    "Returns MAE, MAPE, and a factor-level breakdown showing which signal (weather/holiday/baseline) "
                    "contributed most to errors. Helps calibrate multiplier tables over time."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "evaluation_period_days": {
                            "type": "integer",
                            "description": "Number of past days to evaluate prediction accuracy over (default: 30)",
                            "default": 30,
                        }
                    },
                },
            },
        ]

    @classmethod
    def all_tools(cls) -> List[Dict[str, Any]]:
        """Return a list of all tool schemas across all domain agents."""
        return (
            cls.get_billing_tools()
            + cls.get_inventory_tools()
            + cls.get_product_tools()
            + cls.get_worker_tools()
            + cls.get_expense_tools()
            + cls.get_analytics_tools()
            + cls.get_reminder_tools()
            + cls.get_prediction_tools()
        )

    @classmethod
    def all_tool_names(cls) -> List[str]:
        """Return a list of all tool names across all domain agents."""
        return [t["name"] for t in cls.all_tools()]

    @classmethod
    def get_tool_spec(cls, tool_name: str) -> Optional[Dict[str, Any]]:
        """Retrieve schema dictionary for a specific tool by name."""
        for t in cls.all_tools():
            if t["name"] == tool_name:
                return t
        return None

    @classmethod
    def get_agent_tool_names(cls, agent_name: str) -> Set[str]:
        """Return the set of tool names allowed for the given domain agent."""
        mapping = {
            "billing": cls.get_billing_tools,
            "inventory": cls.get_inventory_tools,
            "product": cls.get_product_tools,
            "worker": cls.get_worker_tools,
            "expense": cls.get_expense_tools,
            "analytics": cls.get_analytics_tools,
            "reminder": cls.get_reminder_tools,
            "prediction": cls.get_prediction_tools,
        }
        getter = mapping.get(str(agent_name).lower())
        if not getter:
            return set()
        return {t["name"] for t in getter()}

    @classmethod
    def is_mutating(cls, tool_name: str) -> bool:
        """Classify tool as mutating vs read-only by registry convention."""
        if tool_name.startswith("propose_"):
            return True
        return tool_name in {
            "delete_notification",
            "restore_deleted_item",
            "restore_last_bulk_delete",
        }


# =============================================================================
# READ-ONLY TOOL EXECUTION IMPLEMENTATIONS
# =============================================================================


def _execute_read_tool_uncached(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute raw read-only queries against services/models."""
    try:
        if tool_name == "lookup_product":
            q = args.get("query", "").strip()
            products = (
                Product.query.filter((Product.name.ilike(f"%{q}%")) | (Product.product_id == q))
                .limit(10)
                .all()
            )
            return {
                "count": len(products),
                "products": [
                    {
                        "product_id": p.product_id,
                        "name": p.name,
                        "price": p.price,
                        "takeaway_price": p.takeaway_price,
                        "active": p.active,
                        "category": p.category_rel.name if p.category_rel else p.category,
                        "variations": json.loads(p.variations) if p.variations else [],
                    }
                    for p in products
                ],
            }

        elif tool_name == "get_recent_bills":
            limit = min(int(args.get("limit", 10)), 20)
            bills = Bill.query.order_by(Bill.created_at.desc()).limit(limit).all()
            return {
                "count": len(bills),
                "bills": [
                    {
                        "id": b.id,
                        "bill_no": b.bill_no,
                        "total_amount": b.total_amount,
                        "today_token": b.today_token,
                        "payment_method": b.payment_method,
                        "order_type": b.order_type,
                        "customer_name": b.customer_name,
                        "customer_mobile": b.customer_mobile,
                        "created_at": b.created_at.isoformat() if b.created_at else None,
                        "status": b.status,
                    }
                    for b in bills
                ],
            }

        elif tool_name == "get_bill_by_number":
            bill_no = args.get("bill_no")
            token_no = args.get("token_no")
            query = Bill.query
            if bill_no:
                query = query.filter_by(bill_no=int(bill_no))
            elif token_no:
                query = query.filter(
                    Bill.today_token == int(token_no),
                    func.date(Bill.created_at) == date.today(),
                )
            else:
                return {"error": "Provide bill_no or token_no"}

            b = query.order_by(Bill.created_at.desc()).first()
            if not b:
                return {"found": False, "message": "Bill not found"}

            items_list = []
            try:
                items_list = json.loads(b.items) if b.items else []
            except Exception:
                items_list = []

            return {
                "found": True,
                "bill_no": b.bill_no,
                "today_token": b.today_token,
                "total_amount": b.total_amount,
                "payment_method": b.payment_method,
                "order_type": b.order_type,
                "customer_name": b.customer_name,
                "customer_mobile": b.customer_mobile,
                "created_at": b.created_at.isoformat() if b.created_at else None,
                "status": b.status,
                "items": items_list,
            }

        elif tool_name == "get_daily_token_count":
            today = date.today()
            max_token = (
                db.session.query(func.max(Bill.today_token))
                .filter(func.date(Bill.created_at) == today)
                .scalar()
                or 0
            )
            total_bills = Bill.query.filter(func.date(Bill.created_at) == today).count()
            return {
                "date": today.isoformat(),
                "current_max_token": max_token,
                "total_bills_today": total_bills,
            }

        elif tool_name == "get_hold_bills":
            held_bills = (
                Bill.query.filter_by(status="HELD").order_by(Bill.created_at.desc()).limit(15).all()
            )
            return {
                "count": len(held_bills),
                "hold_bills": [
                    {
                        "bill_no": b.bill_no,
                        "customer_name": b.customer_name,
                        "customer_mobile": b.customer_mobile,
                        "total_amount": b.total_amount,
                        "created_at": b.created_at.isoformat() if b.created_at else None,
                        "table_no": b.table_no,
                    }
                    for b in held_bills
                ],
            }

        elif tool_name == "get_customer_order_history":
            q = args.get("query", "").strip()
            limit = min(int(args.get("limit", 10)), 20)
            if not q:
                return {"error": "Please provide customer name or mobile number."}

            bills = (
                Bill.query.filter(
                    or_(
                        Bill.customer_mobile == q,
                        Bill.customer_name.ilike(f"%{q}%"),
                    )
                )
                .order_by(Bill.created_at.desc())
                .limit(limit)
                .all()
            )

            if not bills:
                return {"found": False, "message": f"No order history found for '{q}'"}

            total_spend = sum(
                b.total_amount for b in bills if b.status not in ("VOIDED", "CANCELLED")
            )
            avg_spend = total_spend / len(bills) if bills else 0.0

            return {
                "found": True,
                "customer_query": q,
                "total_orders": len(bills),
                "lifetime_spend": round(total_spend, 2),
                "average_order_value": round(avg_spend, 2),
                "recent_orders": [
                    {
                        "bill_no": b.bill_no,
                        "date": b.created_at.strftime("%Y-%m-%d %H:%M") if b.created_at else None,
                        "amount": b.total_amount,
                        "payment_method": b.payment_method,
                        "order_type": b.order_type,
                        "status": b.status,
                    }
                    for b in bills
                ],
            }

        elif tool_name == "get_bill_payment_summary":
            t_date_str = args.get("target_date") or date.today().isoformat()
            t_date = datetime.strptime(t_date_str, "%Y-%m-%d").date()
            bills = Bill.query.filter(
                func.date(Bill.created_at) == t_date,
                Bill.status != "VOIDED",
            ).all()

            payment_summary = {}
            for b in bills:
                method = (b.payment_method or "CASH").upper()
                if method not in payment_summary:
                    payment_summary[method] = {"count": 0, "amount": 0.0}
                payment_summary[method]["count"] += 1
                payment_summary[method]["amount"] += b.total_amount

            total_col = sum(data["amount"] for data in payment_summary.values())
            return {
                "date": t_date_str,
                "total_collection": round(total_col, 2),
                "total_bills": len(bills),
                "breakdown": {
                    k: {"count": v["count"], "amount": round(v["amount"], 2)}
                    for k, v in payment_summary.items()
                },
            }

        elif tool_name == "get_inventory_status":
            low_only = bool(args.get("low_stock_only", False))
            query = Inventory.query
            if low_only:
                query = query.filter(Inventory.stock <= Inventory.alert_threshold)
            items = query.limit(25).all()
            return {
                "count": len(items),
                "inventory": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "type": item.type,
                        "stock": item.stock,
                        "unit": item.unit,
                        "unit_price": item.unit_price,
                        "alert_threshold": item.alert_threshold,
                        "product_id": item.product_id,
                        "is_low_stock": item.stock <= item.alert_threshold,
                    }
                    for item in items
                ],
            }

        elif tool_name == "list_low_stock_items":
            limit = min(int(args.get("limit", 20)), 30)
            items = (
                Inventory.query.filter(Inventory.stock <= Inventory.alert_threshold)
                .order_by(Inventory.stock.asc())
                .limit(limit)
                .all()
            )
            return {
                "count": len(items),
                "low_stock_items": [
                    {
                        "id": item.id,
                        "name": item.name,
                        "stock": item.stock,
                        "alert_threshold": item.alert_threshold,
                        "unit": item.unit,
                        "unit_price": item.unit_price,
                    }
                    for item in items
                ],
            }

        elif tool_name == "get_stock_valuation":
            raw_items = Inventory.query.all()
            total_raw_valuation = sum((i.stock * (i.unit_price or 0.0)) for i in raw_items)
            prods = Product.query.filter_by(active=True).all()
            total_catalog_products = len(prods)
            return {
                "total_inventory_items": len(raw_items),
                "total_stock_cost_valuation": round(total_raw_valuation, 2),
                "total_active_products": total_catalog_products,
            }

        elif tool_name == "get_stock_consumption_rate":
            q = args.get("query", "").strip()
            days = min(int(args.get("days", 7)), 30)
            start_date = date.today() - timedelta(days=days)

            bills = Bill.query.filter(
                func.date(Bill.created_at) >= start_date,
                Bill.status != "VOIDED",
            ).all()

            product_qty_map = {}
            for b in bills:
                if not b.items:
                    continue
                try:
                    items = json.loads(b.items)
                    for it in items:
                        p_name = it.get("name") or it.get("product_id")
                        qty = float(it.get("quantity", 1))
                        product_qty_map[p_name] = product_qty_map.get(p_name, 0.0) + qty
                except Exception:
                    pass

            inv_query = Inventory.query
            if q:
                inv_query = inv_query.filter(Inventory.name.ilike(f"%{q}%"))
            inv_items = inv_query.limit(10).all()

            results = []
            for item in inv_items:
                sold_qty = product_qty_map.get(item.name, 0.0)
                daily_burn = sold_qty / days if days > 0 else 0.0
                days_left = round(item.stock / daily_burn, 1) if daily_burn > 0 else 999.0

                results.append(
                    {
                        "item_name": item.name,
                        "current_stock": item.stock,
                        "unit": item.unit,
                        "total_consumed_in_period": sold_qty,
                        "avg_daily_consumption": round(daily_burn, 2),
                        "projected_days_remaining": (
                            days_left if days_left < 999 else "Stable (Low Usage)"
                        ),
                        "restock_urgency": (
                            "High" if days_left <= 3 else "Medium" if days_left <= 7 else "Low"
                        ),
                    }
                )

            return {
                "period_days": days,
                "items_analyzed": len(results),
                "consumption_rates": results,
            }

        elif tool_name == "get_inventory_logs":
            limit = min(int(args.get("limit", 15)), 30)
            events = (
                AuditEvent.query.filter(
                    AuditEvent.action.in_(
                        [
                            "propose_adjust_stock",
                            "propose_bulk_stock_adjustment",
                            "inventory_update",
                        ]
                    )
                )
                .order_by(AuditEvent.created_at.desc())
                .limit(limit)
                .all()
            )
            return {
                "count": len(events),
                "logs": [
                    {
                        "timestamp": (
                            e.created_at.strftime("%Y-%m-%d %H:%M") if e.created_at else None
                        ),
                        "action": e.action,
                        "actor": e.actor_sub or "admin",
                        "meta": json.loads(e.meta_json) if e.meta_json else {},
                    }
                    for e in events
                ],
            }

        elif tool_name == "search_products":
            q = args.get("query", "").strip()
            active_only = bool(args.get("active_only", False))
            limit = min(int(args.get("limit", 20)), 30)
            query = Product.query
            if q:
                query = query.filter((Product.name.ilike(f"%{q}%")) | (Product.product_id == q))
            if active_only:
                query = query.filter(Product.active == True)
            prods = query.limit(limit).all()
            return {
                "count": len(prods),
                "products": [
                    {
                        "product_id": p.product_id,
                        "name": p.name,
                        "price": p.price,
                        "takeaway_price": p.takeaway_price,
                        "active": p.active,
                        "description": getattr(p, "description", None),
                        "category_name": p.category_rel.name if p.category_rel else p.category,
                        "category_id": p.category_id,
                    }
                    for p in prods
                ],
            }

        elif tool_name == "get_product_details":
            p_id = args.get("product_id", "").strip()
            p = Product.query.filter(
                (Product.product_id == p_id) | (Product.name.ilike(f"%{p_id}%"))
            ).first()
            if not p:
                return {"found": False, "message": f"Product '{p_id}' not found."}

            inv = Inventory.query.filter_by(product_id=p.product_id).first()
            return {
                "found": True,
                "product_id": p.product_id,
                "name": p.name,
                "price": p.price,
                "takeaway_price": p.takeaway_price,
                "active": p.active,
                "favorite": p.favorite,
                "description": getattr(p, "description", None),
                "category": {
                    "id": p.category_id,
                    "name": p.category_rel.name if p.category_rel else p.category,
                    "group": (
                        p.category_rel.group.name
                        if p.category_rel and p.category_rel.group
                        else None
                    ),
                },
                "variations": json.loads(p.variations) if p.variations else [],
                "linked_stock": inv.stock if inv else "Direct sale (No raw link)",
                "created_at": str(p.created_at),
            }

        elif tool_name == "get_categories_and_groups":
            groups = ItemGroup.query.filter(
                (ItemGroup.deleted_at == None) | (ItemGroup.deleted_at == "")
            ).all()
            cats = Category.query.all()
            return {
                "groups": [
                    {
                        "id": g.id,
                        "name": g.name,
                        "description": getattr(g, "description", None),
                        "is_active": g.is_active,
                        "display_order": g.display_order,
                        "categories": [
                            {
                                "id": c.id,
                                "name": c.name,
                                "description": getattr(c, "description", None),
                                "active": c.active,
                            }
                            for c in cats
                            if c.group_id == g.id
                        ],
                    }
                    for g in groups
                ],
                "ungrouped_categories": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "description": getattr(c, "description", None),
                        "active": c.active,
                    }
                    for c in cats
                    if not c.group_id
                ],
            }

        elif tool_name == "get_category_list":
            cats = Category.query.filter_by(active=True).all()
            return {
                "count": len(cats),
                "categories": [
                    {
                        "id": c.id,
                        "name": c.name,
                        "description": getattr(c, "description", None),
                        "group_id": c.group_id,
                    }
                    for c in cats
                ],
            }

        elif tool_name == "get_group_list":
            groups = ItemGroup.query.all()
            return {
                "count": len(groups),
                "groups": [
                    {
                        "id": g.id,
                        "name": g.name,
                        "description": getattr(g, "description", None),
                        "is_active": g.is_active,
                        "display_order": g.display_order,
                    }
                    for g in groups
                ],
            }

        elif tool_name == "list_workers":
            status = args.get("status", "active")
            role_filter = args.get("role")
            limit = min(int(args.get("limit", 20)), 30)

            query = Worker.query
            if status != "all":
                query = query.filter_by(status=status)
            if role_filter:
                query = query.filter(Worker.role.ilike(f"%{role_filter}%"))

            workers = query.limit(limit).all()
            return {
                "count": len(workers),
                "workers": [
                    {
                        "worker_id": w.worker_id,
                        "name": w.name,
                        "role": w.role or "Staff",
                        "description": getattr(w, "description", None),
                        "salary": w.salary,
                        "phone": w.phone,
                        "status": w.status,
                    }
                    for w in workers
                ],
            }

        elif tool_name == "get_worker_attendance":
            t_date = args.get("target_date") or date.today().isoformat()
            parsed_date = datetime.strptime(t_date, "%Y-%m-%d").date()
            records = Attendance.query.filter_by(date=parsed_date).all()
            active_workers = Worker.query.filter_by(status="active").all()
            rec_map = {r.worker_id: r.status for r in records}

            return {
                "date": t_date,
                "total_staff": len(active_workers),
                "marked_count": len(records),
                "attendance": [
                    {
                        "worker_id": w.worker_id,
                        "name": w.name,
                        "role": w.role,
                        "status": rec_map.get(w.worker_id, "Not Marked"),
                    }
                    for w in active_workers
                ],
            }

        elif tool_name == "get_attendance_summary":
            month = int(args.get("month") or datetime.now().month)
            year = int(args.get("year") or datetime.now().year)

            start_dt = date(year, month, 1)
            next_m = month + 1 if month < 12 else 1
            next_y = year if month < 12 else year + 1
            end_dt = date(next_y, next_m, 1)

            workers = Worker.query.filter_by(status="active").all()
            summary = []
            for w in workers:
                atts = Attendance.query.filter(
                    Attendance.worker_id == w.worker_id,
                    Attendance.date >= start_dt,
                    Attendance.date < end_dt,
                ).all()
                present = sum(1 for a in atts if a.status == "Present")
                absent = sum(1 for a in atts if a.status == "Absent")
                half_day = sum(1 for a in atts if a.status == "Half-day")
                summary.append(
                    {
                        "worker_id": w.worker_id,
                        "name": w.name,
                        "role": w.role,
                        "present_days": present,
                        "absent_days": absent,
                        "half_days": half_day,
                    }
                )
            return {"month": month, "year": year, "staff_summary": summary}

        elif tool_name == "get_pending_payroll":
            month = int(args.get("month") or datetime.now().month)
            year = int(args.get("year") or datetime.now().year)

            workers = Worker.query.filter_by(status="active").all()
            payroll = []
            for w in workers:
                advs = Advance.query.filter_by(worker_id=w.worker_id).all()
                adv_sum = sum(a.amount for a in advs)
                payroll.append(
                    {
                        "worker_id": w.worker_id,
                        "name": w.name,
                        "role": w.role,
                        "base_salary": w.salary,
                        "unpaid_advances": adv_sum,
                        "estimated_net_payable": max(0.0, (w.salary or 0.0) - adv_sum),
                    }
                )
            return {"month": month, "year": year, "payroll_estimates": payroll}

        elif tool_name == "calculate_worker_salary":
            w_id = args.get("worker_id")
            month = int(args.get("month") or datetime.now().month)
            year = int(args.get("year") or datetime.now().year)

            w = Worker.query.get(w_id)
            if not w:
                return {"error": f"Worker {w_id} not found"}

            base_salary = float(w.salary or 0.0)
            advs = Advance.query.filter_by(worker_id=w_id).all()
            total_advances = sum(a.amount for a in advs)
            estimated_payable = max(0.0, base_salary - total_advances)

            return {
                "worker_id": w.worker_id,
                "name": w.name,
                "role": w.role,
                "month": month,
                "year": year,
                "base_salary": base_salary,
                "unpaid_advances": total_advances,
                "estimated_payable": estimated_payable,
                "disbursement_note": "Final salary disbursement happens in Workers > Salary Manager.",
            }

        elif tool_name == "get_worker_advances":
            w_id = args.get("worker_id")
            w = Worker.query.get(w_id)
            if not w:
                return {"error": f"Worker {w_id} not found"}

            advs = Advance.query.filter_by(worker_id=w_id).order_by(Advance.date.desc()).all()
            total_adv = sum(a.amount for a in advs)
            return {
                "worker_id": w.worker_id,
                "name": w.name,
                "total_unpaid_advances": total_adv,
                "advances": [
                    {
                        "advance_id": a.advance_id,
                        "amount": a.amount,
                        "reason": a.reason,
                        "date": str(a.date),
                    }
                    for a in advs
                ],
            }

        elif tool_name == "list_worker_roles":
            roles = WorkerType.query.filter_by(is_active=True).all()
            role_counts = (
                db.session.query(Worker.role, func.count(Worker.worker_id))
                .filter_by(status="active")
                .group_by(Worker.role)
                .all()
            )
            count_map = {r[0]: r[1] for r in role_counts if r[0]}

            return {
                "count": len(roles),
                "roles": [
                    {
                        "id": r.id,
                        "name": r.name,
                        "description": r.description,
                        "active_staff_count": count_map.get(r.name, 0),
                    }
                    for r in roles
                ],
            }

        elif tool_name == "list_expense_types":
            types = ExpenseType.query.filter_by(is_active=True).all()
            return {
                "count": len(types),
                "expense_types": [
                    {"id": t.id, "name": t.name, "description": t.description} for t in types
                ],
            }

        elif tool_name == "list_recent_expenses":
            limit = min(int(args.get("limit", 15)), 25)
            cat = args.get("category")
            query = Expense.query
            if cat:
                query = query.filter(Expense.category.ilike(f"%{cat}%"))
            expenses = query.order_by(Expense.date.desc()).limit(limit).all()
            return {
                "count": len(expenses),
                "expenses": [
                    {
                        "id": e.id,
                        "title": e.title,
                        "category": e.category,
                        "amount": e.amount,
                        "payment_method": e.payment_method,
                        "date": e.date.strftime("%Y-%m-%d %H:%M") if e.date else None,
                        "notes": e.notes,
                    }
                    for e in expenses
                ],
            }

        elif tool_name == "get_expense_by_id":
            e_id = args.get("expense_id")
            exp = Expense.query.get(e_id)
            if not exp:
                return {"found": False, "message": f"Expense #{e_id} not found."}
            return {"found": True, "expense": exp.to_dict()}

        elif tool_name == "get_expense_category_breakdown":
            period = args.get("period", "this_month")
            query = Expense.query
            if period == "today":
                query = query.filter(func.date(Expense.date) == date.today())
            elif period == "this_month":
                query = query.filter(
                    func.extract("month", Expense.date) == datetime.now().month,
                    func.extract("year", Expense.date) == datetime.now().year,
                )

            breakdown = (
                db.session.query(Expense.category, func.sum(Expense.amount), func.count(Expense.id))
                .group_by(Expense.category)
                .order_by(desc(func.sum(Expense.amount)))
                .all()
            )
            total_spend = sum(row[1] for row in breakdown) if breakdown else 0.0

            return {
                "period": period,
                "total_expense_amount": round(total_spend, 2),
                "categories": [
                    {"category": row[0], "total_amount": round(row[1], 2), "count": row[2]}
                    for row in breakdown
                ],
            }

        elif tool_name == "get_recurring_expense_forecast":
            # Estimate monthly burn rate based on recent utility and fixed expenses
            past_30 = datetime.now() - timedelta(days=30)
            recurring_cats = [
                "Rent",
                "Utilities",
                "Electricity",
                "Internet",
                "Maintenance",
                "Salary",
            ]
            fixed_spend = (
                db.session.query(Expense.category, func.sum(Expense.amount))
                .filter(Expense.date >= past_30, Expense.category.in_(recurring_cats))
                .group_by(Expense.category)
                .all()
            )
            active_workers = Worker.query.filter_by(status="active").all()
            monthly_payroll = sum((w.salary or 0.0) for w in active_workers)

            fixed_map = {row[0]: round(row[1], 2) for row in fixed_spend}
            fixed_map["Staff Salaries (Projected)"] = monthly_payroll
            total_fixed = sum(fixed_map.values())

            return {
                "projected_monthly_fixed_costs": round(total_fixed, 2),
                "breakdown": fixed_map,
            }

        elif tool_name == "get_sales_kpi_summary":
            import calendar

            period = args.get("period", "today")
            today = date.today()

            if period == "yesterday":
                target_date = today - timedelta(days=1)
                summary = DailySalesSummary.query.filter_by(date=target_date).first()
                if summary:
                    return {
                        "period": period,
                        "date": str(summary.date),
                        "total_sales": summary.total_sales,
                        "total_orders": summary.total_orders,
                        "total_expenses": summary.total_expenses,
                        "net_profit": summary.net_profit,
                        "average_bill_value": summary.average_bill_value,
                    }
                bills = Bill.query.filter(func.date(Bill.created_at) == target_date).all()
                tot_sales = sum(b.total_amount for b in bills)
                tot_orders = len(bills)
                exps = Expense.query.filter(func.date(Expense.date) == target_date).all()
                tot_exp = sum(e.amount for e in exps)
                net_prof = tot_sales - tot_exp
                avg_bill = (tot_sales / tot_orders) if tot_orders > 0 else 0.0
                return {
                    "period": period,
                    "date": str(target_date),
                    "total_sales": round(tot_sales, 2),
                    "total_orders": tot_orders,
                    "total_expenses": round(tot_exp, 2),
                    "net_profit": round(net_prof, 2),
                    "average_bill_value": round(avg_bill, 2),
                }

            elif period == "today":
                summary = DailySalesSummary.query.filter_by(date=today).first()
                if summary:
                    return {
                        "period": period,
                        "date": str(summary.date),
                        "total_sales": summary.total_sales,
                        "total_orders": summary.total_orders,
                        "total_expenses": summary.total_expenses,
                        "net_profit": summary.net_profit,
                        "average_bill_value": summary.average_bill_value,
                    }
                bills = Bill.query.filter(func.date(Bill.created_at) == today).all()
                tot_sales = sum(b.total_amount for b in bills)
                tot_orders = len(bills)
                exps = Expense.query.filter(func.date(Expense.date) == today).all()
                tot_exp = sum(e.amount for e in exps)
                net_prof = tot_sales - tot_exp
                avg_bill = (tot_sales / tot_orders) if tot_orders > 0 else 0.0
                return {
                    "period": period,
                    "date": str(today),
                    "total_sales": round(tot_sales, 2),
                    "total_orders": tot_orders,
                    "total_expenses": round(tot_exp, 2),
                    "net_profit": round(net_prof, 2),
                    "average_bill_value": round(avg_bill, 2),
                }

            # Range-based periods:
            start_date = None
            end_date = today

            if period == "last_7_days":
                start_date = today - timedelta(days=6)
            elif period == "last_30_days":
                start_date = today - timedelta(days=29)
            elif period == "this_month":
                start_date = date(today.year, today.month, 1)
            elif period == "last_month":
                if today.month == 1:
                    lm_year = today.year - 1
                    lm_month = 12
                else:
                    lm_year = today.year
                    lm_month = today.month - 1
                start_date = date(lm_year, lm_month, 1)
                last_day = calendar.monthrange(lm_year, lm_month)[1]
                end_date = date(lm_year, lm_month, last_day)
            elif period == "this_year":
                start_date = date(today.year, 1, 1)
            elif period == "all":
                start_date = None
                end_date = None

            query = DailySalesSummary.query
            if start_date:
                query = query.filter(DailySalesSummary.date >= start_date)
            if end_date:
                query = query.filter(DailySalesSummary.date <= end_date)
            summaries = query.all()

            if summaries:
                tot_sales = sum(s.total_sales for s in summaries)
                tot_orders = sum(s.total_orders for s in summaries)
                tot_exp = sum(s.total_expenses for s in summaries)
                net_prof = tot_sales - tot_exp
                avg_bill = (tot_sales / tot_orders) if tot_orders > 0 else 0.0
                return {
                    "period": period,
                    "start_date": str(start_date) if start_date else "all_time",
                    "end_date": str(end_date) if end_date else str(today),
                    "total_sales": round(tot_sales, 2),
                    "total_orders": tot_orders,
                    "total_expenses": round(tot_exp, 2),
                    "net_profit": round(net_prof, 2),
                    "average_bill_value": round(avg_bill, 2),
                }

            # Fallback to direct Bill and Expense records if no DailySalesSummary exists
            bill_q = Bill.query
            exp_q = Expense.query
            if start_date:
                bill_q = bill_q.filter(func.date(Bill.created_at) >= start_date)
                exp_q = exp_q.filter(func.date(Expense.date) >= start_date)
            if end_date:
                bill_q = bill_q.filter(func.date(Bill.created_at) <= end_date)
                exp_q = exp_q.filter(func.date(Expense.date) <= end_date)

            bills = bill_q.all()
            tot_sales = sum(b.total_amount for b in bills)
            tot_orders = len(bills)
            exps = exp_q.all()
            tot_exp = sum(e.amount for e in exps)
            net_prof = tot_sales - tot_exp
            avg_bill = (tot_sales / tot_orders) if tot_orders > 0 else 0.0

            return {
                "period": period,
                "start_date": str(start_date) if start_date else "all_time",
                "end_date": str(end_date) if end_date else str(today),
                "total_sales": round(tot_sales, 2),
                "total_orders": tot_orders,
                "total_expenses": round(tot_exp, 2),
                "net_profit": round(net_prof, 2),
                "average_bill_value": round(avg_bill, 2),
            }

        elif tool_name == "get_sales_trend":
            days = min(int(args.get("days", 7)), 14)
            today = date.today()
            start_date = today - timedelta(days=days - 1)

            trend_records = (
                DailySalesSummary.query.filter(DailySalesSummary.date >= start_date)
                .order_by(DailySalesSummary.date.asc())
                .all()
            )
            return {
                "days": days,
                "trend": [
                    {
                        "date": str(r.date),
                        "sales": r.total_sales,
                        "orders": r.total_orders,
                        "net_profit": r.net_profit,
                    }
                    for r in trend_records
                ],
            }

        elif tool_name == "get_hourly_footfall":
            t_date_str = args.get("target_date") or date.today().isoformat()
            t_date = datetime.strptime(t_date_str, "%Y-%m-%d").date()

            bills = Bill.query.filter(func.date(Bill.created_at) == t_date).all()
            hourly_counts = {h: {"orders": 0, "revenue": 0.0} for h in range(24)}
            for b in bills:
                if b.created_at:
                    h = b.created_at.hour
                    hourly_counts[h]["orders"] += 1
                    hourly_counts[h]["revenue"] += b.total_amount

            active_hours = [
                {
                    "hour": f"{h:02d}:00",
                    "orders": data["orders"],
                    "revenue": round(data["revenue"], 2),
                }
                for h, data in hourly_counts.items()
                if data["orders"] > 0
            ]
            return {"date": t_date_str, "hourly_distribution": active_hours}

        elif tool_name == "get_top_selling_products":
            limit = min(int(args.get("limit", 10)), 15)
            latest = DailySalesSummary.query.order_by(DailySalesSummary.date.desc()).first()
            if latest and latest.top_products_json:
                try:
                    return {"top_products": json.loads(latest.top_products_json)[:limit]}
                except Exception:
                    pass
            prods = Product.query.filter_by(active=True).limit(limit).all()
            return {
                "top_products": [
                    {
                        "product_id": p.product_id,
                        "name": p.name,
                        "price": p.price,
                        "estimated_volume": 12,
                    }
                    for p in prods
                ]
            }

        elif tool_name == "get_payment_mode_breakdown":
            today = date.today()
            bills = Bill.query.filter(
                func.date(Bill.created_at) == today,
                Bill.status.notin_(["VOIDED", "CANCELLED"]),
            ).all()
            breakdown = {}
            for b in bills:
                mode = (b.payment_method or "CASH").upper()
                breakdown[mode] = breakdown.get(mode, 0.0) + b.total_amount

            return {
                "date": today.isoformat(),
                "payment_modes": {k: round(v, 2) for k, v in breakdown.items()},
            }

        elif tool_name == "get_category_sales_breakdown":
            period = args.get("period", "this_month")
            start_date = date.today() - timedelta(days=30)
            if period == "today":
                start_date = date.today()

            bills = Bill.query.filter(
                func.date(Bill.created_at) >= start_date,
                Bill.status.notin_(["VOIDED", "CANCELLED"]),
            ).all()

            cat_sales = {}
            total_rev = 0.0
            for b in bills:
                if not b.items:
                    continue
                try:
                    items = json.loads(b.items)
                    for it in items:
                        p_id = it.get("product_id")
                        line_tot = float(it.get("price", 0)) * float(it.get("quantity", 1))
                        prod = Product.query.get(p_id) if p_id else None
                        c_name = (
                            prod.category_rel.name
                            if prod and prod.category_rel
                            else (prod.category if prod else "General")
                        )
                        cat_sales[c_name] = cat_sales.get(c_name, 0.0) + line_tot
                        total_rev += line_tot
                except Exception:
                    pass

            return {
                "period": period,
                "total_sales_analyzed": round(total_rev, 2),
                "category_breakdown": [
                    {
                        "category": c,
                        "revenue": round(rev, 2),
                        "percentage_share": (
                            round((rev / total_rev * 100), 1) if total_rev > 0 else 0.0
                        ),
                    }
                    for c, rev in sorted(cat_sales.items(), key=lambda x: x[1], reverse=True)
                ],
            }

        elif tool_name == "get_order_type_breakdown":
            period = args.get("period", "this_month")
            start_date = date.today() - timedelta(days=30)
            if period == "today":
                start_date = date.today()

            bills = Bill.query.filter(
                func.date(Bill.created_at) >= start_date,
                Bill.status.notin_(["VOIDED", "CANCELLED"]),
            ).all()

            order_types = {}
            for b in bills:
                otype = (b.order_type or "dine-in").lower()
                if otype not in order_types:
                    order_types[otype] = {"count": 0, "revenue": 0.0}
                order_types[otype]["count"] += 1
                order_types[otype]["revenue"] += b.total_amount

            total_orders = len(bills)
            return {
                "period": period,
                "total_orders": total_orders,
                "order_types": [
                    {
                        "type": k.capitalize(),
                        "orders": v["count"],
                        "revenue": round(v["revenue"], 2),
                        "average_ticket": (
                            round(v["revenue"] / v["count"], 2) if v["count"] > 0 else 0.0
                        ),
                        "order_share_pct": (
                            round((v["count"] / total_orders * 100), 1) if total_orders > 0 else 0.0
                        ),
                    }
                    for k, v in order_types.items()
                ],
            }

        elif tool_name == "get_peak_days_analysis":
            days = min(int(args.get("days", 30)), 90)
            start_date = date.today() - timedelta(days=days)
            summaries = DailySalesSummary.query.filter(DailySalesSummary.date >= start_date).all()

            day_names = [
                "Monday",
                "Tuesday",
                "Wednesday",
                "Thursday",
                "Friday",
                "Saturday",
                "Sunday",
            ]
            day_stats = {d: {"total_sales": 0.0, "total_orders": 0, "count": 0} for d in day_names}

            for s in summaries:
                d_name = s.date.strftime("%A")
                if d_name in day_stats:
                    day_stats[d_name]["total_sales"] += s.total_sales
                    day_stats[d_name]["total_orders"] += s.total_orders
                    day_stats[d_name]["count"] += 1

            ranked = []
            for d in day_names:
                cnt = day_stats[d]["count"]
                avg_sales = (day_stats[d]["total_sales"] / cnt) if cnt > 0 else 0.0
                avg_orders = (day_stats[d]["total_orders"] / cnt) if cnt > 0 else 0.0
                ranked.append(
                    {
                        "day": d,
                        "avg_daily_sales": round(avg_sales, 2),
                        "avg_orders": round(avg_orders, 1),
                    }
                )

            ranked.sort(key=lambda x: x["avg_daily_sales"], reverse=True)
            return {"analyzed_days": days, "day_of_week_ranking": ranked}

        elif tool_name == "get_dead_stock_report":
            threshold_days = int(args.get("days_threshold", 14))
            cutoff = datetime.now() - timedelta(days=threshold_days)

            # Get products sold recently
            recent_bills = Bill.query.filter(
                Bill.created_at >= cutoff, Bill.status != "VOIDED"
            ).all()
            sold_product_ids = set()
            for b in recent_bills:
                if b.items:
                    try:
                        for it in json.loads(b.items):
                            sold_product_ids.add(it.get("product_id"))
                    except Exception:
                        pass

            active_prods = Product.query.filter_by(active=True).all()
            dead_items = []
            for p in active_prods:
                if p.product_id not in sold_product_ids:
                    dead_items.append(
                        {
                            "product_id": p.product_id,
                            "name": p.name,
                            "price": p.price,
                            "category": p.category_rel.name if p.category_rel else p.category,
                            "days_without_sales": f">{threshold_days} days",
                        }
                    )

            return {
                "inactivity_threshold_days": threshold_days,
                "dead_products_count": len(dead_items),
                "dead_products": dead_items[:15],
            }

        elif tool_name == "get_profit_margin_analysis":
            period = args.get("period", "this_month")
            start_date = date.today().replace(day=1) if period == "this_month" else date.today()
            summaries = DailySalesSummary.query.filter(DailySalesSummary.date >= start_date).all()

            tot_sales = sum(s.total_sales for s in summaries)
            tot_exp = sum(s.total_expenses for s in summaries)
            net_prof = tot_sales - tot_exp
            margin_pct = (net_prof / tot_sales * 100) if tot_sales > 0 else 0.0

            return {
                "period": period,
                "gross_revenue": round(tot_sales, 2),
                "total_expenses": round(tot_exp, 2),
                "net_profit": round(net_prof, 2),
                "net_profit_margin_pct": round(margin_pct, 2),
                "expense_ratio_pct": (
                    round((tot_exp / tot_sales * 100), 2) if tot_sales > 0 else 0.0
                ),
            }

        elif tool_name in ("list_reminders", "get_pending_reminders"):
            status = args.get("status", "pending")
            limit = min(int(args.get("limit", 20)), 30)
            query = Reminder.query
            if status != "all":
                query = query.filter_by(status=status)
            rems = query.order_by(Reminder.reminder_time.asc()).limit(limit).all()
            return {
                "count": len(rems),
                "reminders": [r.to_dict() for r in rems],
            }

        elif tool_name == "get_unread_notification_count":
            unread = Notification.query.filter(Notification.read_at == None).count()
            pending_rem = Reminder.query.filter_by(status="pending").count()
            low_stock = Inventory.query.filter(Inventory.stock <= Inventory.alert_threshold).count()
            return {
                "unread_notifications": unread,
                "pending_reminders": pending_rem,
                "low_stock_alerts": low_stock,
            }

        elif tool_name == "list_notifications":
            status = args.get("status", "unread")
            limit = min(int(args.get("limit", 20)), 30)
            query = Notification.query
            if status == "unread":
                query = query.filter(Notification.read_at == None)
            elif status == "read":
                query = query.filter(Notification.read_at != None)
            notifs = query.order_by(Notification.created_at.desc()).limit(limit).all()
            return {
                "count": len(notifs),
                "notifications": [n.to_dict() for n in notifs],
            }


        # -------------------------------------------------------------------------
        # SALES PREDICTION TOOLS (WARMP pipeline)
        # -------------------------------------------------------------------------

        elif tool_name == "get_sales_history_for_prediction":
            trailing_days = min(int(args.get("trailing_days", 90)), 365)
            trailing_days = max(trailing_days, 1)
            group_by = args.get("group_by", "day")
            include_top_products = bool(args.get("include_top_products", False))

            start_date = date.today() - timedelta(days=trailing_days - 1)

            # Prefer DailySalesSummary for speed; fall back to Bill aggregation
            summaries = (
                DailySalesSummary.query.filter(DailySalesSummary.date >= start_date)
                .order_by(DailySalesSummary.date.asc())
                .all()
            )

            # Build raw daily rows (prefer summary, fill gaps from Bills)
            daily_rows = []
            summary_dates = {s.date for s in summaries}
            for s in summaries:
                daily_rows.append(
                    {
                        "date": str(s.date),
                        "weekday": s.date.strftime("%A"),
                        "weekday_num": s.date.weekday(),
                        "total_sales": float(s.total_sales or 0),
                        "total_orders": int(s.total_orders or 0),
                        "average_bill_value": float(s.average_bill_value or 0),
                        "net_profit": float(s.net_profit or 0),
                        "source": "summary",
                    }
                )

            # Fill missing dates from Bill table
            cursor = start_date
            while cursor <= date.today():
                if cursor not in summary_dates:
                    day_bills = Bill.query.filter(
                        func.date(Bill.created_at) == cursor
                    ).all()
                    tot = sum(b.total_amount for b in day_bills)
                    cnt = len(day_bills)
                    daily_rows.append(
                        {
                            "date": str(cursor),
                            "weekday": cursor.strftime("%A"),
                            "weekday_num": cursor.weekday(),
                            "total_sales": round(float(tot), 2),
                            "total_orders": cnt,
                            "average_bill_value": round(float(tot / cnt) if cnt else 0, 2),
                            "net_profit": 0.0,
                            "source": "bills",
                        }
                    )
                cursor += timedelta(days=1)

            daily_rows.sort(key=lambda r: r["date"])

            # Aggregate by requested granularity
            if group_by == "weekday":
                from collections import defaultdict

                agg: Dict[str, List] = defaultdict(list)
                for r in daily_rows:
                    agg[r["weekday"]].append(r)
                weekday_order = [
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                    "Sunday",
                ]
                aggregated = []
                all_avg = (
                    sum(r["total_sales"] for r in daily_rows) / len(daily_rows)
                    if daily_rows
                    else 1.0
                )
                for wd in weekday_order:
                    rows = agg.get(wd, [])
                    if not rows:
                        continue
                    avg_sales = sum(r["total_sales"] for r in rows) / len(rows)
                    avg_orders = sum(r["total_orders"] for r in rows) / len(rows)
                    aggregated.append(
                        {
                            "weekday": wd,
                            "data_points": len(rows),
                            "avg_daily_sales": round(avg_sales, 2),
                            "avg_daily_orders": round(avg_orders, 1),
                            "dow_weight": round(avg_sales / all_avg, 4) if all_avg else 1.0,
                        }
                    )
                result_data = {"group_by": "weekday", "weekday_averages": aggregated}
            elif group_by == "week":
                from collections import defaultdict

                agg_w: Dict[str, List] = defaultdict(list)
                for r in daily_rows:
                    d_obj = date.fromisoformat(r["date"])
                    week_key = f"{d_obj.isocalendar()[0]}-W{d_obj.isocalendar()[1]:02d}"
                    agg_w[week_key].append(r)
                weeks = []
                for wk, rows in sorted(agg_w.items()):
                    weeks.append(
                        {
                            "week": wk,
                            "total_sales": round(sum(r["total_sales"] for r in rows), 2),
                            "total_orders": sum(r["total_orders"] for r in rows),
                            "days": len(rows),
                        }
                    )
                result_data = {"group_by": "week", "weeks": weeks}
            elif group_by == "month":
                from collections import defaultdict

                agg_m: Dict[str, List] = defaultdict(list)
                for r in daily_rows:
                    month_key = r["date"][:7]
                    agg_m[month_key].append(r)
                months = []
                for mk, rows in sorted(agg_m.items()):
                    months.append(
                        {
                            "month": mk,
                            "total_sales": round(sum(r["total_sales"] for r in rows), 2),
                            "total_orders": sum(r["total_orders"] for r in rows),
                            "days": len(rows),
                        }
                    )
                result_data = {"group_by": "month", "months": months}
            else:
                result_data = {"group_by": "day", "daily_rows": daily_rows}

            result_data["trailing_days"] = trailing_days
            result_data["data_points"] = len(daily_rows)
            result_data["overall_avg_daily_sales"] = (
                round(sum(r["total_sales"] for r in daily_rows) / len(daily_rows), 2)
                if daily_rows
                else 0
            )
            result_data["confidence_note"] = (
                "HIGH — 90+ days of data"
                if len(daily_rows) >= 90
                else "MEDIUM — 14-89 days of data"
                if len(daily_rows) >= 14
                else "LOW — less than 14 days of data. Predictions will have wide uncertainty."
            )

            if include_top_products:
                # Aggregate top products from recent Bill line items
                from collections import defaultdict

                prod_totals: Dict[str, Dict] = defaultdict(
                    lambda: {"name": "", "qty": 0, "revenue": 0.0}
                )
                recent_bills = Bill.query.filter(
                    func.date(Bill.created_at) >= start_date
                ).all()
                for b in recent_bills:
                    try:
                        items = json.loads(b.items) if b.items else []
                        for it in items:
                            pid = str(it.get("product_id", it.get("name", "?")))
                            prod_totals[pid]["name"] = it.get("name", pid)
                            prod_totals[pid]["qty"] += float(it.get("quantity", 1))
                            prod_totals[pid]["revenue"] += float(
                                it.get("price", 0)
                            ) * float(it.get("quantity", 1))
                    except Exception:
                        pass
                total_rev = sum(v["revenue"] for v in prod_totals.values()) or 1.0
                top_prods = sorted(
                    prod_totals.items(), key=lambda x: x[1]["revenue"], reverse=True
                )[:10]
                result_data["top_products"] = [
                    {
                        "product_id": k,
                        "name": v["name"],
                        "total_qty": round(v["qty"], 1),
                        "total_revenue": round(v["revenue"], 2),
                        "revenue_share_pct": round(v["revenue"] / total_rev * 100, 2),
                    }
                    for k, v in top_prods
                ]

            return result_data

        elif tool_name == "get_top_products_for_prediction":
            import json as _json
            from collections import defaultdict

            top_n = min(int(args.get("top_n", 15)), 30)
            trailing_days = min(int(args.get("trailing_days", 60)), 365)
            group_by_time_slot = bool(args.get("group_by_time_slot", False))

            start_date = date.today() - timedelta(days=trailing_days - 1)
            recent_bills = Bill.query.filter(
                func.date(Bill.created_at) >= start_date
            ).all()

            prod_data: Dict[str, Dict] = defaultdict(
                lambda: {
                    "name": "",
                    "qty": 0.0,
                    "revenue": 0.0,
                    "morning": 0.0,
                    "lunch": 0.0,
                    "evening": 0.0,
                    "night": 0.0,
                }
            )
            for b in recent_bills:
                hour = b.created_at.hour if b.created_at else 12
                if 6 <= hour < 11:
                    slot = "morning"
                elif 11 <= hour < 16:
                    slot = "lunch"
                elif 16 <= hour < 20:
                    slot = "evening"
                else:
                    slot = "night"
                try:
                    items = _json.loads(b.items) if b.items else []
                    for it in items:
                        pid = str(it.get("product_id", it.get("name", "?")))
                        prod_data[pid]["name"] = it.get("name", pid)
                        qty = float(it.get("quantity", 1))
                        price = float(it.get("price", 0))
                        prod_data[pid]["qty"] += qty
                        prod_data[pid]["revenue"] += qty * price
                        prod_data[pid][slot] += qty * price
                except Exception:
                    pass

            total_rev = sum(v["revenue"] for v in prod_data.values()) or 1.0
            sorted_prods = sorted(
                prod_data.items(), key=lambda x: x[1]["revenue"], reverse=True
            )[:top_n]

            products_out = []
            for pid, v in sorted_prods:
                entry = {
                    "product_id": pid,
                    "name": v["name"],
                    "total_qty": round(v["qty"], 1),
                    "total_revenue": round(v["revenue"], 2),
                    "revenue_share_pct": round(v["revenue"] / total_rev * 100, 2),
                    "avg_daily_qty": round(v["qty"] / trailing_days, 2),
                }
                if group_by_time_slot:
                    slot_total = (
                        v["morning"] + v["lunch"] + v["evening"] + v["night"]
                    ) or 1.0
                    entry["time_slot_split"] = {
                        "morning_pct": round(v["morning"] / slot_total * 100, 1),
                        "lunch_pct": round(v["lunch"] / slot_total * 100, 1),
                        "evening_pct": round(v["evening"] / slot_total * 100, 1),
                        "night_pct": round(v["night"] / slot_total * 100, 1),
                    }
                products_out.append(entry)

            return {
                "top_n": top_n,
                "trailing_days": trailing_days,
                "total_products_analysed": len(prod_data),
                "products": products_out,
            }

        elif tool_name == "get_regional_festivals_and_holidays":
            import os
            import re
            import ssl
            import json as _json
            import urllib.request
            import urllib.parse
            from datetime import date as _date, timedelta as _td

            from_date_str = args.get(
                "from_date", str(date.today() + timedelta(days=1))
            )
            to_date_str = args.get(
                "to_date", str(date.today() + timedelta(days=14))
            )
            include_regional = bool(args.get("include_regional", True))
            include_national = bool(args.get("include_national", True))
            include_dry_days = bool(args.get("include_dry_days", True))

            try:
                from_dt = _date.fromisoformat(from_date_str)
                to_dt = _date.fromisoformat(to_date_str)
            except ValueError:
                return {"error": "Invalid date format. Use YYYY-MM-DD."}

            # -------------------------------------------------------------
            # GLOBAL & REGIONAL RESOLUTION: country, state, city, pincode
            # -------------------------------------------------------------
            raw_country = args.get("country") or args.get("shop_country") or ""
            raw_state = args.get("state") or args.get("shop_state") or ""
            raw_city = args.get("city") or args.get("shop_city") or ""
            raw_pincode = args.get("pincode") or ""

            profile = None
            try:
                from services.profile_service import ProfileService

                profile = ProfileService.get_profile()
                if profile:
                    if not raw_country:
                        raw_country = profile.get("country") or ""
                    if not raw_state:
                        raw_state = profile.get("state") or ""
                    if not raw_city:
                        raw_city = profile.get("city") or ""
                    if not raw_pincode:
                        raw_pincode = profile.get("pincode") or ""
            except Exception as _pe:
                _log.warning("Could not read profile for regional holidays: %s", _pe)

            # Global Country & ISO Deduction
            def _resolve_country_and_iso(country_in: str, state_in: str, city_in: str, prof: dict = None) -> tuple:
                c = (country_in or "").strip().lower()
                s = (state_in or "").strip().lower()
                cty = (city_in or "").strip().lower()

                COUNTRY_MAP = {
                    "us": ("United States", "US"), "usa": ("United States", "US"), "united states": ("United States", "US"), "united states of america": ("United States", "US"), "america": ("United States", "US"),
                    "uk": ("United Kingdom", "GB"), "gb": ("United Kingdom", "GB"), "united kingdom": ("United Kingdom", "GB"), "great britain": ("United Kingdom", "GB"), "england": ("United Kingdom", "GB"), "scotland": ("United Kingdom", "GB"), "wales": ("United Kingdom", "GB"),
                    "ca": ("Canada", "CA"), "canada": ("Canada", "CA"),
                    "au": ("Australia", "AU"), "australia": ("Australia", "AU"),
                    "sg": ("Singapore", "SG"), "singapore": ("Singapore", "SG"),
                    "ae": ("United Arab Emirates", "AE"), "uae": ("United Arab Emirates", "AE"), "united arab emirates": ("United Arab Emirates", "AE"), "dubai": ("United Arab Emirates", "AE"), "abu dhabi": ("United Arab Emirates", "AE"),
                    "de": ("Germany", "DE"), "germany": ("Germany", "DE"), "deutschland": ("Germany", "DE"),
                    "fr": ("France", "FR"), "france": ("France", "FR"),
                    "jp": ("Japan", "JP"), "japan": ("Japan", "JP"),
                    "nz": ("New Zealand", "NZ"), "new zealand": ("New Zealand", "NZ"),
                    "in": ("India", "IN"), "india": ("India", "IN"), "bharat": ("India", "IN"),
                }

                if c in COUNTRY_MAP:
                    return COUNTRY_MAP[c]

                US_STATES = {"california", "texas", "florida", "new york", "illinois", "pennsylvania", "ohio", "georgia", "north carolina", "michigan", "washington", "massachusetts", "arizona", "colorado", "nevada"}
                if s in US_STATES or cty in {"new york", "los angeles", "chicago", "houston", "miami", "san francisco", "seattle", "boston", "dallas"}:
                    return ("United States", "US")

                UK_CITIES = {"london", "manchester", "birmingham", "leeds", "glasgow", "edinburgh", "liverpool"}
                if cty in UK_CITIES:
                    return ("United Kingdom", "GB")

                CA_PROVINCES = {"ontario", "quebec", "british columbia", "alberta", "toronto", "montreal", "vancouver"}
                if s in CA_PROVINCES or cty in CA_PROVINCES:
                    return ("Canada", "CA")

                AU_STATES = {"nsw", "new south wales", "victoria", "queensland", "sydney", "melbourne", "brisbane", "perth"}
                if s in AU_STATES or cty in AU_STATES:
                    return ("Australia", "AU")

                AE_PLACES = {"dubai", "abu dhabi", "sharjah", "ajman"}
                if s in AE_PLACES or cty in AE_PLACES:
                    return ("United Arab Emirates", "AE")

                if len(c) == 2:
                    return (c.upper(), c.upper())

                if prof:
                    cur_code = str(prof.get("currency_code") or "").strip().upper()
                    cur_sym = str(prof.get("currency_symbol") or "").strip()
                    if cur_sym == "₹" or cur_code == "INR":
                        return ("India", "IN")
                    if cur_code == "USD":
                        return ("United States", "US")
                    if cur_code in ("GBP", "GB") or cur_sym == "£":
                        return ("United Kingdom", "GB")
                    if cur_code in ("EUR", "DE") or cur_sym == "€":
                        return ("Germany", "DE")
                    if cur_code == "AED":
                        return ("United Arab Emirates", "AE")
                    if cur_code == "CAD":
                        return ("Canada", "CA")
                    if cur_code == "AUD":
                        return ("Australia", "AU")
                    if cur_code == "SGD":
                        return ("Singapore", "SG")
                    if cur_code in ("JPY", "JP") or cur_sym == "¥":
                        return ("Japan", "JP")

                return ("India", "IN")

            shop_country, shop_country_code = _resolve_country_and_iso(raw_country, raw_state, raw_city, profile)

            # Indian State Normalization & Automatic Postal Deduction
            def _normalize_indian_state(s_in: str, c_in: str, p_in: str) -> str:
                s = (s_in or "").strip().lower()
                c = (c_in or "").strip().lower()
                p = str(p_in or "").strip()

                state_aliases = {
                    "mh": "Maharashtra", "maharashtra": "Maharashtra", "maharastra": "Maharashtra", "mumbai": "Maharashtra", "pune": "Maharashtra", "nagpur": "Maharashtra", "thane": "Maharashtra", "nashik": "Maharashtra",
                    "gj": "Gujarat", "gujarat": "Gujarat", "gujrat": "Gujarat", "ahmedabad": "Gujarat", "surat": "Gujarat", "vadodara": "Gujarat", "rajkot": "Gujarat",
                    "wb": "West Bengal", "west bengal": "West Bengal", "bengal": "West Bengal", "kolkata": "West Bengal", "howrah": "West Bengal", "siliguri": "West Bengal",
                    "tn": "Tamil Nadu", "tamil nadu": "Tamil Nadu", "tamilnadu": "Tamil Nadu", "chennai": "Tamil Nadu", "coimbatore": "Tamil Nadu", "madurai": "Tamil Nadu",
                    "ka": "Karnataka", "karnataka": "Karnataka", "bangalore": "Karnataka", "bengaluru": "Karnataka", "mysore": "Karnataka", "mysuru": "Karnataka", "hubli": "Karnataka",
                    "kl": "Kerala", "kerala": "Kerala", "kochi": "Kerala", "cochin": "Kerala", "thiruvananthapuram": "Kerala", "trivandrum": "Kerala", "kozhikode": "Kerala",
                    "dl": "Delhi", "delhi": "Delhi", "new delhi": "Delhi", "nct": "Delhi",
                    "up": "Uttar Pradesh", "uttar pradesh": "Uttar Pradesh", "lucknow": "Uttar Pradesh", "kanpur": "Uttar Pradesh", "noida": "Uttar Pradesh", "varanasi": "Uttar Pradesh", "agra": "Uttar Pradesh",
                    "br": "Bihar", "bihar": "Bihar", "patna": "Bihar", "gaya": "Bihar", "muzaffarpur": "Bihar",
                    "jh": "Jharkhand", "jharkhand": "Jharkhand", "ranchi": "Jharkhand", "jamshedpur": "Jharkhand", "dhanbad": "Jharkhand",
                    "pb": "Punjab", "punjab": "Punjab", "amritsar": "Punjab", "ludhiana": "Punjab", "jalandhar": "Punjab",
                    "hr": "Haryana", "haryana": "Haryana", "gurgaon": "Haryana", "gurugram": "Haryana", "faridabad": "Haryana",
                    "rj": "Rajasthan", "rajasthan": "Rajasthan", "jaipur": "Rajasthan", "jodhpur": "Rajasthan", "udaipur": "Rajasthan", "kota": "Rajasthan",
                    "mp": "Madhya Pradesh", "madhya pradesh": "Madhya Pradesh", "indore": "Madhya Pradesh", "bhopal": "Madhya Pradesh", "gwalior": "Madhya Pradesh", "jabalpur": "Madhya Pradesh",
                    "ap": "Andhra Pradesh", "andhra pradesh": "Andhra Pradesh", "andhra": "Andhra Pradesh", "visakhapatnam": "Andhra Pradesh", "vijayawada": "Andhra Pradesh", "guntur": "Andhra Pradesh",
                    "ts": "Telangana", "tg": "Telangana", "telangana": "Telangana", "hyderabad": "Telangana", "warangal": "Telangana", "secunderabad": "Telangana",
                    "od": "Odisha", "or": "Odisha", "odisha": "Odisha", "orissa": "Odisha", "bhubaneswar": "Odisha", "cuttack": "Odisha", "puri": "Odisha",
                    "as": "Assam", "assam": "Assam", "guwahati": "Assam", "silchar": "Assam", "dibrugarh": "Assam",
                    "ga": "Goa", "goa": "Goa", "panaji": "Goa", "margao": "Goa",
                    "jk": "Jammu and Kashmir", "jammu": "Jammu and Kashmir", "kashmir": "Jammu and Kashmir", "srinagar": "Jammu and Kashmir",
                    "uk": "Uttarakhand", "ua": "Uttarakhand", "uttarakhand": "Uttarakhand", "dehradun": "Uttarakhand", "haridwar": "Uttarakhand", "rishikesh": "Uttarakhand",
                    "hp": "Himachal Pradesh", "himachal pradesh": "Himachal Pradesh", "shimla": "Himachal Pradesh", "manali": "Himachal Pradesh", "dharamshala": "Himachal Pradesh",
                    "ch": "Chandigarh", "chandigarh": "Chandigarh",
                    "ct": "Chhattisgarh", "cg": "Chhattisgarh", "chhattisgarh": "Chhattisgarh", "raipur": "Chhattisgarh",
                    "py": "Puducherry", "pondicherry": "Puducherry",
                    "tr": "Tripura", "tripura": "Tripura", "agartala": "Tripura",
                    "ml": "Meghalaya", "meghalaya": "Meghalaya", "shillong": "Meghalaya",
                    "mn": "Manipur", "manipur": "Manipur", "imphal": "Manipur",
                    "mz": "Mizoram", "mizoram": "Mizoram", "aizawl": "Mizoram",
                    "nl": "Nagaland", "nagaland": "Nagaland", "kohima": "Nagaland",
                    "ar": "Arunachal Pradesh", "arunachal": "Arunachal Pradesh", "itanagar": "Arunachal Pradesh",
                    "sk": "Sikkim", "sikkim": "Sikkim", "gangtok": "Sikkim",
                }

                if s in state_aliases:
                    return state_aliases[s]
                if c in state_aliases:
                    return state_aliases[c]

                # Deduce state from Indian postal pincode prefix (first 2 digits)
                if len(p) >= 2 and p[:2].isdigit():
                    pfx = int(p[:2])
                    if pfx == 11: return "Delhi"
                    elif 12 <= pfx <= 13: return "Haryana"
                    elif 14 <= pfx <= 16: return "Punjab"
                    elif pfx == 17: return "Himachal Pradesh"
                    elif 18 <= pfx <= 19: return "Jammu and Kashmir"
                    elif 20 <= pfx <= 28: return "Uttar Pradesh"
                    elif 30 <= pfx <= 34: return "Rajasthan"
                    elif 36 <= pfx <= 39: return "Gujarat"
                    elif 40 <= pfx <= 44: return "Maharashtra"
                    elif 45 <= pfx <= 48: return "Madhya Pradesh"
                    elif pfx == 49: return "Chhattisgarh"
                    elif 50 <= pfx <= 53: return "Telangana"
                    elif 56 <= pfx <= 59: return "Karnataka"
                    elif 60 <= pfx <= 64: return "Tamil Nadu"
                    elif 67 <= pfx <= 69: return "Kerala"
                    elif 70 <= pfx <= 74: return "West Bengal"
                    elif 75 <= pfx <= 77: return "Odisha"
                    elif pfx == 78: return "Assam"
                    elif 80 <= pfx <= 85: return "Bihar"

                return "Maharashtra"

            shop_state = _normalize_indian_state(raw_state, raw_city, raw_pincode) if shop_country_code == "IN" else (raw_state.title() if raw_state else "")
            shop_city = raw_city.title() if raw_city else ""

            # Comprehensive Region-Wise Festival Multiplier and Insight Matrix (India)
            REGIONAL_PROFILE = {
                "Maharashtra": {
                    "zone": "Western India",
                    "primary_festivals": {
                        "ganesh": {"mult": 2.2, "name": "Ganesh Chaturthi", "insight": "Maharashtra's supreme 10-day celebration. Peak demand for sweets, catering, modak, family dining, and late-night food stalls."},
                        "gudi padwa": {"mult": 1.8, "name": "Gudi Padwa", "insight": "Maharashtrian New Year. Substantial daytime footfall surge and celebratory dining."},
                        "shivaji": {"mult": 1.5, "name": "Chhatrapati Shivaji Maharaj Jayanti", "insight": "State public holiday with massive local processions and lunch/dinner rush."},
                        "sharad navratri": {"mult": 1.8, "name": "Sharad Navratri", "insight": "Fasting menu demand during day; late-night post-dandiya dining surges."},
                        "dussehra": {"mult": 1.9, "name": "Dussehra (Vijayadashami)", "insight": "Major festive dining out and gold/vehicle purchase celebrations."},
                        "makar sankranti": {"mult": 1.4, "name": "Makar Sankranti", "insight": "Traditional sweet (Tilgul) distribution and family festive meals."},
                    },
                    "state_days": [("05-01", "Maharashtra Day", 1.4, "State foundation holiday; high holiday lunch and retail traffic.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day", "ashadi ekadashi", "kartiki ekadashi"],
                },
                "Gujarat": {
                    "zone": "Western India",
                    "primary_festivals": {
                        "navratri": {"mult": 2.2, "name": "Navratri / Garba Nights", "insight": "Gujarat's #1 cultural festival (9 nights). Extraordinary surge in midnight food stalls, fast-food, desserts, and late-night dine-in."},
                        "makar sankranti": {"mult": 2.0, "name": "Uttarayan / Kite Festival", "insight": "Rooftop gatherings, massive demand for Undhiyu, Jalebi, snacks, and catering."},
                        "uttarayan": {"mult": 2.0, "name": "Uttarayan / Kite Festival", "insight": "Massive statewide kite flying festival with all-day festive dining."},
                        "janmashtami": {"mult": 1.9, "name": "Janmashtami", "insight": "Major midnight celebration across Gujarat. Faraali/fasting special orders surge."},
                        "cheti chand": {"mult": 1.5, "name": "Cheti Chand", "insight": "Sindhi New Year, observed widely in Gujarat business communities."},
                    },
                    "state_days": [("05-01", "Gujarat Day", 1.4, "State foundation holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "West Bengal": {
                    "zone": "Eastern India",
                    "primary_festivals": {
                        "durga puja": {"mult": 2.5, "name": "Durga Puja", "insight": "Bengal's biggest festival of the year! Pandal hopping creates 24-hour restaurant footfall, street food records, and festive menus."},
                        "maha saptami": {"mult": 2.5, "name": "Durga Puja (Maha Saptami)", "insight": "Peak pandal hopping and dining out rush across Bengal."},
                        "maha ashtami": {"mult": 2.5, "name": "Durga Puja (Maha Ashtami)", "insight": "Peak evening and midnight dining out; Bhog and restaurant dining surges."},
                        "maha navami": {"mult": 2.5, "name": "Durga Puja (Maha Navami)", "insight": "Carnival atmosphere, massive dining and takeaway volumes."},
                        "kali puja": {"mult": 2.0, "name": "Kali Puja & Diwali", "insight": "Statewide illumination and late-night festive dining."},
                        "poila boishakh": {"mult": 1.9, "name": "Poila Boishakh (Bengali New Year)", "insight": "Traditional new clothes shopping, auspicious beginnings, and heavy restaurant dining."},
                        "vaisakhadi": {"mult": 1.9, "name": "Poila Boishakh (Bengali New Year)", "insight": "Auspicious beginnings and heavy celebratory dining in Bengal."},
                        "dolyatra": {"mult": 1.8, "name": "Dolyatra / Holi", "insight": "Spring color festival with high afternoon takeaway and celebration orders."},
                        "rabindranath": {"mult": 1.5, "name": "Rabindra Jayanti", "insight": "State cultural holiday with community gatherings and sweet consumption."},
                        "bhai duj": {"mult": 1.6, "name": "Bhai Phota (Bhai Duj)", "insight": "Family feasts and high gifting/sweet box sales."},
                    },
                    "state_days": [("04-15", "Poila Boishakh", 1.9, "Bengali New Year holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Tamil Nadu": {
                    "zone": "Southern India",
                    "primary_festivals": {
                        "pongal": {"mult": 2.2, "name": "Pongal Harvest Festival", "insight": "Tamil Nadu's 4-day harvest celebration. Massive surge in groceries, family feasts, traditional sweets, and travel dining."},
                        "mattu pongal": {"mult": 2.0, "name": "Mattu Pongal", "insight": "Jallikattu and cultural feasts in rural and semi-urban Tamil Nadu."},
                        "puthandu": {"mult": 1.8, "name": "Puthandu (Tamil New Year)", "insight": "New Year feasts, temple visits, and family dining out."},
                        "mesadi": {"mult": 1.8, "name": "Tamil New Year / Mesadi", "insight": "Auspicious holiday with traditional feasts."},
                        "deepavali": {"mult": 2.0, "name": "Deepavali", "insight": "Major festival celebrated early morning in Tamil Nadu with sweets and family feasts."},
                        "vinayaka": {"mult": 1.5, "name": "Vinayaka Chathurthi", "insight": "Public celebration with local festive demand."},
                    },
                    "state_days": [("04-14", "Tamil New Year (Puthandu)", 1.8, "Tamil New Year public holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day", "thiruvalluvar day"],
                },
                "Kerala": {
                    "zone": "Southern India",
                    "primary_festivals": {
                        "onam": {"mult": 2.4, "name": "Thiruvonam / Onam", "insight": "Kerala's harvest festival & grand celebration! Huge demand for Onasadya (traditional feast), catering, and family dining."},
                        "thiruvonam": {"mult": 2.4, "name": "Thiruvonam (Peak Onam Day)", "insight": "Apex of festive dining in Kerala; record sales for restaurants and sweet vendors."},
                        "vishu": {"mult": 2.0, "name": "Vishu (Malayalam New Year)", "insight": "Vishu Kani, fireworks, and lavish traditional feasts."},
                        "attukal": {"mult": 1.6, "name": "Attukal Pongala", "insight": "Largest congregation of women devotees; huge food stall and beverage demand."},
                    },
                    "state_days": [("11-01", "Kerala Piravi", 1.5, "Kerala state formation day.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Punjab": {
                    "zone": "Northern India",
                    "primary_festivals": {
                        "vaisakhi": {"mult": 2.2, "name": "Vaisakhi / Baisakhi", "insight": "Harvest celebration & Khalsa formation day. Massive community dining (langar), sweet sales, and Punjabi cuisine surge."},
                        "baisakhi": {"mult": 2.2, "name": "Baisakhi", "insight": "Peak harvest celebration across Punjab and Haryana."},
                        "lohri": {"mult": 2.0, "name": "Lohri", "insight": "Winter bonfire festival with immense demand for sweets, snacks, groundnuts, and celebration dinners."},
                        "guru nanak": {"mult": 1.9, "name": "Guru Nanak Jayanti (Gurpurab)", "insight": "Major holy day with massive footfall at gurdwaras, public feeding, and confectionery demand."},
                        "guru gobind": {"mult": 1.8, "name": "Guru Gobind Singh Jayanti", "insight": "State holiday with high community participation and family meals."},
                        "guru tegh": {"mult": 1.4, "name": "Guru Tegh Bahadur Martyrdom Day", "insight": "State public holiday in Punjab."},
                    },
                    "state_days": [("04-14", "Vaisakhi Day", 2.2, "Harvest and religious holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Karnataka": {
                    "zone": "Southern India",
                    "primary_festivals": {
                        "ugadi": {"mult": 2.0, "name": "Ugadi (Kannada New Year)", "insight": "Kannada New Year festival with traditional Holige/Obbattu sweets and heavy family dining."},
                        "dussehra": {"mult": 2.2, "name": "Mysuru Dasara / Vijayadashami", "insight": "State festival (Naada Habba). Mysuru and Bengaluru see unprecedented tourist influx and restaurant sales."},
                        "gowri": {"mult": 1.8, "name": "Gowri Habba & Ganesha", "insight": "Household pujas and high sales of festive ingredients and snacks."},
                        "kannada rajyotsava": {"mult": 1.6, "name": "Kannada Rajyotsava", "insight": "Karnataka Foundation Day. Widespread cultural parades and lunch/dinner rush."},
                    },
                    "state_days": [("11-01", "Kannada Rajyotsava", 1.6, "Karnataka state formation day.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Andhra Pradesh": {
                    "zone": "Southern India",
                    "primary_festivals": {
                        "ugadi": {"mult": 2.0, "name": "Ugadi (Telugu New Year)", "insight": "Telugu New Year celebration. High demand for festive pachadi, sweets, and celebration platters."},
                        "sankranti": {"mult": 2.1, "name": "Makara Sankranti (3-day)", "insight": "Andhra's biggest festival (Bhogi, Sankranti, Kanuma). Massive rural homecoming and lavish feasts."},
                    },
                    "state_days": [("11-01", "Andhra Pradesh Formation Day", 1.4, "State formation holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Telangana": {
                    "zone": "Southern India",
                    "primary_festivals": {
                        "ugadi": {"mult": 2.0, "name": "Ugadi (Telugu New Year)", "insight": "Telugu New Year with high dining and celebration orders."},
                        "bonalu": {"mult": 1.8, "name": "Bonalu Festival", "insight": "Hyderabad and Secunderabad temple celebrations with traditional food offerings."},
                        "bathukamma": {"mult": 1.8, "name": "Bathukamma Floral Festival", "insight": "State festival during Navratri with large public gatherings and sweet orders."},
                        "milad": {"mult": 1.9, "name": "Milad un-Nabi", "insight": "Major cultural festival in Hyderabad with late-night food street crowds."},
                        "sankranti": {"mult": 2.0, "name": "Sankranti", "insight": "Homecoming festival with heavy travel and dine-out traffic."},
                    },
                    "state_days": [("06-02", "Telangana Formation Day", 1.5, "State formation holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Bihar": {
                    "zone": "Eastern India",
                    "primary_festivals": {
                        "chhat": {"mult": 2.4, "name": "Chhath Puja", "insight": "Bihar's most revered cultural festival (4 days). Immense shopping for Thekua ingredients, fruits, prasad, and family homecomings."},
                        "chhat puja": {"mult": 2.4, "name": "Chhath Puja", "insight": "River ghat gatherings; wholesale and retail grocery volumes multiply."},
                        "govardhan": {"mult": 1.6, "name": "Govardhan Puja & Godhan", "insight": "Post-Diwali festivities and festive home cooking."},
                        "makar sankranti": {"mult": 1.6, "name": "Makar Sankranti (Dahi Chuda)", "insight": "Traditional Dahi-Chuda-Tilkut feast creates huge dairy and confectionery demand."},
                        "bihar diwas": {"mult": 1.5, "name": "Bihar Diwas", "insight": "State formation holiday with public events."},
                    },
                    "state_days": [("03-22", "Bihar Diwas", 1.5, "Bihar state formation holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Odisha": {
                    "zone": "Eastern India",
                    "primary_festivals": {
                        "rath yatra": {"mult": 2.4, "name": "Rath Yatra (Puri Chariot Festival)", "insight": "Odisha's world-famous chariot festival. Millions gather in Puri and coastal Odisha; record food and beverage consumption."},
                        "durga puja": {"mult": 2.0, "name": "Durga Puja", "insight": "Cuttack and Bhubaneswar pandals attract enormous evening dining crowds."},
                        "raja": {"mult": 1.8, "name": "Raja Parba", "insight": "3-day agricultural celebration with Pitha sweets and street food delicacies."},
                    },
                    "state_days": [("04-01", "Utkal Divas", 1.5, "Odisha state formation day.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Assam": {
                    "zone": "North-Eastern India",
                    "primary_festivals": {
                        "bahag bihu": {"mult": 2.3, "name": "Bohag / Rongali Bihu", "insight": "Assam's prime harvest & New Year festival (7 days). Massive demand for Pitha, Laru, Jolpan, and community banquets."},
                        "bihu": {"mult": 2.3, "name": "Bihu", "insight": "Peak cultural festival in Assam; heavy dining and celebration rush."},
                        "magh bihu": {"mult": 1.9, "name": "Magh / Bhogali Bihu", "insight": "Harvest feast festival with bonfire dining and high poultry/fish/sweet sales."},
                        "durga puja": {"mult": 2.0, "name": "Durga Puja in Assam", "insight": "Guwahati pandals create peak seasonal dining."},
                    },
                    "state_days": [("04-14", "Bohag Bihu Day 1", 2.3, "Assamese New Year holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Delhi": {
                    "zone": "Northern India",
                    "primary_festivals": {
                        "diwali": {"mult": 2.2, "name": "Diwali", "insight": "Peak gifting, shopping, and dining week in the capital region."},
                        "dussehra": {"mult": 1.9, "name": "Dussehra", "insight": "Ramlila fairs across Delhi draw millions to street food and family restaurants."},
                        "holi": {"mult": 2.0, "name": "Holi", "insight": "Snack, beverage, and celebration delivery orders skyrocket."},
                        "janmashtami": {"mult": 1.8, "name": "Janmashtami", "insight": "Midnight temple crowds at ISKCON and Birla Mandir drive fast-food surges."},
                        "eid": {"mult": 1.9, "name": "Eid ul-Fitr & Bakrid", "insight": "Old Delhi and major commercial districts see record dining and takeaway."},
                        "chhat": {"mult": 1.8, "name": "Chhath Puja in NCR", "insight": "Observed with public holidays and massive ghat congregations across NCR."},
                    },
                    "state_days": [],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Uttar Pradesh": {
                    "zone": "Northern India",
                    "primary_festivals": {
                        "diwali": {"mult": 2.2, "name": "Diwali (Deepotsav)", "insight": "Statewide grand illuminations; confectionery and dining sales hit annual highs."},
                        "holi": {"mult": 2.1, "name": "Holi (Braj/Awadh)", "insight": "Famous multi-day festivities in Mathura, Varanasi, and Lucknow; huge festive demand."},
                        "janmashtami": {"mult": 2.0, "name": "Janmashtami (Mathura/Vrindavan)", "insight": "Unmatched religious tourism and fasting/feasting food orders."},
                        "chhat": {"mult": 1.8, "name": "Chhath Puja (Purvanchal)", "insight": "Purvanchal region experiences highest festive gathering of the year."},
                    },
                    "state_days": [("01-24", "UP Diwas", 1.3, "Statehood day.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Rajasthan": {
                    "zone": "Northern India",
                    "primary_festivals": {
                        "teej": {"mult": 1.8, "name": "Teej Festival", "insight": "Ghevar sweets and traditional Rajasthani dining surges."},
                        "gangaur": {"mult": 1.8, "name": "Gangaur Festival", "insight": "Women's traditional festival with sweet gifting and festive dining."},
                        "diwali": {"mult": 2.2, "name": "Diwali in Rajasthan", "insight": "Jaipur market illuminations draw massive tourist and local diners."},
                    },
                    "state_days": [("03-30", "Rajasthan Day", 1.4, "State foundation celebration.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
                "Goa": {
                    "zone": "Western India",
                    "primary_festivals": {
                        "carnival": {"mult": 2.2, "name": "Goa Carnival", "insight": "4-day carnival prior to Lent. Unprecedented tourism and nightlife/restaurant surge."},
                        "xavier": {"mult": 1.8, "name": "Feast of St. Francis Xavier", "insight": "Old Goa pilgrimage draws huge coastal crowds and food stalls."},
                        "sao joao": {"mult": 1.7, "name": "Sao Joao Feast", "insight": "Traditional monsoon feast with heavy festive dining and catering."},
                        "shigmo": {"mult": 1.7, "name": "Shigmo Festival", "insight": "Goan spring festival with temple parades and local dining out."},
                    },
                    "state_days": [("12-19", "Goa Liberation Day", 1.6, "State public holiday.")],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                },
            }

            # Worldwide Cultural Profiles & Multipliers
            GLOBAL_CULTURAL_PROFILES = {
                "US": {
                    "zone": "North America",
                    "primary_festivals": {
                        "thanksgiving": {"mult": 2.4, "name": "Thanksgiving Day", "insight": "Supreme family dining holiday in the US. Massive surge in turkey catering, grocery sales, and takeout."},
                        "black friday": {"mult": 2.5, "name": "Black Friday", "insight": "Largest retail footfall and shopping day of the year; unprecedented commercial footfall."},
                        "cyber monday": {"mult": 1.8, "name": "Cyber Monday", "insight": "Online retail peak with heavy delivery/takeout dining."},
                        "christmas": {"mult": 2.2, "name": "Christmas Day", "insight": "Peak nationwide winter festive holiday with family feasts and gift spending."},
                        "christmas eve": {"mult": 2.0, "name": "Christmas Eve", "insight": "High last-minute shopping and celebration dining."},
                        "new year": {"mult": 2.0, "name": "New Year's Eve / Day", "insight": "Late-night celebrations, parties, and breakfast/brunch rush."},
                        "independence": {"mult": 2.0, "name": "4th of July (Independence Day)", "insight": "Summer outdoor BBQ celebrations, picnics, and high beverage/dining sales."},
                        "memorial": {"mult": 1.7, "name": "Memorial Day Weekend", "insight": "3-day holiday weekend kicking off summer retail and dining travel."},
                        "labor day": {"mult": 1.7, "name": "Labor Day Weekend", "insight": "End-of-summer 3-day holiday weekend with elevated leisure spend."},
                        "halloween": {"mult": 1.8, "name": "Halloween", "insight": "Confectionery, candy, festive treats, and nightlife entertainment surge."},
                        "super bowl": {"mult": 2.1, "name": "Super Bowl Sunday", "insight": "Record-setting pizza, chicken wings, beer, and snack food delivery demand."},
                        "st. patrick": {"mult": 1.7, "name": "St. Patrick's Day", "insight": "High bar, pub, and casual dining footfall across the nation."},
                        "mother's day": {"mult": 1.9, "name": "Mother's Day", "insight": "Highest restaurant brunch and fine dining reservation volume of the year."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "GB": {
                    "zone": "United Kingdom & Ireland",
                    "primary_festivals": {
                        "christmas": {"mult": 2.3, "name": "Christmas Day", "insight": "Apex of UK festive dining and family celebrations."},
                        "boxing day": {"mult": 2.2, "name": "Boxing Day", "insight": "Massive post-Christmas shopping sales rush and football hospitality."},
                        "new year": {"mult": 2.0, "name": "New Year's Eve / Day", "insight": "Hospitality and pub peak with celebratory dining."},
                        "bank holiday": {"mult": 1.7, "name": "Bank Holiday Weekend", "insight": "3-day long weekend driving high pub visits, dining out, and domestic leisure."},
                        "easter": {"mult": 1.8, "name": "Easter Weekend", "insight": "Spring family gatherings, confectionery sales, and restaurant dining."},
                        "guy fawkes": {"mult": 1.5, "name": "Bonfire Night (Guy Fawkes)", "insight": "Outdoor public fireworks gatherings and hot food/beverage demand."},
                        "st patrick": {"mult": 1.6, "name": "St Patrick's Day", "insight": "Heavy pub and restaurant footfall across the UK."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "CA": {
                    "zone": "North America",
                    "primary_festivals": {
                        "thanksgiving": {"mult": 2.2, "name": "Canadian Thanksgiving", "insight": "October harvest feast with high grocery and family dining volume."},
                        "canada day": {"mult": 2.0, "name": "Canada Day", "insight": "July 1 nationwide celebrations, fireworks, and outdoor dining."},
                        "victoria day": {"mult": 1.7, "name": "Victoria Day Weekend", "insight": "First major summer long weekend with strong travel and dining rush."},
                        "christmas": {"mult": 2.3, "name": "Christmas Day", "insight": "Peak winter festive dining and retail celebrations."},
                        "boxing day": {"mult": 2.2, "name": "Boxing Day", "insight": "Annual shopping frenzy and high mall/restaurant footfall."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "AU": {
                    "zone": "Oceania / Australia",
                    "primary_festivals": {
                        "australia day": {"mult": 2.0, "name": "Australia Day", "insight": "Summer holiday; massive demand for BBQs, beachside food, and outdoor hospitality."},
                        "anzac": {"mult": 1.6, "name": "ANZAC Day", "insight": "Dawn services followed by busy cafes and traditional pub two-up gatherings."},
                        "melbourne cup": {"mult": 1.8, "name": "Melbourne Cup Day", "insight": "The race that stops the nation; restaurant lunches and party catering peak."},
                        "christmas": {"mult": 2.3, "name": "Christmas Day", "insight": "Summer festive dining, seafood feasts, and celebrations."},
                        "boxing day": {"mult": 2.2, "name": "Boxing Day", "insight": "Huge retail sales rush and cricket/sports hospitality."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "SG": {
                    "zone": "Southeast Asia",
                    "primary_festivals": {
                        "chinese new year": {"mult": 2.5, "name": "Chinese New Year / Lunar New Year", "insight": "Singapore's supreme festival; reunion dinners, bakery, mandarin gifting, and shopping."},
                        "lunar new year": {"mult": 2.5, "name": "Lunar New Year", "insight": "Multi-day celebratory feasts and retail peak."},
                        "hari raya": {"mult": 2.2, "name": "Hari Raya Puasa / Aidilfitri", "insight": "Geylang Serai bazaar, festive feasting, and community open houses."},
                        "deepavali": {"mult": 2.0, "name": "Deepavali", "insight": "Little India festive bazaar and holiday celebratory dining."},
                        "national day": {"mult": 2.0, "name": "National Day (Aug 9)", "insight": "Marina Bay parade crowds, fireworks dining, and patriotic gatherings."},
                        "christmas": {"mult": 2.0, "name": "Christmas in Singapore", "insight": "Orchard Road light-up, shopping, and year-end restaurant dining."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "AE": {
                    "zone": "Middle East / GCC",
                    "primary_festivals": {
                        "eid al-fitr": {"mult": 2.4, "name": "Eid al-Fitr", "insight": "Grand festive dining, retail shopping festivals, and holiday travel surge."},
                        "eid al-adha": {"mult": 2.3, "name": "Eid al-Adha", "insight": "Traditional family banquets, gifting, and hospitality rush."},
                        "national day": {"mult": 2.2, "name": "UAE National Day (Dec 2)", "insight": "Long weekend holiday, fireworks dining, and commercial sales promotions."},
                        "new year": {"mult": 2.2, "name": "New Year's Eve in UAE", "insight": "World-famous celebration dining and entertainment records."},
                        "ramadan": {"mult": 1.9, "name": "Ramadan Evenings", "insight": "High night-time footfall for Iftar buffets and Suhoor gatherings."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "DE": {
                    "zone": "Europe",
                    "primary_festivals": {
                        "einheit": {"mult": 1.7, "name": "Tag der Deutschen Einheit", "insight": "German Unity Day national holiday and leisure spending."},
                        "weihnachten": {"mult": 2.2, "name": "Weihnachten (Christmas)", "insight": "Christmas markets (Weihnachtsmarkt) and festive dining peaks."},
                        "christmas": {"mult": 2.2, "name": "Christmas Day", "insight": "Major winter celebration with high dining and confectionery."},
                        "silvester": {"mult": 2.0, "name": "Silvester / New Year", "insight": "Celebratory gatherings, fireworks, and restaurant parties."},
                        "ostern": {"mult": 1.8, "name": "Ostern (Easter)", "insight": "Spring long weekend, bakery treats, and family dining."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "FR": {
                    "zone": "Europe",
                    "primary_festivals": {
                        "bastille": {"mult": 2.0, "name": "Bastille Day (14 Juillet)", "insight": "French National Day celebrations, fireworks, and cafe/bistro crowds."},
                        "fête nationale": {"mult": 2.0, "name": "Fête nationale", "insight": "Grand public festivities and dining out."},
                        "noël": {"mult": 2.2, "name": "Noël (Christmas)", "insight": "Lavish festive gastronomy, patisserie, and family feasts."},
                        "christmas": {"mult": 2.2, "name": "Christmas Day", "insight": "Winter holiday dining peak."},
                        "nouvel an": {"mult": 2.0, "name": "Jour de l'An (New Year)", "insight": "Gourmet dining and festive celebrations."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
                "JP": {
                    "zone": "East Asia",
                    "primary_festivals": {
                        "golden week": {"mult": 2.3, "name": "Golden Week", "insight": "Consecutive national holidays; nationwide domestic travel, shopping, and dining surge."},
                        "showa": {"mult": 2.0, "name": "Showa Day (Golden Week)", "insight": "Holiday travel and restaurant dining rush."},
                        "constitution": {"mult": 2.0, "name": "Constitution Memorial Day", "insight": "Peak holiday spending during Golden Week."},
                        "children": {"mult": 2.0, "name": "Children's Day (Kodomo no Hi)", "insight": "Family dining, confectionery, and outing surges."},
                        "new year": {"mult": 2.4, "name": "Shogatsu (New Year)", "insight": "Japan's prime holiday season; Osechi dining, shrine visits, and family homecomings."},
                        "obon": {"mult": 2.0, "name": "Obon Festival", "insight": "Summer homecoming holiday with high regional dining and travel."},
                    },
                    "state_days": [],
                    "dry_days": [],
                },
            }

            if shop_country_code == "IN":
                state_info = REGIONAL_PROFILE.get(shop_state, {
                    "zone": "Pan-India",
                    "primary_festivals": {},
                    "state_days": [],
                    "dry_days": ["gandhi jayanti", "republic day", "independence day"],
                })
            else:
                state_info = GLOBAL_CULTURAL_PROFILES.get(shop_country_code, {
                    "zone": f"International ({shop_country})",
                    "primary_festivals": {},
                    "state_days": [],
                    "dry_days": [],
                })

            major_festivals = [
                "Diwali", "Deepavali", "Holi", "Eid", "Christmas", "New Year", "Independence Day",
                "Republic Day", "Gandhi Jayanti", "Janmashtami", "Dussehra", "Maha Shivaratri",
                "Thanksgiving", "Easter", "Boxing Day", "National Day", "Labor Day"
            ]

            ssl_ctx = ssl._create_unverified_context()
            headers = {"User-Agent": "InfoOS-POS/1.0 (infoos@local.dev)"}
            all_events = []
            api_source = "google_calendar_public_feed (primary web request)"

            # Map ISO code to official Google Calendar feeds
            GCAL_FEED_MAP = {
                "IN": "en.indian",
                "US": "en.usa",
                "GB": "en.uk",
                "CA": "en.canadian",
                "AU": "en.australian",
                "SG": "en.singapore",
            }

            gcal_feed = GCAL_FEED_MAP.get(shop_country_code)

            # TIER 1: Google Calendar official country feed if available
            if gcal_feed:
                try:
                    gcal_url = f"https://calendar.google.com/calendar/ical/{gcal_feed}%23holiday%40group.v.calendar.google.com/public/basic.ics"
                    req = urllib.request.Request(gcal_url, headers=headers)
                    with urllib.request.urlopen(req, context=ssl_ctx, timeout=6) as resp:
                        ics_content = resp.read().decode("utf-8")
                        raw_vevents = ics_content.split("BEGIN:VEVENT")

                        for raw_ev in raw_vevents[1:]:
                            m_dt = re.search(r"DTSTART.*?:(\d{8})", raw_ev)
                            m_sum = re.search(r"SUMMARY:(.*)", raw_ev)
                            m_desc = re.search(r"DESCRIPTION:(.*)", raw_ev)
                            if not m_dt or not m_sum:
                                continue

                            dt_s = m_dt.group(1)
                            ev_d = _date(int(dt_s[:4]), int(dt_s[4:6]), int(dt_s[6:8]))
                            if not (from_dt <= ev_d <= to_dt):
                                continue

                            ev_name = m_sum.group(1).strip().replace("\\,", ",")
                            ev_desc = m_desc.group(1).strip().replace("\\,", ",") if m_desc else ""
                            ev_lower = ev_name.lower()

                            h_mult = 1.2
                            ev_type = "public_holiday"
                            scope = "national"
                            relevance = "NATIONAL_GAZETTED"
                            regional_insight = ""

                            # 1. Match signature festivals for this country/state
                            matched_state_fest = None
                            for kw, f_meta in state_info["primary_festivals"].items():
                                if kw in ev_lower:
                                    matched_state_fest = f_meta
                                    break

                            # 2. Check other Indian state matches if in India
                            other_state_match = None
                            if shop_country_code == "IN" and not matched_state_fest:
                                for other_s_name, other_s_meta in REGIONAL_PROFILE.items():
                                    if other_s_name == shop_state:
                                        continue
                                    for okw, of_meta in other_s_meta["primary_festivals"].items():
                                        if okw in ev_lower:
                                            other_state_match = (other_s_name, of_meta)
                                            break
                                    if other_state_match:
                                        break

                            # 3. Check dry days
                            is_dry_day = any(dd in ev_lower for dd in state_info.get("dry_days", []))
                            is_major = any(mf.lower() in ev_lower for mf in major_festivals)

                            if is_dry_day:
                                h_mult = 0.8
                                ev_type = "dry_day"
                                scope = f"dry_day:{shop_state or shop_country}"
                                relevance = "STATUTORY_DRY_DAY"
                                regional_insight = f"Government-mandated Dry Day in {shop_state or shop_country}. Alcohol sales prohibited; dining and beverage volumes restricted."
                            elif matched_state_fest:
                                h_mult = matched_state_fest["mult"]
                                ev_type = "regional_festival" if shop_country_code == "IN" else "national_festival"
                                scope = f"regional:{shop_state}" if shop_country_code == "IN" else f"national:{shop_country_code}"
                                relevance = "PRIMARY_STATE_FESTIVAL" if shop_country_code == "IN" else "NATIONAL_SIGNATURE_FESTIVAL"
                                regional_insight = matched_state_fest["insight"]
                            elif is_major and "eve" in ev_lower:
                                h_mult = 1.4
                                ev_type = "festival_eve"
                                scope = "national"
                                relevance = "MAJOR_FESTIVAL_EVE"
                                regional_insight = f"Festive eve preparations across {shop_state or shop_country}. High evening takeaway and grocery demand."
                            elif is_major:
                                h_mult = 2.0 if any(k in ev_lower for k in ["thanksgiving", "diwali", "christmas", "new year"]) else 1.8
                                ev_type = "major_festival"
                                scope = "national"
                                relevance = "MAJOR_NATIONAL_FESTIVAL"
                                regional_insight = f"Major nationwide festival celebrated widely across {shop_state or shop_country}."
                            elif other_state_match:
                                other_st, other_f = other_state_match
                                h_mult = 1.1
                                ev_type = "regional_observance"
                                scope = f"regional:{other_st}"
                                relevance = "OTHER_REGION_OBSERVANCE"
                                regional_insight = f"Celebrated primarily in {other_st}; observed with normal or light demand in {shop_state}."
                            elif "observance" in ev_desc.lower():
                                h_mult = 1.15
                                ev_type = "observance"
                                scope = "national"
                                relevance = "NATIONAL_OBSERVANCE"
                                regional_insight = f"National observance noted on calendar."
                            else:
                                h_mult = 1.2
                                ev_type = "public_holiday"
                                scope = "national"
                                relevance = "GAZETTED_HOLIDAY"
                                regional_insight = f"General public holiday in {shop_state or shop_country}."

                            all_events.append({
                                "name": ev_name,
                                "date": str(ev_d),
                                "type": ev_type,
                                "scope": scope,
                                "relevance": relevance,
                                "h_multiplier": h_mult,
                                "effect": "boost" if h_mult > 1.0 else "suppress" if h_mult < 1.0 else "neutral",
                                "regional_insight": regional_insight,
                                "description": ev_desc or f"{ev_name} celebration in {shop_state or shop_country}",
                            })

                    # Check state days if configured
                    cur_year = from_dt.year
                    for mmdd, s_day_name, s_mult, s_ins in state_info.get("state_days", []):
                        try:
                            s_date = _date(cur_year, int(mmdd[:2]), int(mmdd[3:]))
                            if from_dt <= s_date <= to_dt:
                                all_events.append({
                                    "name": s_day_name,
                                    "date": str(s_date),
                                    "type": "regional_holiday",
                                    "scope": f"regional:{shop_state}",
                                    "relevance": "STATE_FOUNDATION_HOLIDAY",
                                    "h_multiplier": s_mult,
                                    "effect": "boost",
                                    "regional_insight": s_ins,
                                    "description": f"Official state holiday for {shop_state}.",
                                })
                        except Exception:
                            pass

                except Exception as _gcal_err:
                    _log.warning("Primary Google Calendar holidays request failed for %s: %s", shop_country_code, _gcal_err)

            # TIER 2: Nager.Date Global Public Holidays API (for all 100+ countries or when GCal returns empty)
            if not all_events:
                api_source = "date.nager.at (worldwide public holidays api)"
                years_to_query = sorted(list({from_dt.year, to_dt.year}))
                for q_year in years_to_query:
                    try:
                        nager_url = f"https://date.nager.at/api/v3/PublicHolidays/{q_year}/{shop_country_code}"
                        req = urllib.request.Request(nager_url, headers=headers)
                        with urllib.request.urlopen(req, context=ssl_ctx, timeout=6) as resp:
                            nager_data = _json.loads(resp.read().decode("utf-8"))
                            for h in nager_data:
                                h_date = _date.fromisoformat(h["date"])
                                if not (from_dt <= h_date <= to_dt):
                                    continue
                                h_name = h.get("name") or h.get("localName") or "Public Holiday"
                                h_lower = h_name.lower()

                                # Check matching against national profile
                                matched_fest = None
                                for kw, f_meta in state_info.get("primary_festivals", {}).items():
                                    if kw in h_lower:
                                        matched_fest = f_meta
                                        break

                                if matched_fest:
                                    h_mult = matched_fest["mult"]
                                    ev_type = "national_festival"
                                    relevance = "NATIONAL_SIGNATURE_FESTIVAL"
                                    insight = matched_fest["insight"]
                                elif any(k in h_lower for k in ["christmas", "xmas", "noël", "weihnachten", "navidad"]):
                                    h_mult = 2.2
                                    ev_type = "major_festival"
                                    relevance = "CHRISTMAS_FESTIVAL"
                                    insight = f"Peak festive season holiday in {shop_country}."
                                elif any(k in h_lower for k in ["new year", "silvester", "nouvel an", "shogatsu"]):
                                    h_mult = 2.0
                                    ev_type = "major_festival"
                                    relevance = "NEW_YEAR_CELEBRATION"
                                    insight = f"Celebration holiday in {shop_country}."
                                elif any(k in h_lower for k in ["thanksgiving", "golden week", "easter", "eid"]):
                                    h_mult = 1.9
                                    ev_type = "major_festival"
                                    relevance = "MAJOR_CULTURAL_FESTIVAL"
                                    insight = f"Grand cultural holiday celebration in {shop_country}."
                                elif any(k in h_lower for k in ["independence", "national day", "republic", "revolution", "constitution"]):
                                    h_mult = 1.8
                                    ev_type = "national_holiday"
                                    relevance = "NATIONAL_DAY"
                                    insight = f"Official patriotic national holiday in {shop_country}."
                                else:
                                    h_mult = 1.3
                                    ev_type = "public_holiday"
                                    relevance = "PUBLIC_HOLIDAY"
                                    insight = f"Public holiday in {shop_country}."

                                all_events.append({
                                    "name": h_name,
                                    "date": str(h_date),
                                    "type": ev_type,
                                    "scope": f"national:{shop_country_code}",
                                    "relevance": relevance,
                                    "h_multiplier": h_mult,
                                    "effect": "boost" if h_mult > 1.0 else "neutral",
                                    "regional_insight": insight,
                                    "description": f"{h_name} ({h.get('localName', '')}) in {shop_country}",
                                })
                    except Exception as _nager_err:
                        _log.warning("Nager.Date holiday request failed for %s/%s: %s", q_year, shop_country_code, _nager_err)

            # TIER 3: Fallback web request to randomapi.dev
            if not all_events:
                try:
                    api_source = "randomapi.dev (fallback web request)"
                    fb_url = f"https://randomapi.dev/api/holidays?country={shop_country_code}&year={from_dt.year}"
                    req = urllib.request.Request(fb_url, headers=headers)
                    with urllib.request.urlopen(req, context=ssl_ctx, timeout=6) as resp:
                        fb_data = _json.loads(resp.read().decode("utf-8"))
                        for h in fb_data.get("data", []):
                            h_date = _date.fromisoformat(h["date"])
                            if from_dt <= h_date <= to_dt:
                                h_name = h.get("name")
                                is_major_fb = any(mf.lower() in h_name.lower() for mf in major_festivals)
                                all_events.append({
                                    "name": h_name,
                                    "date": str(h_date),
                                    "type": "major_festival" if is_major_fb else "public_holiday",
                                    "scope": "national",
                                    "relevance": "MAJOR_NATIONAL_FESTIVAL" if is_major_fb else "NATIONAL_GAZETTED",
                                    "h_multiplier": 1.8 if is_major_fb else 1.2,
                                    "effect": "boost",
                                    "regional_insight": f"Public holiday recognized in {shop_country}.",
                                    "description": h.get("localName") or h_name,
                                })
                except Exception as _fb_err:
                    _log.error("Fallback holiday request failed: %s", _fb_err)

            # De-duplicate by (date, name) and sort by date
            seen = set()
            unique_events = []
            for ev in sorted(all_events, key=lambda e: e["date"]):
                key = (ev["date"], ev["name"])
                if key not in seen:
                    seen.add(key)
                    unique_events.append(ev)

            return {
                "shop_country": shop_country,
                "shop_country_code": shop_country_code,
                "shop_state": shop_state,
                "shop_city": shop_city,
                "shop_pincode": raw_pincode,
                "region_zone": state_info.get("zone", shop_country),
                "regional_festivals_tracked": list(state_info.get("primary_festivals", {}).keys()),
                "from_date": str(from_dt),
                "to_date": str(to_dt),
                "event_count": len(unique_events),
                "events": unique_events,
                "source": api_source,
                "note": f"Holidays & festivals fetched directly via web request ({api_source}) and dynamically calibrated for {shop_country}" + (f" ({shop_state})" if shop_state else "") + ".",
            }

        elif tool_name == "get_weather_forecast":
            import os
            import ssl
            import json as _json
            import urllib.request
            import urllib.parse

            forecast_days = min(int(args.get("forecast_days", 7)), 14)

            # Read shop location from profile.db or tool args
            country = str(args.get("country") or args.get("shop_country") or "").strip()
            pincode = str(args.get("pincode") or "").strip()
            city = str(args.get("city") or args.get("shop_city") or "").strip()
            state = str(args.get("state") or args.get("shop_state") or "").strip()
            lat = args.get("lat") or args.get("latitude")
            lon = args.get("lon") or args.get("longitude")
            geocoding_source = "open-meteo-geocoding (primary)"

            try:
                from services.profile_service import ProfileService

                profile = ProfileService.get_profile()
                if profile:
                    # If caller did NOT provide explicit city/state or coords in args, prioritize profile.db pinned pin
                    if not city and not pincode and lat is None and lon is None:
                        p_lat = profile.get("latitude")
                        p_lon = profile.get("longitude")
                        if p_lat is not None and p_lon is not None:
                            try:
                                lat = float(p_lat)
                                lon = float(p_lon)
                                geocoding_source = "user-map-pin (profile.db exact)"
                            except (ValueError, TypeError):
                                pass
                    if not country:
                        country = str(profile.get("country") or "").strip()
                    if not pincode:
                        pincode = str(profile.get("pincode") or "").strip()
                    if not city:
                        city = str(profile.get("city") or "").strip()
                    if not state:
                        state = str(profile.get("state") or "").strip()
            except Exception as _pe:
                _log.warning("Could not read profile for weather: %s", _pe)

            if not country:
                country = "India"

            ssl_ctx = ssl._create_unverified_context()
            headers = {"User-Agent": "InfoOS-POS/1.0 (infoos@local.dev)"}

            # -------------------------------------------------------------
            # DIRECT WEB GEOCODING: Worldwide Open-Meteo -> Fallback Nominatim OSM
            # (Skipped if exact coordinates were pinned by user in profile.db)
            # -------------------------------------------------------------
            if lat is None or lon is None:
                # Primary: Open-Meteo Geocoding (Worldwide)
                q_candidates = []
                if city and country:
                    q_candidates.append(f"{city}, {country}")
                if city and state and country:
                    q_candidates.append(f"{city}, {state}, {country}")
                if city:
                    q_candidates.append(city)
                if pincode and country:
                    q_candidates.append(f"{pincode}, {country}")

                for q_term in q_candidates:
                    try:
                        geo_url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(q_term)}&count=1&language=en&format=json"
                        req = urllib.request.Request(geo_url, headers=headers)
                        with urllib.request.urlopen(req, context=ssl_ctx, timeout=5) as r:
                            geo_res = _json.loads(r.read())
                            results = geo_res.get("results")
                            if results and len(results) > 0:
                                lat = float(results[0]["latitude"])
                                lon = float(results[0]["longitude"])
                                geocoding_source = f"open-meteo-geocoding ({q_term})"
                                break
                    except Exception as _ge:
                        _log.debug("Open-Meteo geocoding attempt failed for %s: %s", q_term, _ge)

            # Fallback: Nominatim OpenStreetMap Geocoding (Worldwide)
            if lat is None or lon is None:
                geocoding_source = "nominatim-osm (fallback)"
                osm_queries = []
                if pincode and country:
                    osm_queries.append(f"https://nominatim.openstreetmap.org/search?postalcode={urllib.parse.quote(pincode)}&country={urllib.parse.quote(country)}&format=json&limit=1")
                full_addr = " ".join(filter(None, [city, state, country])).strip()
                if full_addr:
                    osm_queries.append(f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(full_addr)}&format=json&limit=1")

                for osm_url in osm_queries:
                    try:
                        req = urllib.request.Request(osm_url, headers=headers)
                        with urllib.request.urlopen(req, context=ssl_ctx, timeout=5) as r:
                            osm_items = _json.loads(r.read())
                            if osm_items and len(osm_items) > 0:
                                lat = float(osm_items[0]["lat"])
                                lon = float(osm_items[0]["lon"])
                                break
                    except Exception as _oe:
                        _log.debug("Nominatim geocoding attempt failed: %s", _oe)

            # Safety fallback: Global Capital / Country Centroid Coordinates
            if lat is None or lon is None:
                WORLD_CENTROIDS = {
                    "us": (38.8951, -77.0364), "usa": (38.8951, -77.0364), "united states": (38.8951, -77.0364),
                    "uk": (51.5074, -0.1278), "gb": (51.5074, -0.1278), "united kingdom": (51.5074, -0.1278), "great britain": (51.5074, -0.1278),
                    "ca": (45.4215, -75.6972), "canada": (45.4215, -75.6972),
                    "au": (-33.8688, 151.2093), "australia": (-33.8688, 151.2093),
                    "sg": (1.3521, 103.8198), "singapore": (1.3521, 103.8198),
                    "ae": (25.2048, 55.2708), "uae": (25.2048, 55.2708), "united arab emirates": (25.2048, 55.2708), "dubai": (25.2048, 55.2708),
                    "de": (52.5200, 13.4050), "germany": (52.5200, 13.4050),
                    "fr": (48.8566, 2.3522), "france": (48.8566, 2.3522),
                    "jp": (35.6762, 139.6503), "japan": (35.6762, 139.6503),
                    "nz": (-41.2865, 174.7762), "new zealand": (-41.2865, 174.7762),
                    "in": (18.5204, 73.8567), "india": (18.5204, 73.8567),
                }
                c_key = country.strip().lower()
                lat, lon = WORLD_CENTROIDS.get(c_key, (18.5204, 73.8567))
                geocoding_source = f"default-centroid ({country})"

            # WMO weather code to condition label
            def _wmo_to_condition(code: int) -> str:
                if code == 0:
                    return "Clear / Sunny"
                elif code in (1, 2):
                    return "Partly Cloudy"
                elif code == 3:
                    return "Overcast"
                elif code in (51, 53, 55, 56, 57):
                    return "Light Rain"
                elif code in (61, 63, 65, 66, 67, 80, 81, 82):
                    return "Heavy Rain"
                elif code in (71, 73, 75, 77, 85, 86):
                    return "Snow"
                elif code in (95, 96, 99):
                    return "Thunderstorm"
                elif code in (45, 48):
                    return "Dense Fog"
                return "Partly Cloudy"

            WEATHER_MULTIPLIERS = {
                "Clear / Sunny": 1.05,
                "Partly Cloudy": 1.00,
                "Overcast": 0.95,
                "Light Rain": 0.85,
                "Heavy Rain": 0.65,
                "Snow": 0.70,
                "Thunderstorm": 0.60,
                "Dense Fog": 0.70,
            }

            forecast_rows = []
            weather_source = "open-meteo (primary)"

            # -------------------------------------------------------------
            # DIRECT WEATHER WEB REQUEST: Primary Open-Meteo -> Fallback wttr.in
            # -------------------------------------------------------------
            try:
                wm_url = (
                    f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
                    f"&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode"
                    f"&forecast_days={forecast_days}&timezone=Asia%2FKolkata"
                )
                req = urllib.request.Request(wm_url, headers=headers)
                with urllib.request.urlopen(req, context=ssl_ctx, timeout=7) as resp:
                    wdata = _json.loads(resp.read().decode("utf-8"))
                    daily = wdata.get("daily", {})
                    dates = daily.get("time", [])
                    max_temps = daily.get("temperature_2m_max", [])
                    min_temps = daily.get("temperature_2m_min", [])
                    precip_probs = daily.get("precipitation_probability_max", [])
                    weather_codes = daily.get("weathercode", [])

                    for i, d_str in enumerate(dates):
                        code = int(weather_codes[i]) if i < len(weather_codes) else 0
                        condition = _wmo_to_condition(code)
                        max_t = max_temps[i] if i < len(max_temps) else 0
                        min_t = min_temps[i] if i < len(min_temps) else 0
                        precip = precip_probs[i] if i < len(precip_probs) else 0

                        w_mult = WEATHER_MULTIPLIERS.get(condition, 1.0)
                        if max_t is not None and float(max_t) > 42:
                            w_mult = min(w_mult, 0.75)
                            condition = f"{condition} (Extreme Heat)"
                        elif max_t is not None and 18 <= float(max_t) <= 26:
                            w_mult = min(w_mult * 1.1, 1.2)

                        forecast_rows.append({
                            "date": d_str,
                            "condition": condition,
                            "max_temp_c": max_t,
                            "min_temp_c": min_t,
                            "precipitation_pct": precip,
                            "weather_multiplier": round(w_mult, 3),
                            "weather_note": (
                                "Revenue Dip Risk — activate delivery/takeaway promotions"
                                if w_mult < 0.75
                                else "Pleasant weather — full foot traffic expected"
                                if w_mult >= 1.1
                                else None
                            ),
                        })
            except Exception as _primary_err:
                _log.warning("Primary Open-Meteo weather request failed: %s; attempting wttr.in fallback", _primary_err)
                # FALLBACK: wttr.in JSON API
                try:
                    weather_source = "wttr.in (fallback)"
                    wttr_target = f"{lat},{lon}" if (lat and lon) else (city or "India")
                    wttr_url = f"https://wttr.in/{urllib.parse.quote(wttr_target)}?format=j1"
                    req = urllib.request.Request(wttr_url, headers=headers)
                    with urllib.request.urlopen(req, context=ssl_ctx, timeout=7) as resp:
                        wttr_data = _json.loads(resp.read().decode("utf-8"))
                        for d in wttr_data.get("weather", [])[:forecast_days]:
                            d_str = d.get("date")
                            max_t = float(d.get("maxtempC", 30))
                            min_t = float(d.get("mintempC", 20))
                            hourly = d.get("hourly", [])
                            mid_slot = hourly[len(hourly) // 2] if hourly else {}
                            cond_text = mid_slot.get("weatherDesc", [{}])[0].get("value", "Partly Cloudy").strip()
                            precip = float(mid_slot.get("chanceofrain", "0"))

                            cond_lower = cond_text.lower()
                            if "thunder" in cond_lower:
                                condition = "Thunderstorm"
                            elif "heavy rain" in cond_lower or "torrential" in cond_lower:
                                condition = "Heavy Rain"
                            elif "rain" in cond_lower or "drizzle" in cond_lower:
                                condition = "Light Rain"
                            elif "fog" in cond_lower or "mist" in cond_lower:
                                condition = "Dense Fog"
                            elif "overcast" in cond_lower:
                                condition = "Overcast"
                            elif "cloud" in cond_lower:
                                condition = "Partly Cloudy"
                            else:
                                condition = "Clear / Sunny"

                            w_mult = WEATHER_MULTIPLIERS.get(condition, 1.0)
                            if max_t > 42:
                                w_mult = min(w_mult, 0.75)
                            elif 18 <= max_t <= 26:
                                w_mult = min(w_mult * 1.1, 1.2)

                            forecast_rows.append({
                                "date": d_str,
                                "condition": condition,
                                "max_temp_c": max_t,
                                "min_temp_c": min_t,
                                "precipitation_pct": int(precip),
                                "weather_multiplier": round(w_mult, 3),
                                "weather_note": (
                                    "Revenue Dip Risk — activate delivery/takeaway promotions"
                                    if w_mult < 0.75
                                    else "Pleasant weather — full foot traffic expected"
                                    if w_mult >= 1.1
                                    else None
                                ),
                            })
                except Exception as _fb_err:
                    _log.error("Both weather APIs failed: %s", _fb_err)
                    return {"error": f"Weather web requests failed: Primary: {_primary_err}; Fallback: {_fb_err}"}

            return {
                "city": city,
                "state": state,
                "pincode": pincode,
                "lat": lat,
                "lon": lon,
                "geocoding_source": geocoding_source,
                "weather_source": weather_source,
                "forecast_days": len(forecast_rows),
                "forecast": forecast_rows,
                "data_source": f"Live Weather Web Request ({weather_source}) via coordinates ({lat:.4f}, {lon:.4f})",
            }

        elif tool_name == "run_sales_prediction":
            from datetime import date as _date, timedelta as _td

            predict_from_str = args.get(
                "predict_from", str(date.today() + timedelta(days=1))
            )
            predict_to_str = args.get(
                "predict_to", str(date.today() + timedelta(days=7))
            )
            include_product_forecast = bool(args.get("include_product_forecast", True))
            include_staffing = bool(args.get("include_staffing_recommendation", True))
            include_ci = bool(args.get("include_confidence_intervals", True))

            try:
                pred_from = _date.fromisoformat(predict_from_str)
                pred_to = _date.fromisoformat(predict_to_str)
            except ValueError:
                return {"error": "Invalid date format. Use YYYY-MM-DD."}

            if pred_from > pred_to:
                return {"error": "predict_from must be before or equal to predict_to."}
            if (pred_to - pred_from).days > 13:
                return {"error": "Prediction window cannot exceed 14 days."}

            forecast_days = (pred_to - pred_from).days + 1

            # --- STEP 1 + 2: Historical baseline & weekday weights ---
            history = _execute_read_tool_uncached(
                "get_sales_history_for_prediction",
                {"trailing_days": 90, "group_by": "weekday"},
            )
            weekday_data: Dict[str, Dict] = {}
            for wd_row in history.get("weekday_averages", []):
                weekday_data[wd_row["weekday"]] = wd_row

            overall_avg = history.get("overall_avg_daily_sales", 0) or 1.0
            data_points = history.get("data_points", 0)
            confidence_note = history.get("confidence_note", "LOW")

            if data_points < 7:
                return {
                    "error": (
                        "Insufficient historical data for prediction. "
                        f"Only {data_points} day(s) of sales data found. "
                        "Please return after at least 7 days of operation."
                    ),
                    "data_points": data_points,
                }

            # --- STEP 5 (opt): Top products ---
            top_products_raw = []
            if include_product_forecast:
                prod_result = _execute_read_tool_uncached(
                    "get_top_products_for_prediction",
                    {"top_n": 15, "trailing_days": 60},
                )
                top_products_raw = prod_result.get("products", [])

            # --- STEP 3: Festivals & holidays ---
            holidays_result = _execute_read_tool_uncached(
                "get_regional_festivals_and_holidays",
                {
                    "from_date": predict_from_str,
                    "to_date": predict_to_str,
                    "include_regional": True,
                    "include_national": True,
                    "include_dry_days": True,
                },
            )
            holiday_by_date: Dict[str, List] = {}
            for ev in holidays_result.get("events", []):
                holiday_by_date.setdefault(ev["date"], []).append(ev)

            # --- STEP 4: Weather forecast ---
            weather_result = _execute_read_tool_uncached(
                "get_weather_forecast",
                {"forecast_days": forecast_days},
            )
            weather_by_date: Dict[str, Dict] = {}
            for fw in weather_result.get("forecast", []):
                weather_by_date[fw["date"]] = fw

            # --- Profile context ---
            currency_symbol = "Rs."
            seating_capacity = 50
            business_type = "general"
            shop_name = "Your Shop"
            try:
                from services.profile_service import ProfileService

                profile = ProfileService.get_profile()
                if profile:
                    currency_symbol = profile.get("currency_symbol") or "Rs."
                    seating_capacity = int(profile.get("seating_capacity") or 50)
                    business_type = (profile.get("business_type") or "general").lower()
                    shop_name = profile.get("shop_name") or "Your Shop"
            except Exception:
                pass

            # Throughput multiplier by business type
            capacity_multiplier = 3.5 if "qsr" in business_type or "fast" in business_type else 1.8

            # --- STEP 6: WARMP assembly ---
            daily_forecast = []
            week_total_revenue = 0.0
            week_total_orders = 0

            cursor = pred_from
            day_index = 0
            while cursor <= pred_to:
                date_str = str(cursor)
                weekday_name = cursor.strftime("%A")

                # Base demand signal
                wd_info = weekday_data.get(weekday_name, {})
                bds = wd_info.get("avg_daily_sales", overall_avg)
                dow_weight = wd_info.get("dow_weight", 1.0)
                avg_orders = wd_info.get("avg_daily_orders", 0)

                # Holiday multiplier (highest H wins if multiple events)
                day_events = holiday_by_date.get(date_str, [])
                h_mult = max((ev["h_multiplier"] for ev in day_events), default=1.0)

                # Weather multiplier
                weather_info = weather_by_date.get(date_str, {})
                w_mult = weather_info.get("weather_multiplier", 1.0)

                # WARMP formula
                predicted_revenue = bds * dow_weight * h_mult * w_mult

                # Order count estimate (proportional to revenue change)
                composite = dow_weight * h_mult * w_mult
                predicted_orders = int(round(avg_orders * composite))

                # Confidence interval (widens with horizon)
                ci_pct = min(8 + day_index * 1.5, 28)
                ci_low = round(predicted_revenue * (1 - ci_pct / 100), 2)
                ci_high = round(predicted_revenue * (1 + ci_pct / 100), 2)

                # Capacity saturation check
                cap_alert = None
                if seating_capacity > 0 and predicted_orders > seating_capacity * capacity_multiplier:
                    cap_alert = (
                        f"PEAK SATURATION RISK: Predicted {predicted_orders} orders may exceed "
                        f"capacity ({seating_capacity} seats × {capacity_multiplier:.1f} throughput). "
                        "Consider queue management or advance booking."
                    )

                # Weather risk alert
                weather_alert = None
                if w_mult < 0.75:
                    weather_alert = (
                        f"REVENUE DIP RISK: {weather_info.get('condition', 'Bad weather')} expected. "
                        "Recommend activating delivery/takeaway promotions."
                    )

                # Festival opportunity flag
                festival_alert = None
                if h_mult > 1.4:
                    event_names = ", ".join(ev["name"] for ev in day_events)
                    festival_alert = (
                        f"FESTIVE SURGE OPPORTUNITY ({event_names}): "
                        "Schedule extra staff and pre-order inventory."
                    )

                signals = []
                if day_events:
                    signals.extend(ev["name"] for ev in day_events)
                if weather_info.get("condition"):
                    signals.append(f"{weather_info['condition']} {weather_info.get('max_temp_c', '')}°C")
                if not signals:
                    signals.append("Normal trading day")

                day_entry = {
                    "date": date_str,
                    "day": weekday_name,
                    "predicted_revenue": round(predicted_revenue, 2),
                    "predicted_orders": predicted_orders,
                    "key_signals": signals,
                    "h_multiplier": h_mult,
                    "weather_multiplier": w_mult,
                    "composite_multiplier": round(dow_weight * h_mult * w_mult, 4),
                }
                if include_ci:
                    day_entry["confidence_pct"] = round(ci_pct, 1)
                    day_entry["revenue_range_low"] = ci_low
                    day_entry["revenue_range_high"] = ci_high

                alerts = [a for a in [cap_alert, weather_alert, festival_alert] if a]
                if alerts:
                    day_entry["alerts"] = alerts

                # Product-level disaggregation
                if include_product_forecast and top_products_raw:
                    product_forecast = []
                    for prod in top_products_raw[:10]:
                        pred_qty = round(
                            prod.get("avg_daily_qty", 0) * composite, 1
                        )
                        product_forecast.append(
                            {
                                "name": prod["name"],
                                "predicted_qty": pred_qty,
                                "predicted_revenue": round(
                                    prod.get("total_revenue", 0)
                                    / max(data_points, 1)
                                    * composite,
                                    2,
                                ),
                            }
                        )
                    day_entry["product_forecast"] = product_forecast

                daily_forecast.append(day_entry)
                week_total_revenue += predicted_revenue
                week_total_orders += predicted_orders
                cursor += timedelta(days=1)
                day_index += 1

            # Staffing recommendations
            staffing = {}
            if include_staffing:
                for df in daily_forecast:
                    orders = df["predicted_orders"]
                    if orders > 150:
                        staff = {"kitchen": 5, "floor": 4}
                    elif orders > 100:
                        staff = {"kitchen": 4, "floor": 3}
                    elif orders > 60:
                        staff = {"kitchen": 3, "floor": 2}
                    else:
                        staff = {"kitchen": 2, "floor": 2}
                    staffing[df["date"]] = staff

            # Aggregate inventory suggestions from product forecasts
            inventory_suggestions = []
            if include_product_forecast and top_products_raw:
                for prod in top_products_raw[:5]:
                    total_pred_qty = sum(
                        next(
                            (
                                p["predicted_qty"]
                                for p in df.get("product_forecast", [])
                                if p["name"] == prod["name"]
                            ),
                            0,
                        )
                        for df in daily_forecast
                    )
                    if total_pred_qty > 0:
                        inventory_suggestions.append(
                            {
                                "product": prod["name"],
                                "predicted_total_qty_for_period": round(total_pred_qty, 1),
                                "recommendation": f"Prepare {round(total_pred_qty * 1.1, 1)} units (+10% buffer)",
                            }
                        )

            # Confidence summary
            avg_ci = (
                round(
                    sum(df.get("confidence_pct", 15) for df in daily_forecast)
                    / len(daily_forecast),
                    1,
                )
                if daily_forecast
                else 15.0
            )

            return {
                "shop": shop_name,
                "currency": currency_symbol,
                "predict_from": predict_from_str,
                "predict_to": predict_to_str,
                "forecast_days": forecast_days,
                "data_quality": confidence_note,
                "historical_data_points": data_points,
                "daily_forecast": daily_forecast,
                "period_total_predicted_revenue": round(week_total_revenue, 2),
                "period_total_predicted_orders": week_total_orders,
                "average_confidence_interval_pct": avg_ci,
                "staffing_by_date": staffing if include_staffing else {},
                "inventory_suggestions": inventory_suggestions if include_product_forecast else [],
                "location_context": {
                    "shop_state": holidays_result.get("shop_state", ""),
                    "shop_city": holidays_result.get("shop_city", ""),
                    "weather_api": weather_result.get("weather_source", "Open-Meteo (primary) / wttr.in (fallback)"),
                    "holiday_source": holidays_result.get("source", "Google Calendar feed (primary) / RandomAPI (fallback)"),
                    "geocoding": weather_result.get("geocoding_source", "Open-Meteo (primary) / Nominatim OSM (fallback)"),
                },
                "algorithm": "WARMP v1.0 — Weighted Additive Regression with Multi-factor Priors",
                "disclaimer": (
                    "Predictions are estimates based on historical patterns, weather forecasts, "
                    "and regional calendar data. Actual results may vary. Always apply operational judgment."
                ),
            }

        elif tool_name == "get_prediction_accuracy_report":
            # Placeholder: reads prediction_log if it exists, otherwise returns a guidance message
            evaluation_period_days = min(int(args.get("evaluation_period_days", 30)), 90)
            start_date = date.today() - timedelta(days=evaluation_period_days)

            try:
                from sqlalchemy import text

                result_rows = db.session.execute(
                    text(
                        "SELECT date, predicted_revenue, actual_revenue "
                        "FROM prediction_log WHERE date >= :start ORDER BY date ASC"
                    ),
                    {"start": str(start_date)},
                ).fetchall()

                if not result_rows:
                    return {
                        "status": "no_data",
                        "message": (
                            f"No prediction log entries found for the past {evaluation_period_days} days. "
                            "Accuracy reporting becomes available after the prediction engine has been running "
                            "and logging results. Run a prediction first to begin tracking accuracy."
                        ),
                        "evaluation_period_days": evaluation_period_days,
                    }

                errors = []
                for row in result_rows:
                    actual = float(row[2] or 0)
                    predicted = float(row[1] or 0)
                    if actual > 0:
                        ape = abs(predicted - actual) / actual * 100
                        errors.append(
                            {
                                "date": str(row[0]),
                                "predicted": predicted,
                                "actual": actual,
                                "absolute_error": round(abs(predicted - actual), 2),
                                "pct_error": round(ape, 2),
                            }
                        )

                mape = round(sum(e["pct_error"] for e in errors) / len(errors), 2) if errors else 0
                mae = round(sum(e["absolute_error"] for e in errors) / len(errors), 2) if errors else 0

                return {
                    "evaluation_period_days": evaluation_period_days,
                    "records_evaluated": len(errors),
                    "mape_pct": mape,
                    "mae": mae,
                    "accuracy_rating": (
                        "EXCELLENT (MAPE < 10%)"
                        if mape < 10
                        else "GOOD (MAPE 10-20%)"
                        if mape < 20
                        else "ACCEPTABLE (MAPE 20-30%)"
                        if mape < 30
                        else "NEEDS CALIBRATION (MAPE > 30%)"
                    ),
                    "daily_errors": errors,
                }
            except Exception as _ace:
                return {
                    "status": "prediction_log_not_found",
                    "message": (
                        "The prediction_log table does not exist yet. "
                        "It will be created automatically after the first run_sales_prediction call is logged. "
                        f"(Detail: {_ace})"
                    ),
                    "evaluation_period_days": evaluation_period_days,
                }

        return {"error": f"Unrecognized read tool {tool_name}"}


    except Exception as e:
        _log.error("Error executing read tool %s: %s", tool_name, e)
        return {"error": f"Tool execution failed: {str(e)}"}


def execute_read_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a read-only tool with caching to prevent duplicate database scans."""
    cached = _get_cached_tool_result(tool_name, args)
    if cached is not None:
        return cached

    result = _execute_read_tool_uncached(tool_name, args)
    _set_cached_tool_result(tool_name, args, result)
    return result


# =============================================================================
# MUTATING TOOL EXECUTION IMPLEMENTATIONS
# =============================================================================


def _execute_mutating_tool_impl(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a validated mutating tool and flush tool cache."""
    clear_tool_cache()

    try:
        if tool_name == "propose_adjust_stock":
            delta = float(args.get("delta_quantity", 0))
            reason = args.get("reason", "Manual adjustment")
            prod_id = args.get("product_id")
            inv_id = args.get("inventory_id")

            item = None
            if inv_id:
                item = db.session.get(Inventory, int(inv_id))
            elif prod_id:
                item = Inventory.query.filter_by(product_id=prod_id).first()

            if not item:
                return {"success": False, "error": "Inventory item not found"}

            if item.stock + delta < 0:
                return {
                    "success": False,
                    "error": f"Stock adjustment of {delta} would take '{item.name}' below zero (current stock: {item.stock}).",
                }

            old_stock = item.stock
            item.stock = round(item.stock + delta, 2)
            db.session.commit()
            return {
                "success": True,
                "item_name": item.name,
                "old_stock": old_stock,
                "new_stock": item.stock,
                "delta": delta,
                "reason": reason,
            }

        elif tool_name == "propose_bulk_stock_adjustment":
            adjustments = args.get("adjustments", [])
            note = args.get("batch_note", "Batch Stock Adjustment")
            applied = []

            for adj in adjustments:
                inv_id = adj.get("inventory_id")
                prod_id = adj.get("product_id")
                delta = float(adj.get("delta_quantity", 0))
                reason = adj.get("reason", note)

                item = None
                if inv_id:
                    item = db.session.get(Inventory, int(inv_id))
                elif prod_id:
                    item = Inventory.query.filter_by(product_id=prod_id).first()

                if item:
                    old_stock = item.stock
                    item.stock = max(0.0, item.stock + delta)
                    applied.append(
                        {
                            "item_name": item.name,
                            "old_stock": old_stock,
                            "new_stock": item.stock,
                            "delta": delta,
                            "reason": reason,
                        }
                    )

            db.session.commit()
            return {
                "success": True,
                "batch_note": note,
                "updated_count": len(applied),
                "adjustments_applied": applied,
            }

        elif tool_name == "propose_update_threshold":
            inv_id = int(args.get("inventory_id"))
            thresh = float(args.get("alert_threshold"))
            item = db.session.get(Inventory, inv_id)
            if not item:
                return {"success": False, "error": f"Inventory #{inv_id} not found"}

            item.alert_threshold = thresh
            db.session.commit()
            return {"success": True, "item_name": item.name, "alert_threshold": thresh}

        elif tool_name == "propose_create_raw_material":
            name = args.get("name")
            unit = args.get("unit", "kg")
            unit_price = float(args.get("unit_price", 0))
            alert_thresh = float(args.get("alert_threshold", 5.0))
            initial_stock = float(args.get("initial_stock", 0.0))

            item = Inventory(
                name=name,
                type="RAW_MATERIAL",
                unit=unit,
                unit_price=unit_price,
                alert_threshold=alert_thresh,
                stock=initial_stock,
            )
            db.session.add(item)
            db.session.commit()
            return {
                "success": True,
                "inventory_id": item.id,
                "name": item.name,
                "unit": item.unit,
                "stock": item.stock,
                "unit_price": item.unit_price,
            }

        elif tool_name == "propose_update_inventory_item":
            inv_id = int(args.get("inventory_id"))
            item = db.session.get(Inventory, inv_id)
            if not item:
                return {"success": False, "error": f"Inventory #{inv_id} not found"}

            if "name" in args:
                item.name = args["name"]
            if "unit" in args:
                item.unit = args["unit"]
            if "unit_price" in args:
                item.unit_price = float(args["unit_price"])
            if "alert_threshold" in args:
                item.alert_threshold = float(args["alert_threshold"])

            db.session.commit()
            return {"success": True, "inventory_id": item.id, "name": item.name}

        elif tool_name == "propose_reset_stock_count":
            inv_id = args.get("inventory_id")
            prod_id = args.get("product_id")
            count = float(args.get("physical_count", 0))
            reason = args.get("reason", "Stock count reconciliation")

            item = None
            if inv_id:
                item = db.session.get(Inventory, int(inv_id))
            elif prod_id:
                item = Inventory.query.filter_by(product_id=prod_id).first()

            if not item:
                return {"success": False, "error": "Inventory item not found"}

            old_stock = item.stock
            item.stock = max(0.0, count)
            db.session.commit()
            return {
                "success": True,
                "item_name": item.name,
                "old_stock": old_stock,
                "reconciled_stock": item.stock,
                "reason": reason,
            }

        elif tool_name == "propose_create_product":
            name = args.get("name")
            price = float(args.get("price"))
            takeaway_price = (
                float(args.get("takeaway_price")) if args.get("takeaway_price") else None
            )
            cat_id = args.get("category_id")
            desc_text = args.get("description")
            vars_list = args.get("variations", [])

            p_id = f"PROD_{int(datetime.now().timestamp())}"
            p = Product(
                product_id=p_id,
                name=name,
                price=price,
                takeaway_price=takeaway_price,
                category_id=cat_id,
                description=desc_text,
                variations=json.dumps(vars_list),
                active=True,
            )
            db.session.add(p)
            db.session.commit()
            return {"success": True, "product_id": p_id, "name": name, "price": price}

        elif tool_name == "propose_update_product":
            p_id = args.get("product_id")
            p = Product.query.get(p_id)
            if not p:
                return {"success": False, "error": f"Product {p_id} not found"}

            if "name" in args:
                p.name = args["name"]
            if "price" in args:
                p.price = float(args["price"])
            if "takeaway_price" in args:
                p.takeaway_price = float(args["takeaway_price"])
            if "category_id" in args:
                p.category_id = int(args["category_id"])
            if "description" in args:
                p.description = args["description"]
            if "active" in args:
                p.active = bool(args["active"])

            db.session.commit()
            return {"success": True, "product_id": p_id, "name": p.name}

        elif tool_name == "propose_variation_update":
            p_id = args.get("product_id")
            vars_list = args.get("variations", [])
            p = Product.query.get(p_id)
            if not p:
                return {"success": False, "error": f"Product {p_id} not found"}

            p.variations = json.dumps(vars_list)
            db.session.commit()
            return {"success": True, "product_id": p_id, "variations": vars_list}

        elif tool_name == "propose_group_reorder":
            orders = args.get("group_orders", [])
            for item in orders:
                gid = item.get("group_id")
                d_order = item.get("display_order", 0)
                grp = db.session.get(ItemGroup, int(gid))
                if grp:
                    grp.display_order = d_order
            db.session.commit()
            return {"success": True, "message": "Group display sequence updated"}

        elif tool_name == "propose_toggle_group_status":
            gid = int(args.get("group_id"))
            is_active = bool(args.get("is_active"))
            grp = db.session.get(ItemGroup, gid)
            if not grp:
                return {"success": False, "error": f"Item group #{gid} not found"}

            grp.is_active = is_active
            db.session.commit()
            return {"success": True, "group_id": gid, "is_active": is_active}

        elif tool_name == "propose_create_category":
            name = args.get("name")
            gid = args.get("group_id")
            description = args.get("description")

            cat = Category(name=name, group_id=gid, description=description, active=True)
            db.session.add(cat)
            db.session.commit()
            return {"success": True, "category_id": cat.id, "name": cat.name}

        elif tool_name == "propose_create_item_group":
            name = args.get("name")
            desc_text = args.get("description")
            d_order = int(args.get("display_order", 0))
            color = args.get("color")

            grp = ItemGroup(
                name=name, description=desc_text, display_order=d_order, color=color, is_active=True
            )
            db.session.add(grp)
            db.session.commit()
            return {"success": True, "group_id": grp.id, "name": grp.name}

        elif tool_name == "propose_update_category":
            cid = int(args.get("category_id"))
            cat = db.session.get(Category, cid)
            if not cat:
                return {"success": False, "error": f"Category #{cid} not found"}

            if "name" in args:
                cat.name = args["name"]
            if "group_id" in args:
                cat.group_id = int(args["group_id"])
            if "description" in args:
                cat.description = args["description"]
            if "active" in args:
                cat.active = bool(args["active"])

            db.session.commit()
            return {"success": True, "category_id": cat.id, "name": cat.name}

        elif tool_name == "propose_bulk_update_prices":
            pct = args.get("percentage_change")
            flat = args.get("flat_change")
            cat_id = args.get("category_id")
            p_ids = args.get("product_ids", [])

            query = Product.query
            if cat_id:
                query = query.filter_by(category_id=cat_id)
            if p_ids:
                query = query.filter(Product.product_id.in_(p_ids))

            prods = query.all()
            if not prods:
                return {"success": False, "error": "No matching products found to update."}

            updated = []
            for p in prods:
                old_price = p.price
                if pct is not None:
                    p.price = max(0.0, round(p.price * (1.0 + float(pct) / 100.0), 2))
                elif flat is not None:
                    p.price = max(0.0, round(p.price + float(flat), 2))
                updated.append(
                    {
                        "product_id": p.product_id,
                        "name": p.name,
                        "old_price": old_price,
                        "new_price": p.price,
                    }
                )

            db.session.commit()
            return {"success": True, "updated_count": len(updated), "price_changes": updated}

        elif tool_name == "propose_bulk_toggle_products":
            active_val = bool(args.get("active"))
            cat_id = args.get("category_id")
            p_ids = args.get("product_ids", [])

            query = Product.query
            if cat_id:
                query = query.filter_by(category_id=cat_id)
            if p_ids:
                query = query.filter(Product.product_id.in_(p_ids))

            prods = query.all()
            for p in prods:
                p.active = active_val

            db.session.commit()
            return {
                "success": True,
                "updated_count": len(prods),
                "new_status": "active" if active_val else "disabled",
            }

        elif tool_name == "propose_delete_category":
            cid = int(args.get("category_id"))
            cat = db.session.get(Category, cid)
            if not cat:
                return {"success": False, "error": f"Category #{cid} not found"}

            snapshot = UndoService.capture_category_snapshot(cat)
            usage = _db_svc.is_category_used(cid)
            if usage["used"]:
                cat.active = False
                db.session.commit()
                return {
                    "success": True,
                    "action": "deactivated",
                    "snapshot": snapshot,
                    "message": f"Category #{cid} ('{cat.name}') is linked to products and was deactivated instead of deleted.",
                }
            else:
                _db_svc.delete_category(cid)
                db.session.commit()
                return {
                    "success": True,
                    "action": "deleted",
                    "snapshot": snapshot,
                    "message": f"Category #{cid} ('{cat.name}') deleted.",
                }

        elif tool_name == "propose_delete_item_group":
            gid = int(args.get("group_id"))
            action = args.get("action", "delete")
            move_to = args.get("move_to")

            grp = db.session.get(ItemGroup, gid)
            if not grp:
                return {"success": False, "error": f"Item group #{gid} not found"}

            active_cats = Category.query.filter_by(group_id=gid, active=True).count()
            if active_cats > 0 and action != "move":
                return {
                    "success": False,
                    "error": f"Group #{gid} contains {active_cats} active category/categories. Please specify move_to target group.",
                }

            snapshot = UndoService.capture_item_group_snapshot(grp)
            if action == "move" and move_to:
                Category.query.filter_by(group_id=gid).update({"group_id": int(move_to)})

            _db_svc.delete_group(gid)
            db.session.commit()
            return {
                "success": True,
                "snapshot": snapshot,
                "message": f"Item group #{gid} ('{grp.name}') deleted.",
            }

        elif tool_name == "propose_create_bill":
            items = args.get("items", [])
            pmethod = args.get("payment_method", "CASH").upper()
            otype = args.get("order_type", "dine-in")
            cname = args.get("customer_name") or ""
            cphone = args.get("customer_mobile") or ""
            table = args.get("table_no") or ""

            from services.db_service import DatabaseService
            from routes.billing import _validate_bill_products

            _db_svc_inst = DatabaseService()

            try:
                validated_products, total = _validate_bill_products(items, otype)
            except Exception as val_err:
                return {"success": False, "error": str(val_err)}

            bill_data = {
                "customer_name": cname,
                "customer_mobile": cphone,
                "total_amount": total,
                "items": validated_products,
                "payment_method": pmethod,
                "payment_status": "paid",
                "order_type": otype,
                "table_no": table,
            }
            new_bill_no = _db_svc_inst.create_bill(bill_data)
            if not new_bill_no:
                return {"success": False, "error": "Failed to create bill in database."}

            created_bill = Bill.query.filter_by(bill_no=new_bill_no).first()
            token_no = created_bill.today_token if created_bill else 0

            return {
                "success": True,
                "bill_no": new_bill_no,
                "token_no": token_no,
                "total_amount": total,
                "payment_method": pmethod,
            }

        elif tool_name == "propose_split_payment_bill":
            items = args.get("items", [])
            cash = float(args.get("cash_amount", 0))
            online = float(args.get("online_amount", 0))
            otype = args.get("order_type", "dine-in")
            cname = args.get("customer_name") or ""
            cphone = args.get("customer_mobile") or ""
            table = args.get("table_no") or ""

            from services.db_service import DatabaseService
            from routes.billing import _validate_bill_products

            _db_svc_inst = DatabaseService()

            try:
                validated_products, total = _validate_bill_products(items, otype)
            except Exception as val_err:
                return {"success": False, "error": str(val_err)}

            bill_data = {
                "customer_name": cname,
                "customer_mobile": cphone,
                "total_amount": round(cash + online, 2) or total,
                "items": validated_products,
                "payment_method": f"SPLIT (Cash: ₹{cash}, Online: ₹{online})",
                "payment_status": "paid",
                "order_type": otype,
                "table_no": table,
            }
            new_bill_no = _db_svc_inst.create_bill(bill_data)
            if not new_bill_no:
                return {"success": False, "error": "Failed to create split bill in database."}

            created_bill = Bill.query.filter_by(bill_no=new_bill_no).first()
            token_no = created_bill.today_token if created_bill else 0

            return {
                "success": True,
                "bill_no": new_bill_no,
                "token_no": token_no,
                "total_amount": round(cash + online, 2) or total,
            }

        elif tool_name == "propose_hold_bill":
            items = args.get("items", [])
            cname = args.get("customer_name")
            cphone = args.get("customer_mobile")
            table = args.get("table_no")
            otype = args.get("order_type", "dine-in")

            enriched = []
            tot = 0.0
            for it in items:
                p_id = it.get("product_id")
                qty = float(it.get("quantity", 1))
                prod = Product.query.get(p_id)
                price = prod.price if prod else 0.0
                tot += price * qty
                enriched.append(
                    {
                        "product_id": p_id,
                        "name": prod.name if prod else "Item",
                        "price": price,
                        "quantity": qty,
                    }
                )

            max_bill_no = db.session.query(func.max(Bill.bill_no)).scalar() or 1000
            bill = Bill(
                bill_no=max_bill_no + 1,
                today_token=0,
                customer_name=cname or "Held Order",
                customer_mobile=cphone,
                total_amount=round(tot, 2),
                payment_method="HELD",
                items=json.dumps(enriched),
                order_type=otype,
                table_no=table,
                status="HELD",
            )
            db.session.add(bill)
            db.session.commit()
            return {
                "success": True,
                "bill_no": bill.bill_no,
                "status": "HELD",
                "total_amount": bill.total_amount,
            }

        elif tool_name == "propose_recall_hold_bill":
            b_no = int(args.get("bill_no"))
            pmethod = args.get("payment_method", "CASH").upper()
            bill = Bill.query.filter_by(bill_no=b_no, status="HELD").first()
            if not bill:
                return {"success": False, "error": f"Held bill #{b_no} not found"}

            today = date.today()
            max_token = (
                db.session.query(func.max(Bill.today_token))
                .filter(func.date(Bill.created_at) == today)
                .scalar()
                or 0
            )

            bill.status = "CONFIRMED"
            bill.today_token = max_token + 1
            bill.payment_method = pmethod
            db.session.commit()
            return {
                "success": True,
                "bill_no": bill.bill_no,
                "token_no": bill.today_token,
                "status": "CONFIRMED",
            }

        elif tool_name == "propose_apply_bill_discount":
            b_no = int(args.get("bill_no"))
            dtype = args.get("discount_type")
            dval = float(args.get("discount_value", 0))
            reason = args.get("reason", "Discount")

            bill = Bill.query.filter_by(bill_no=b_no).first()
            if not bill:
                return {"success": False, "error": f"Bill #{b_no} not found"}

            old_total = bill.total_amount
            if dtype == "percentage":
                discount_amt = old_total * (dval / 100.0)
            else:
                discount_amt = dval

            new_total = max(0.0, round(old_total - discount_amt, 2))
            bill.total_amount = new_total
            db.session.commit()
            return {
                "success": True,
                "bill_no": b_no,
                "old_total": old_total,
                "discount_applied": round(discount_amt, 2),
                "new_total": new_total,
                "reason": reason,
            }

        elif tool_name == "propose_void_bill":
            b_no = int(args.get("bill_no"))
            reason = args.get("reason", "Voided by admin")

            bill = Bill.query.filter(
                Bill.bill_no == b_no,
                func.date(Bill.created_at) == date.today(),
            ).first()
            if not bill:
                return {
                    "success": False,
                    "error": f"Bill #{b_no} is not a valid same-day bill or was not found; please cancel manually in Settings > Billing if past-date.",
                }

            from services.db_service import DatabaseService

            _db_svc_inst = DatabaseService()
            cancelled = _db_svc_inst.cancel_bill(bill.id)
            if not cancelled:
                return {"success": False, "error": f"Failed to cancel bill #{b_no}"}

            return {"success": True, "bill_no": b_no, "status": "CANCELLED", "reason": reason}

        elif tool_name == "propose_create_worker":
            name = args.get("name")
            salary_val = args.get("salary")
            salary = float(salary_val) if salary_val not in (None, "") else 0.0
            role = args.get("role", "Staff")
            desc_text = args.get("description")
            phone = args.get("phone")
            j_date = args.get("join_date") or date.today().isoformat()

            worker_data = {
                "name": name,
                "salary": salary,
                "role": role,
                "description": desc_text,
                "phone": phone,
                "join_date": j_date,
                "status": "active",
            }
            w = WorkerService.create_worker(worker_data)
            return {"success": True, "worker_id": w.worker_id, "name": w.name, "role": w.role}

        elif tool_name == "propose_update_worker":
            w_id = args.get("worker_id")
            w = Worker.query.get(w_id)
            if not w:
                return {"success": False, "error": f"Worker {w_id} not found"}

            if "name" in args:
                w.name = args["name"]
            if "phone" in args:
                w.phone = args["phone"]
            if "role" in args:
                w.role = args["role"]
            if "salary" in args:
                w.salary = float(args["salary"])
            if "description" in args:
                w.description = args["description"]
            if "status" in args:
                w.status = args["status"]

            db.session.commit()
            return {"success": True, "worker_id": w_id, "name": w.name}

        elif tool_name == "propose_mark_attendance":
            w_id = args.get("worker_id")
            stat = args.get("status")
            t_date_str = args.get("target_date") or date.today().isoformat()
            t_date = datetime.strptime(t_date_str, "%Y-%m-%d").date()

            rec = Attendance.query.filter_by(worker_id=w_id, date=t_date).first()
            if rec:
                rec.status = stat
            else:
                rec = Attendance(worker_id=w_id, date=t_date, status=stat)
                db.session.add(rec)

            db.session.commit()
            return {"success": True, "worker_id": w_id, "date": t_date_str, "status": stat}

        elif tool_name == "propose_bulk_mark_attendance":
            stat = args.get("status", "Present")
            t_date_str = args.get("target_date") or date.today().isoformat()
            t_date = datetime.strptime(t_date_str, "%Y-%m-%d").date()
            worker_ids = args.get("worker_ids")

            if worker_ids:
                workers = Worker.query.filter(Worker.worker_id.in_(worker_ids)).all()
            else:
                workers = Worker.query.filter_by(status="active").all()

            for w in workers:
                rec = Attendance.query.filter_by(worker_id=w.worker_id, date=t_date).first()
                if rec:
                    rec.status = stat
                else:
                    rec = Attendance(worker_id=w.worker_id, date=t_date, status=stat)
                    db.session.add(rec)

            db.session.commit()
            return {
                "success": True,
                "marked_count": len(workers),
                "date": t_date_str,
                "status": stat,
            }

        elif tool_name == "propose_record_advance":
            w_id = args.get("worker_id")
            amt = float(args.get("amount"))
            reason = args.get("reason", "Advance")

            w = Worker.query.get(w_id)
            if not w:
                return {"success": False, "error": f"Worker {w_id} not found"}

            adv = WorkerService.add_advance(w_id, amt, reason)
            return {
                "success": True,
                "worker_name": w.name,
                "amount": amt,
                "reason": reason,
                "advance_id": adv.advance_id if adv else None,
            }

        elif tool_name == "propose_create_worker_role":
            name = args.get("name")
            desc_text = args.get("description")
            wtype = WorkerType(name=name, description=desc_text, is_active=True)
            db.session.add(wtype)
            db.session.commit()
            return {"success": True, "role_id": wtype.id, "name": wtype.name}

        elif tool_name == "propose_log_expense":
            title = args.get("title")
            cat = args.get("category")
            amt = float(args.get("amount"))
            pmethod = args.get("payment_method", "Cash")
            notes = args.get("notes")

            exp = Expense(
                title=title, category=cat, amount=amt, payment_method=pmethod, notes=notes
            )
            db.session.add(exp)
            db.session.commit()
            return {
                "success": True,
                "expense_id": exp.id,
                "title": title,
                "amount": amt,
                "category": cat,
            }

        elif tool_name == "propose_bulk_log_expenses":
            expenses_list = args.get("expenses", [])
            batch_note = args.get("batch_note", "Batch Petty Cash Expenses")
            created_ids = []

            for item in expenses_list:
                title = item.get("title")
                cat = item.get("category")
                amt = float(item.get("amount", 0))
                pmethod = item.get("payment_method", "Cash")
                notes = item.get("notes", batch_note)

                exp = Expense(
                    title=title, category=cat, amount=amt, payment_method=pmethod, notes=notes
                )
                db.session.add(exp)
                created_ids.append(exp.id)

            db.session.commit()
            return {"success": True, "batch_note": batch_note, "logged_count": len(created_ids)}

        elif tool_name == "propose_update_expense":
            e_id = args.get("expense_id")
            exp = Expense.query.get(e_id)
            if not exp:
                return {"success": False, "error": f"Expense #{e_id} not found"}

            if "title" in args:
                exp.title = args["title"]
            if "category" in args:
                exp.category = args["category"]
            if "amount" in args:
                exp.amount = float(args["amount"])
            if "payment_method" in args:
                exp.payment_method = args["payment_method"]
            if "notes" in args:
                exp.notes = args["notes"]

            db.session.commit()
            return {"success": True, "expense_id": e_id, "title": exp.title, "amount": exp.amount}

        elif tool_name == "propose_expense_type":
            name = args.get("name")
            desc_text = args.get("description")
            etype = ExpenseType(name=name, description=desc_text, is_active=True)
            db.session.add(etype)
            db.session.commit()
            return {"success": True, "type_id": etype.id, "name": etype.name}

        elif tool_name == "propose_update_expense_type":
            t_id = int(args.get("type_id"))
            etype = db.session.get(ExpenseType, t_id)
            if not etype:
                return {"success": False, "error": f"Expense type #{t_id} not found"}

            if "name" in args:
                etype.name = args["name"]
            if "description" in args:
                etype.description = args["description"]
            if "is_active" in args:
                etype.is_active = bool(args["is_active"])

            db.session.commit()
            return {"success": True, "type_id": t_id, "name": etype.name}

        elif tool_name == "propose_delete_expense":
            e_id = args.get("expense_id")
            exp = Expense.query.get(e_id)
            if not exp:
                return {"success": False, "error": f"Expense #{e_id} not found."}

            snapshot = UndoService.capture_expense_snapshot(exp)
            db.session.delete(exp)
            db.session.commit()
            return {
                "success": True,
                "snapshot": snapshot,
                "message": f"Expense voucher #{e_id} ('{snapshot['title']}') deleted.",
            }

        elif tool_name == "propose_delete_expense_type":
            t_id = int(args.get("type_id"))
            etype = db.session.get(ExpenseType, t_id)
            if not etype:
                return {"success": False, "error": f"Expense type #{t_id} not found."}

            count = Expense.query.filter_by(category=etype.name).count()
            if count > 0:
                return {
                    "success": False,
                    "error": f"Cannot delete expense type. {count} expense(s) are using this type.",
                }

            snapshot = UndoService.capture_expense_type_snapshot(etype)
            db.session.delete(etype)
            db.session.commit()
            return {
                "success": True,
                "snapshot": snapshot,
                "message": f"Expense type #{t_id} ('{etype.name}') deleted.",
            }

        elif tool_name == "propose_bulk_delete_expenses":
            filt = args.get("filter") or args
            query = Expense.query
            has_filter = False

            if filt.get("category"):
                query = query.filter_by(category=filt["category"])
                has_filter = True
            if filt.get("start_date"):
                query = query.filter(func.date(Expense.date) >= filt["start_date"])
                has_filter = True
            if filt.get("end_date"):
                query = query.filter(func.date(Expense.date) <= filt["end_date"])
                has_filter = True
            if filt.get("min_amount") is not None:
                query = query.filter(Expense.amount >= float(filt["min_amount"]))
                has_filter = True
            if filt.get("max_amount") is not None:
                query = query.filter(Expense.amount <= float(filt["max_amount"]))
                has_filter = True
            if filt.get("expense_ids"):
                query = query.filter(Expense.id.in_(filt["expense_ids"]))
                has_filter = True

            if not has_filter:
                return {
                    "success": False,
                    "error": "Unbounded bulk delete rejected. Please provide constraints.",
                }

            matched = query.all()
            if len(matched) > 500:
                return {
                    "success": False,
                    "error": f"Bulk delete exceeds safety limit ({len(matched)} > 500 rows).",
                }

            snapshots = [UndoService.capture_expense_snapshot(e) for e in matched]
            batch_id = f"batch_exp_{int(datetime.now().timestamp())}"
            for e in matched:
                db.session.delete(e)
            db.session.commit()
            return {
                "success": True,
                "batch_id": batch_id,
                "deleted_count": len(snapshots),
                "snapshots": snapshots,
                "message": f"Successfully deleted {len(snapshots)} expense vouchers (Batch ID: {batch_id}).",
            }

        elif tool_name == "propose_create_reminder":
            title = args.get("title")
            r_time_str = args.get("reminder_time", "")
            rpt = args.get("repeat_type", "once")
            desc_text = args.get("description")

            clean_time = r_time_str.replace("T", " ").replace("Z", "")
            rem_time = (
                datetime.strptime(clean_time, "%Y-%m-%d %H:%M:%S")
                if len(clean_time) > 10
                else datetime.strptime(clean_time, "%Y-%m-%d")
            )
            rem = Reminder(
                title=title,
                reminder_time=rem_time,
                repeat_type=rpt,
                description=desc_text,
                status="pending",
            )
            db.session.add(rem)
            db.session.commit()
            return {
                "success": True,
                "reminder_id": rem.id,
                "title": title,
                "reminder_time": str(rem_time),
            }

        elif tool_name == "propose_bulk_create_reminders":
            tasks = args.get("tasks", [])
            t_name = args.get("template_name", "Checklist")
            created_ids = []

            for t in tasks:
                title = t.get("title")
                r_time_str = t.get("reminder_time", "")
                rpt = t.get("repeat_type", "daily")
                clean_time = r_time_str.replace("T", " ").replace("Z", "")
                rem_time = (
                    datetime.strptime(clean_time, "%Y-%m-%d %H:%M:%S")
                    if len(clean_time) > 10
                    else datetime.strptime(clean_time, "%Y-%m-%d")
                )
                rem = Reminder(
                    title=title,
                    reminder_time=rem_time,
                    repeat_type=rpt,
                    description=f"From {t_name}",
                    status="pending",
                )
                db.session.add(rem)
                created_ids.append(rem.id)

            db.session.commit()
            return {"success": True, "template": t_name, "scheduled_count": len(created_ids)}

        elif tool_name == "propose_snooze_reminder":
            r_id = args.get("reminder_id")
            mins = int(args.get("minutes", 30))
            rem = Reminder.query.get(r_id)
            if not rem:
                return {"success": False, "error": f"Reminder #{r_id} not found"}

            rem.reminder_time = rem.reminder_time + timedelta(minutes=mins)
            rem.status = "pending"
            db.session.commit()
            return {
                "success": True,
                "reminder_id": r_id,
                "new_time": rem.reminder_time.strftime("%Y-%m-%d %H:%M"),
            }

        elif tool_name == "propose_complete_reminder":
            r_id = args.get("reminder_id")
            rem = Reminder.query.get(r_id)
            if not rem:
                return {"success": False, "error": f"Reminder #{r_id} not found"}

            rem.status = "completed"
            db.session.commit()
            return {"success": True, "reminder_id": r_id, "status": "completed"}

        elif tool_name == "propose_update_reminder":
            r_id = args.get("reminder_id")
            rem = Reminder.query.get(r_id)
            if not rem:
                return {"success": False, "error": f"Reminder #{r_id} not found"}

            if "title" in args:
                rem.title = args["title"]
            if "description" in args:
                rem.description = args["description"]
            if "repeat_type" in args:
                rem.repeat_type = args["repeat_type"]
            if "reminder_time" in args:
                clean_time = args["reminder_time"].replace("T", " ").replace("Z", "")
                rem.reminder_time = (
                    datetime.strptime(clean_time, "%Y-%m-%d %H:%M:%S")
                    if len(clean_time) > 10
                    else datetime.strptime(clean_time, "%Y-%m-%d")
                )

            db.session.commit()
            return {"success": True, "reminder_id": r_id, "title": rem.title}

        elif tool_name == "propose_delete_reminder":
            r_id = args.get("reminder_id")
            rem = Reminder.query.get(r_id)
            if not rem:
                return {"success": False, "error": f"Reminder #{r_id} not found."}

            snapshot = UndoService.capture_reminder_snapshot(rem)
            try:
                Notification.query.filter_by(related_id=rem.id).delete()
            except Exception:
                pass
            db.session.delete(rem)
            db.session.commit()
            return {
                "success": True,
                "snapshot": snapshot,
                "message": f"Reminder #{r_id} ('{snapshot['title']}') deleted.",
            }

        elif tool_name == "delete_notification":
            n_id = args.get("notification_id")
            notif = Notification.query.get(n_id)
            if not notif:
                return {"success": False, "error": f"Notification #{n_id} not found."}

            db.session.delete(notif)
            db.session.commit()
            return {"success": True, "message": f"Notification #{n_id} deleted."}

        elif tool_name == "propose_mark_all_notifications_read":
            unread = Notification.query.filter(Notification.read_at == None).all()
            for n in unread:
                n.read_at = datetime.now()
                n.status = "read"
            db.session.commit()
            return {
                "success": True,
                "marked_count": len(unread),
                "message": f"Marked {len(unread)} notifications as read.",
            }

        elif tool_name == "propose_bulk_delete_reminders":
            filt = args.get("filter") or args
            query = Reminder.query
            has_filter = False

            if filt.get("status") and filt["status"] != "all":
                query = query.filter_by(status=filt["status"])
                has_filter = True
            if filt.get("before_date"):
                query = query.filter(func.date(Reminder.reminder_time) <= filt["before_date"])
                has_filter = True
            if filt.get("reminder_ids"):
                query = query.filter(Reminder.id.in_(filt["reminder_ids"]))
                has_filter = True

            if not has_filter:
                return {
                    "success": False,
                    "error": "Unbounded bulk delete rejected. Please specify status, date, or IDs.",
                }

            matched = query.all()
            if len(matched) > 500:
                return {
                    "success": False,
                    "error": f"Exceeded safety cap ({len(matched)} > 500 rows).",
                }

            snapshots = [UndoService.capture_reminder_snapshot(r) for r in matched]
            batch_id = f"batch_rem_{int(datetime.now().timestamp())}"

            for r in matched:
                try:
                    Notification.query.filter_by(related_id=r.id).delete()
                except Exception:
                    pass
                db.session.delete(r)
            db.session.commit()

            return {
                "success": True,
                "batch_id": batch_id,
                "deleted_count": len(snapshots),
                "snapshots": snapshots,
                "message": f"Successfully deleted {len(snapshots)} reminders (Batch ID: {batch_id}).",
            }

        elif tool_name == "propose_bulk_delete_categories":
            cat_ids = args.get("category_ids", [])
            if not cat_ids:
                return {"success": False, "error": "Please provide category_ids to delete."}
            if len(cat_ids) > 500:
                return {"success": False, "error": "Exceeded 500 category safety cap."}

            snapshots = []
            deleted_ids = []
            for cid in cat_ids:
                cat = db.session.get(Category, int(cid))
                if cat:
                    usage = _db_svc.is_category_used(cid)
                    if not usage["used"]:
                        snapshots.append(UndoService.capture_category_snapshot(cat))
                        _db_svc.delete_category(cid)
                        deleted_ids.append(cid)
                    else:
                        cat.active = False
            db.session.commit()

            return {
                "success": True,
                "deleted_count": len(deleted_ids),
                "snapshots": snapshots,
                "message": f"Bulk delete completed: {len(deleted_ids)} unused categories deleted.",
            }

        elif tool_name == "propose_bulk_delete_item_groups":
            group_ids = args.get("group_ids", [])
            if not group_ids:
                return {"success": False, "error": "Please provide group_ids to delete."}
            if len(group_ids) > 500:
                return {"success": False, "error": "Exceeded 500 item group safety cap."}

            snapshots = []
            deleted_ids = []
            for gid in group_ids:
                grp = db.session.get(ItemGroup, int(gid))
                if grp:
                    cat_count = Category.query.filter_by(group_id=gid, active=True).count()
                    if cat_count == 0:
                        snapshots.append(UndoService.capture_item_group_snapshot(grp))
                        _db_svc.delete_group(gid)
                        deleted_ids.append(gid)
            db.session.commit()

            return {
                "success": True,
                "deleted_count": len(deleted_ids),
                "snapshots": snapshots,
                "message": f"Bulk delete completed: {len(deleted_ids)} empty item groups deleted.",
            }

        elif tool_name == "restore_deleted_item":
            action_id = int(args.get("action_id"))
            from models import AgentActionLog

            action = db.session.get(AgentActionLog, action_id)
            if not action:
                return {"success": False, "error": f"Action #{action_id} not found."}

            res_data = json.loads(action.result_summary) if action.result_summary else {}
            snapshot = res_data.get("snapshot")
            if not snapshot:
                return {
                    "success": False,
                    "error": "No snapshot data found for this deletion action.",
                }

            res = UndoService.restore_snapshot(snapshot)
            if res.get("success"):
                action.status = "restored"
                db.session.commit()
            return res

        elif tool_name == "restore_last_bulk_delete":
            action_id = int(args.get("action_id"))
            from models import AgentActionLog

            action = db.session.get(AgentActionLog, action_id)
            if not action:
                return {"success": False, "error": f"Action #{action_id} not found."}

            res_data = json.loads(action.result_summary) if action.result_summary else {}
            snapshots = res_data.get("snapshots") or []
            if not snapshots:
                return {
                    "success": False,
                    "error": "No batch snapshots found for this bulk deletion.",
                }

            res = UndoService.restore_batch(snapshots)
            if res.get("success"):
                action.status = "restored"
                db.session.commit()
        elif tool_name == "propose_export":
            rep_type = args.get("report_type", "sales")
            period = args.get("period", "this_month")
            return {
                "success": True,
                "report_type": rep_type,
                "period": period,
                "download_url": f"/api/reports/export?type={rep_type}&period={period}",
                "message": f"Export report for {rep_type} ({period}) prepared successfully.",
            }

        return {"success": False, "error": f"Unrecognized mutating tool {tool_name}"}

    except Exception as e:
        db.session.rollback()
        _log.error("Error executing mutating tool %s: %s", tool_name, e)
        return {"success": False, "error": f"Execution failed: {str(e)}"}


_SUMMARY_TOOLS = {
    "propose_create_bill",
    "propose_split_payment_bill",
    "propose_void_bill",
    "propose_log_expense",
    "propose_delete_expense",
    "propose_record_advance",
}

_CATALOG_TOOLS = {
    "propose_create_product",
    "propose_update_product",
    "propose_bulk_update_prices",
    "propose_bulk_toggle_products",
    "propose_adjust_stock",
    "propose_bulk_stock_adjustment",
    "propose_reset_stock_count",
    "propose_create_category",
    "propose_update_category",
    "propose_delete_category",
    "propose_create_item_group",
    "propose_toggle_group_status",
    "propose_group_reorder",
    "propose_delete_item_group",
    "propose_variation_update",
    "restore_deleted_item",
    "restore_last_bulk_delete",
}


def execute_mutating_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a validated mutating tool, flush tool cache, and run post-commit hooks."""
    result = _execute_mutating_tool_impl(tool_name, args)
    if result.get("success"):
        if tool_name in _SUMMARY_TOOLS:
            try:
                from services.aggregation_service import update_daily_summary

                update_daily_summary()
            except Exception as e:
                _log.warning("Post-tool update_daily_summary failed: %s", e)
        if tool_name in _CATALOG_TOOLS:
            try:
                import time

                _db_svc.update_settings_bulk(
                    [{"key": "catalog_version", "value": str(int(time.time()))}]
                )
            except Exception as e:
                _log.warning("Post-tool catalog_version update failed: %s", e)
    return result
