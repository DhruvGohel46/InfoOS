from typing import Dict

ROUTING_LABEL = "Selecting the right specialist agent…"
LLM_CALL_LABEL = "Analyzing your request…"
SYNTHESIS_LABEL = "Putting together your answer…"
DEFAULT_STATUS_LABEL = "Working on it…"

TOOL_STATUS_LABELS: Dict[str, str] = {
    # billing
    "lookup_product": "Checking the price list…",
    "get_recent_bills": "Reviewing recent bills…",
    "get_bill_by_number": "Fetching bill details…",
    "get_daily_token_count": "Checking today's token counter…",
    "get_hold_bills": "Checking held/parked bills…",
    "get_customer_order_history": "Fetching customer order history…",
    "get_bill_payment_summary": "Aggregating billing payment collections…",
    "propose_create_bill": "Drafting the customer bill…",
    "propose_split_payment_bill": "Drafting split-payment bill…",
    "propose_hold_bill": "Holding/parking draft order…",
    "propose_recall_hold_bill": "Recalling parked bill for payment…",
    "propose_apply_bill_discount": "Applying bill discount…",
    "propose_void_bill": "Reviewing the bill to void…",
    # inventory
    "get_inventory_status": "Checking stock levels…",
    "list_low_stock_items": "Finding low stock alerts…",
    "get_stock_valuation": "Calculating stock valuation…",
    "get_stock_consumption_rate": "Calculating stock usage rate & days left…",
    "get_inventory_logs": "Reviewing stock adjustment audit logs…",
    "propose_adjust_stock": "Preparing a stock adjustment…",
    "propose_bulk_stock_adjustment": "Preparing batch stock adjustment…",
    "propose_update_threshold": "Updating alert threshold…",
    "propose_create_raw_material": "Adding new raw material to inventory…",
    "propose_update_inventory_item": "Updating inventory item…",
    "propose_reset_stock_count": "Reconciling physical stock count…",
    "get_expiring_inventory": "Scanning stock approaching expiry…",
    "get_inventory_batches": "Checking item batches and expiry dates…",
    "propose_add_inventory_batch": "Preparing to log inventory batch…",
    "propose_set_product_batch_preset": "Configuring default batch preset…",
    # product
    "search_products": "Searching product catalog…",
    "get_categories_and_groups": "Loading categories and groups…",
    "get_category_list": "Listing registered categories…",
    "get_group_list": "Listing item groups…",
    "get_product_details": "Fetching product details & recipe…",
    "propose_create_product": "Adding the new product…",
    "propose_update_product": "Updating the menu item…",
    "propose_variation_update": "Updating product variations…",
    "propose_group_reorder": "Updating group display order…",
    "propose_toggle_group_status": "Toggling the item group…",
    "propose_create_category": "Creating new menu category…",
    "propose_create_item_group": "Creating new item group…",
    "propose_update_category": "Updating category…",
    "propose_bulk_update_prices": "Updating menu prices in bulk…",
    "propose_bulk_toggle_products": "Toggling product availability in bulk…",
    "propose_delete_category": "Preparing category deletion…",
    "propose_delete_item_group": "Preparing item group deletion…",
    "propose_bulk_delete_categories": "Preparing bulk category deletion…",
    "propose_bulk_delete_item_groups": "Preparing bulk item group deletion…",
    # worker
    "list_workers": "Checking staff records…",
    "get_worker_attendance": "Checking daily attendance…",
    "get_attendance_summary": "Summarizing month-to-date attendance…",
    "get_pending_payroll": "Calculating pending payroll breakdown…",
    "calculate_worker_salary": "Working out the salary breakdown…",
    "get_worker_advances": "Reviewing worker salary advances…",
    "list_worker_roles": "Listing staff designations & roles…",
    "propose_create_worker": "Setting up the new worker…",
    "propose_update_worker": "Updating worker profile…",
    "propose_mark_attendance": "Marking worker attendance…",
    "propose_bulk_mark_attendance": "Marking staff attendance in bulk…",
    "propose_record_advance": "Recording salary advance…",
    "propose_create_worker_role": "Registering new staff role…",
    # expense
    "list_expense_types": "Checking expense categories…",
    "list_recent_expenses": "Reviewing recent expenses…",
    "get_expense_category_breakdown": "Aggregating expense breakdown…",
    "get_expense_by_id": "Fetching expense voucher details…",
    "get_recurring_expense_forecast": "Forecasting monthly operational expenses…",
    "propose_log_expense": "Logging the expense voucher…",
    "propose_bulk_log_expenses": "Recording expense vouchers in bulk…",
    "propose_update_expense": "Updating expense voucher…",
    "propose_expense_type": "Registering new expense category…",
    "propose_update_expense_type": "Updating expense category…",
    "propose_delete_expense": "Preparing expense voucher deletion…",
    "propose_delete_expense_type": "Preparing expense category deletion…",
    "propose_bulk_delete_expenses": "Preparing bulk expense deletion…",
    # analytics
    "get_sales_kpi_summary": "Looking at sales KPIs…",
    "get_sales_trend": "Analyzing multi-day sales trends…",
    "get_hourly_footfall": "Analyzing hourly footfall & orders…",
    "get_top_selling_products": "Checking your best sellers…",
    "get_payment_mode_breakdown": "Analyzing payment breakdown…",
    "get_category_sales_breakdown": "Aggregating sales by category…",
    "get_order_type_breakdown": "Comparing Dine-In vs Takeaway vs Delivery…",
    "get_peak_days_analysis": "Analyzing peak earning days of the week…",
    "get_dead_stock_report": "Finding slow-moving & inactive menu items…",
    "get_profit_margin_analysis": "Computing profit margin & cost ratios…",
    "propose_export": "Preparing data report export…",
    # reminder
    "list_reminders": "Checking pending reminders…",
    "get_unread_notification_count": "Checking notifications & alerts…",
    "list_notifications": "Loading notification inbox…",
    "propose_create_reminder": "Setting the reminder…",
    "propose_bulk_create_reminders": "Scheduling checklist reminders in bulk…",
    "propose_snooze_reminder": "Snoozing the reminder…",
    "propose_complete_reminder": "Completing the reminder…",
    "propose_update_reminder": "Updating reminder schedule…",
    "propose_delete_reminder": "Preparing reminder deletion…",
    "delete_notification": "Deleting notification…",
    "propose_mark_all_notifications_read": "Dismissing all notifications…",
    "propose_bulk_delete_reminders": "Preparing bulk reminder deletion…",
    "restore_deleted_item": "Restoring deleted record…",
    "restore_last_bulk_delete": "Restoring bulk deletion batch…",
    # prediction
    "get_sales_history_for_prediction": "Analyzing historical sales data…",
    "get_top_products_for_prediction": "Identifying top-selling products for demand forecast…",
    "get_regional_festivals_and_holidays": "Checking upcoming festivals and regional holidays…",
    "get_weather_forecast": "Checking live weather forecasts and conditions…",
    "run_sales_prediction": "Running WARMP sales and demand prediction engine…",
    "get_prediction_accuracy_report": "Generating forecast accuracy and error evaluation report…",
}


def get_status_label(tool_name: str) -> str:
    """Return a natural, jargon-free status string for any tool."""
    return TOOL_STATUS_LABELS.get(tool_name, DEFAULT_STATUS_LABEL)


STEP_HUMAN_MAPPINGS: Dict[str, tuple] = {
    # billing
    "lookup_product": ("Checked product catalog", "Searched product price list in database"),
    "get_recent_bills": (
        "Checked recent bills",
        "Retrieved recent customer transactions from database",
    ),
    "get_bill_by_number": ("Checked bill records", "Retrieved bill details from database"),
    "get_daily_token_count": (
        "Checked token counter",
        "Retrieved today's token count from database",
    ),
    "get_hold_bills": ("Checked parked bills", "Found saved hold orders in database"),
    "get_customer_order_history": (
        "Checked customer history",
        "Retrieved customer's past orders from database",
    ),
    "get_bill_payment_summary": (
        "Checked payment collections",
        "Aggregated billing payment collections from database",
    ),
    "propose_create_bill": ("Prepared new bill", "Drafted customer bill for your confirmation"),
    "propose_split_payment_bill": (
        "Prepared split-payment bill",
        "Drafted split payment bill for confirmation",
    ),
    "propose_hold_bill": ("Held order", "Parked draft order in database"),
    "propose_recall_hold_bill": ("Recalled parked bill", "Retrieved parked bill for payment"),
    "propose_apply_bill_discount": ("Prepared discount", "Applied discount to bill"),
    "propose_void_bill": ("Prepared bill cancellation", "Selected bill to void upon confirmation"),
    # inventory
    "get_inventory_status": (
        "Checked inventory database",
        "Retrieved live stock quantities and levels",
    ),
    "list_low_stock_items": (
        "Checked low stock alerts",
        "Scanned inventory for items below minimum threshold",
    ),
    "get_stock_valuation": (
        "Calculated stock valuation",
        "Computed total stock cost and value from database",
    ),
    "get_stock_consumption_rate": (
        "Calculated stock usage",
        "Estimated daily consumption rate and days left",
    ),
    "get_inventory_logs": (
        "Checked inventory audit logs",
        "Reviewed stock adjustment history from database",
    ),
    "propose_adjust_stock": (
        "Prepared stock adjustment",
        "Drafted inventory quantity update for confirmation",
    ),
    "propose_bulk_stock_adjustment": (
        "Prepared bulk stock adjustment",
        "Drafted batch inventory adjustments for confirmation",
    ),
    "propose_update_threshold": (
        "Updated stock threshold",
        "Prepared minimum stock alert threshold update",
    ),
    "propose_create_raw_material": (
        "Added raw material",
        "Prepared new raw material record for confirmation",
    ),
    "propose_update_inventory_item": (
        "Updated inventory item",
        "Prepared item details update for confirmation",
    ),
    "propose_reset_stock_count": (
        "Reconciled stock count",
        "Prepared physical stock count reconciliation",
    ),
    "get_expiring_inventory": (
        "Checked expiring stock",
        "Scanned inventory for items and batches near or past expiration",
    ),
    "get_inventory_batches": (
        "Checked inventory batches",
        "Retrieved batch breakdown and expiry dates for item",
    ),
    "propose_add_inventory_batch": (
        "Prepared inventory batch",
        "Drafted batch stock addition with expiry date for confirmation",
    ),
    "propose_set_product_batch_preset": (
        "Prepared batch preset",
        "Configured default preset batch size for product",
    ),
    # product
    "search_products": ("Checked product catalog", "Searched menu database for matching items"),
    "get_categories_and_groups": (
        "Loaded menu catalog",
        "Retrieved categories and item groups from database",
    ),
    "get_category_list": (
        "Checked menu categories",
        "Retrieved list of registered categories from database",
    ),
    "get_group_list": ("Checked item groups", "Retrieved item group list from database"),
    "get_product_details": (
        "Checked product details",
        "Retrieved item specifications and recipe from database",
    ),
    "propose_create_product": (
        "Prepared new product",
        "Drafted new product details for your confirmation",
    ),
    "propose_update_product": (
        "Prepared product update",
        "Drafted menu item changes for your confirmation",
    ),
    "propose_variation_update": (
        "Prepared variation update",
        "Drafted product size and price variations",
    ),
    "propose_group_reorder": ("Updated group order", "Rearranged item group display sequence"),
    "propose_toggle_group_status": (
        "Toggled group availability",
        "Changed active status of item group",
    ),
    "propose_create_category": (
        "Prepared new category",
        "Drafted new menu category for confirmation",
    ),
    "propose_create_item_group": (
        "Prepared new item group",
        "Drafted new item group for confirmation",
    ),
    "propose_update_category": (
        "Updated menu category",
        "Prepared category changes for confirmation",
    ),
    "propose_bulk_update_prices": (
        "Prepared bulk price update",
        "Drafted price adjustments across menu items",
    ),
    "propose_bulk_toggle_products": (
        "Toggled product availability",
        "Updated menu availability in bulk",
    ),
    "propose_delete_category": (
        "Prepared category deletion",
        "Selected category for removal upon confirmation",
    ),
    "propose_delete_item_group": (
        "Prepared item group deletion",
        "Selected group for removal upon confirmation",
    ),
    "propose_bulk_delete_categories": (
        "Prepared bulk category deletion",
        "Selected categories for removal",
    ),
    "propose_bulk_delete_item_groups": (
        "Prepared bulk group deletion",
        "Selected groups for removal",
    ),
    # worker
    "list_workers": (
        "Checked staff database",
        "Retrieved registered worker profiles from database",
    ),
    "get_worker_attendance": (
        "Checked attendance records",
        "Retrieved staff attendance from database",
    ),
    "get_attendance_summary": (
        "Summarized staff attendance",
        "Calculated monthly attendance counts from database",
    ),
    "get_pending_payroll": (
        "Calculated payroll estimates",
        "Estimated pending salary disbursements from database",
    ),
    "calculate_worker_salary": (
        "Calculated worker salary",
        "Computed salary breakdown from attendance records",
    ),
    "get_worker_advances": (
        "Checked worker advances",
        "Retrieved salary advance records from database",
    ),
    "list_worker_roles": (
        "Checked staff roles",
        "Retrieved staff designations and role permissions",
    ),
    "propose_create_worker": (
        "Prepared new worker profile",
        "Drafted staff profile for your confirmation",
    ),
    "propose_update_worker": (
        "Updated worker profile",
        "Drafted staff profile changes for confirmation",
    ),
    "propose_mark_attendance": (
        "Marked attendance",
        "Prepared attendance log entry for confirmation",
    ),
    "propose_bulk_mark_attendance": (
        "Marked staff attendance in bulk",
        "Prepared batch attendance entries",
    ),
    "propose_record_advance": (
        "Recorded salary advance",
        "Prepared salary advance entry for confirmation",
    ),
    "propose_create_worker_role": (
        "Registered staff role",
        "Prepared new staff designation for confirmation",
    ),
    # expense
    "list_expense_types": (
        "Checked expense categories",
        "Retrieved expense type list from database",
    ),
    "list_recent_expenses": ("Checked recent expenses", "Retrieved expense vouchers from database"),
    "get_expense_category_breakdown": (
        "Analyzed expense breakdown",
        "Aggregated expenses by category from database",
    ),
    "get_expense_by_id": (
        "Checked expense voucher",
        "Retrieved expense voucher details from database",
    ),
    "get_recurring_expense_forecast": (
        "Analyzed recurring expenses",
        "Forecasted monthly operational expenses",
    ),
    "propose_log_expense": (
        "Logged expense voucher",
        "Drafted expense entry for your confirmation",
    ),
    "propose_bulk_log_expenses": (
        "Logged expenses in bulk",
        "Drafted batch expense entries for confirmation",
    ),
    "propose_update_expense": (
        "Updated expense voucher",
        "Drafted voucher changes for your confirmation",
    ),
    "propose_expense_type": ("Added expense category", "Drafted new expense type for confirmation"),
    "propose_update_expense_type": (
        "Updated expense category",
        "Drafted category changes for confirmation",
    ),
    "propose_delete_expense": (
        "Prepared expense deletion",
        "Selected voucher for deletion upon confirmation",
    ),
    "propose_delete_expense_type": (
        "Prepared category deletion",
        "Selected expense type for removal",
    ),
    "propose_bulk_delete_expenses": (
        "Prepared bulk expense deletion",
        "Selected expense entries for removal",
    ),
    # analytics
    "get_sales_kpi_summary": (
        "Checked sales database",
        "Retrieved sales performance KPIs and revenue totals",
    ),
    "get_sales_trend": (
        "Checked sales trends",
        "Analyzed daily sales records over the selected time range",
    ),
    "get_hourly_footfall": (
        "Analyzed store traffic",
        "Checked customer order times and hourly rush patterns",
    ),
    "get_top_selling_products": (
        "Checked top selling items",
        "Found best-selling products from sales records",
    ),
    "get_payment_mode_breakdown": (
        "Checked payment breakdown",
        "Aggregated cash, UPI, and card collections",
    ),
    "get_category_sales_breakdown": (
        "Checked category sales",
        "Aggregated sales numbers by product category",
    ),
    "get_order_type_breakdown": (
        "Checked order types",
        "Compared dine-in, takeaway, and delivery sales",
    ),
    "get_peak_days_analysis": (
        "Analyzed peak earning days",
        "Reviewed day-of-week sales performance from database",
    ),
    "get_dead_stock_report": (
        "Checked stock movement",
        "Identified inactive and slow-moving items from database",
    ),
    "get_profit_margin_analysis": (
        "Analyzed profit margins",
        "Computed gross profit and margins from sales data",
    ),
    "propose_export": ("Prepared report export", "Generated data report export for download"),
    # reminder & recovery
    "list_reminders": ("Checked reminders", "Retrieved pending reminders from database"),
    "get_unread_notification_count": (
        "Checked alerts",
        "Retrieved unread notification count from database",
    ),
    "list_notifications": (
        "Checked notifications inbox",
        "Loaded recent system alerts and updates",
    ),
    "propose_create_reminder": ("Created reminder", "Scheduled new reminder for your confirmation"),
    "propose_bulk_create_reminders": (
        "Created bulk reminders",
        "Scheduled checklist reminders in bulk",
    ),
    "propose_snooze_reminder": (
        "Snoozed reminder",
        "Updated reminder schedule for later notification",
    ),
    "propose_complete_reminder": (
        "Completed reminder",
        "Marked reminder checklist item as completed",
    ),
    "propose_update_reminder": (
        "Updated reminder",
        "Drafted reminder changes for your confirmation",
    ),
    "propose_delete_reminder": (
        "Deleted reminder",
        "Selected reminder for deletion upon confirmation",
    ),
    "delete_notification": ("Dismissed notification", "Removed alert from inbox"),
    "propose_mark_all_notifications_read": (
        "Dismissed notifications",
        "Marked all active alerts as read",
    ),
    "propose_bulk_delete_reminders": (
        "Deleted reminders in bulk",
        "Selected reminders for deletion",
    ),
    "restore_deleted_item": (
        "Restored deleted record",
        "Recovered deleted record from 48h safety window",
    ),
    "restore_last_bulk_delete": (
        "Restored bulk deletion",
        "Recovered deleted batch from 48h safety window",
    ),
    # prediction
    "get_sales_history_for_prediction": (
        "Analyzed sales history",
        "Retrieved historical baseline sales data from database",
    ),
    "get_top_products_for_prediction": (
        "Checked top products",
        "Identified highest volume products for itemized forecasting",
    ),
    "get_regional_festivals_and_holidays": (
        "Checked holidays and festivals",
        "Retrieved regional festive calendar and footfall multipliers",
    ),
    "get_weather_forecast": (
        "Checked weather forecast",
        "Fetched live weather forecast and footfall impact coefficients",
    ),
    "run_sales_prediction": (
        "Generated sales prediction",
        "Computed WARMP multi-factor forecast for upcoming days",
    ),
    "get_prediction_accuracy_report": (
        "Evaluated prediction accuracy",
        "Compared past predictions against actual sales records",
    ),
}


def get_step_human_summary(tool_name: str, args: dict | None = None) -> tuple[str, str]:
    """Return a human-friendly (title, details) tuple in plain business English."""
    if tool_name in STEP_HUMAN_MAPPINGS:
        base_title, base_details = STEP_HUMAN_MAPPINGS[tool_name]
    else:
        # Generic clean fallback without snake_case or technical jargon
        clean_name = (
            tool_name.replace("propose_", "")
            .replace("get_", "")
            .replace("list_", "")
            .replace("_", " ")
            .title()
        )
        base_title = f"Checked {clean_name}"
        base_details = f"Retrieved {clean_name.lower()} from database"

    # Add human-friendly parameter context if available
    if args and isinstance(args, dict):
        period = args.get("period")
        if period:
            period_str = str(period).replace("_", " ")
            base_details = f"{base_details} for {period_str}"
        elif args.get("query"):
            base_details = f"{base_details} matching '{args.get('query')}'"
        elif args.get("category_name"):
            base_details = f"{base_details} for category '{args.get('category_name')}'"
        elif args.get("worker_name"):
            base_details = f"{base_details} for worker '{args.get('worker_name')}'"

    return base_title, base_details
