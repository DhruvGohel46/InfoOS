import json
import logging
from datetime import datetime, date, timedelta
from typing import Dict, Any, List, Optional
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
                "description": "Search product catalog with price, category, variations, and active status (max 20).",
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
                            "enum": ["today", "yesterday", "last_7_days", "this_month"],
                            "default": "today",
                        }
                    },
                },
            },
            {
                "name": "get_sales_trend",
                "description": "Get multi-day sales and order volume comparison (last N days).",
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

    @classmethod
    def all_tool_names(cls) -> List[str]:
        """Return a list of all tool names across all domain agents."""
        tools = (
            cls.get_billing_tools()
            + cls.get_inventory_tools()
            + cls.get_product_tools()
            + cls.get_worker_tools()
            + cls.get_expense_tools()
            + cls.get_analytics_tools()
            + cls.get_reminder_tools()
        )
        return [t["name"] for t in tools]


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

            total_spend = sum(b.total_amount for b in bills if b.status != "VOIDED")
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
            period = args.get("period", "today")
            today = date.today()
            target_date = today

            if period == "yesterday":
                target_date = today - timedelta(days=1)
                summary = DailySalesSummary.query.filter_by(date=target_date).first()
            elif period == "today":
                summary = DailySalesSummary.query.filter_by(date=today).first()
            else:
                summary = None

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
            bills = Bill.query.filter(func.date(Bill.created_at) == today).all()
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
                Bill.status != "VOIDED",
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
                Bill.status != "VOIDED",
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

        elif tool_name == "list_reminders":
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


def execute_mutating_tool(tool_name: str, args: Dict[str, Any]) -> Dict[str, Any]:
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

            old_stock = item.stock
            item.stock = max(0.0, item.stock + delta)
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
            cname = args.get("customer_name")
            cphone = args.get("customer_mobile")
            table = args.get("table_no")

            tot = 0.0
            enriched = []
            for it in items:
                p_id = it.get("product_id")
                qty = float(it.get("quantity", 1))
                prod = Product.query.get(p_id)
                price = prod.price if prod else 0.0
                name = prod.name if prod else it.get("name", "Item")
                tot += price * qty
                enriched.append(
                    {
                        "product_id": p_id,
                        "name": name,
                        "price": price,
                        "quantity": qty,
                        "subtotal": price * qty,
                    }
                )

            today = date.today()
            max_token = (
                db.session.query(func.max(Bill.today_token))
                .filter(func.date(Bill.created_at) == today)
                .scalar()
                or 0
            )
            max_bill_no = db.session.query(func.max(Bill.bill_no)).scalar() or 1000

            bill = Bill(
                bill_no=max_bill_no + 1,
                today_token=max_token + 1,
                customer_name=cname,
                customer_mobile=cphone,
                total_amount=round(tot, 2),
                payment_method=pmethod,
                items=json.dumps(enriched),
                order_type=otype,
                table_no=table,
                status="CONFIRMED",
            )
            db.session.add(bill)
            db.session.commit()
            return {
                "success": True,
                "bill_no": bill.bill_no,
                "token_no": bill.today_token,
                "total_amount": bill.total_amount,
                "payment_method": bill.payment_method,
            }

        elif tool_name == "propose_split_payment_bill":
            items = args.get("items", [])
            cash = float(args.get("cash_amount", 0))
            online = float(args.get("online_amount", 0))
            otype = args.get("order_type", "dine-in")
            cname = args.get("customer_name")
            cphone = args.get("customer_mobile")
            table = args.get("table_no")

            enriched = []
            for it in items:
                p_id = it.get("product_id")
                qty = float(it.get("quantity", 1))
                prod = Product.query.get(p_id)
                price = prod.price if prod else 0.0
                name = prod.name if prod else "Item"
                enriched.append({"product_id": p_id, "name": name, "price": price, "quantity": qty})

            today = date.today()
            max_token = (
                db.session.query(func.max(Bill.today_token))
                .filter(func.date(Bill.created_at) == today)
                .scalar()
                or 0
            )
            max_bill_no = db.session.query(func.max(Bill.bill_no)).scalar() or 1000

            bill = Bill(
                bill_no=max_bill_no + 1,
                today_token=max_token + 1,
                customer_name=cname,
                customer_mobile=cphone,
                total_amount=round(cash + online, 2),
                payment_method=f"SPLIT (Cash: ₹{cash}, Online: ₹{online})",
                items=json.dumps(enriched),
                order_type=otype,
                table_no=table,
                status="CONFIRMED",
            )
            db.session.add(bill)
            db.session.commit()
            return {
                "success": True,
                "bill_no": bill.bill_no,
                "token_no": bill.today_token,
                "total_amount": bill.total_amount,
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
            bill = Bill.query.filter_by(bill_no=b_no).first()
            if not bill:
                return {"success": False, "error": f"Bill #{b_no} not found"}

            bill.status = "VOIDED"
            db.session.commit()
            return {"success": True, "bill_no": b_no, "status": "VOIDED", "reason": reason}

        elif tool_name == "propose_create_worker":
            name = args.get("name")
            salary = float(args.get("salary"))
            role = args.get("role", "Staff")
            desc_text = args.get("description")
            phone = args.get("phone")
            j_date = args.get("join_date") or date.today().isoformat()

            w = Worker(
                name=name,
                salary=salary,
                role=role,
                description=desc_text,
                phone=phone,
                join_date=datetime.strptime(j_date, "%Y-%m-%d").date(),
                status="active",
            )
            db.session.add(w)
            db.session.commit()
            return {"success": True, "worker_id": w.worker_id, "name": name, "role": role}

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

            adv = Advance(worker_id=w_id, amount=amt, reason=reason)
            db.session.add(adv)
            db.session.commit()
            return {"success": True, "worker_name": w.name, "amount": amt, "reason": reason}

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
            return res

        return {"success": False, "error": f"Unrecognized mutating tool {tool_name}"}

    except Exception as e:
        db.session.rollback()
        _log.error("Error executing mutating tool %s: %s", tool_name, e)
        return {"success": False, "error": f"Execution failed: {str(e)}"}
