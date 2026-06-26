"""
=============================================================================
 AGGREGATION SERVICE — services/aggregation_service.py
=============================================================================

 Pre-aggregates daily sales data into a summary table so that analytics
 queries hit a small pre-computed table instead of scanning millions of
 bill rows.

 Called:
   - After every bill creation (real-time update)
   - After every expense creation/deletion
   - Nightly by dashboard_refresher.py (reconciliation safety net)
=============================================================================
"""

from datetime import date, datetime
from models import db, Bill, Expense, DailySalesSummary
from sqlalchemy import func, cast, Date
import json
import logging

logger = logging.getLogger(__name__)

_EXCLUDED_BILL_STATUSES = {"CANCELLED", "VOIDED"}


def update_daily_summary(target_date=None):
    """
    Upsert the daily_sales_summary row for `target_date`.

    If target_date is None, defaults to today.

    This is designed to be called frequently (after every bill/expense)
    so it must be fast.  It does a single aggregation query per table.
    """
    if target_date is None:
        target_date = date.today()
    elif isinstance(target_date, str):
        target_date = datetime.strptime(target_date, "%Y-%m-%d").date()
    elif isinstance(target_date, datetime):
        target_date = target_date.date()

    try:
        # --- Sales aggregation ---
        sales_result = (
            db.session.query(
                func.count(Bill.id).label("total_orders"),
                func.coalesce(func.sum(Bill.total_amount), 0).label("total_sales"),
            )
            .filter(
                func.date(Bill.created_at) == target_date,
                ~func.upper(func.trim(Bill.status)).in_(_EXCLUDED_BILL_STATUSES),
            )
            .first()
        )

        total_orders = sales_result.total_orders or 0
        total_sales = float(sales_result.total_sales or 0)
        avg_bill = total_sales / total_orders if total_orders > 0 else 0.0

        # --- Top products (lightweight JSON snapshot) ---
        top_products_json = _compute_top_products(target_date)

        # --- Expense aggregation ---
        expense_result = (
            db.session.query(func.coalesce(func.sum(Expense.amount), 0).label("total_expenses"))
            .filter(func.date(Expense.date) == target_date)
            .first()
        )

        total_expenses = float(expense_result.total_expenses or 0)
        net_profit = total_sales - total_expenses

        # --- Upsert ---
        summary = DailySalesSummary.query.get(target_date)
        if summary is None:
            summary = DailySalesSummary(date=target_date)
            db.session.add(summary)

        summary.total_sales = total_sales
        summary.total_orders = total_orders
        summary.total_expenses = total_expenses
        summary.net_profit = net_profit
        summary.average_bill_value = avg_bill
        summary.top_products_json = top_products_json

        db.session.commit()
        logger.debug(
            f"Daily summary updated for {target_date}: "
            f"sales={total_sales}, orders={total_orders}, "
            f"expenses={total_expenses}, profit={net_profit}"
        )

    except Exception as e:
        db.session.rollback()
        logger.error(f"Failed to update daily summary for {target_date}: {e}")
        raise


def _compute_top_products(target_date) -> str:
    """
    Return a JSON string of top 10 products by revenue for the given date.
    """
    try:
        bills = Bill.query.filter(
            func.date(Bill.created_at) == target_date,
            ~func.upper(func.trim(Bill.status)).in_(_EXCLUDED_BILL_STATUSES),
        ).all()

        product_sales = {}
        for bill in bills:
            items = json.loads(bill.items) if isinstance(bill.items, str) else bill.items
            for item in items:
                from utils.product_variations import sales_line_key

                line_key = sales_line_key(item)
                name = item.get("name", "Unknown")
                qty = item.get("quantity", 0)
                price = item.get("price", 0)
                revenue = qty * price

                if line_key in product_sales:
                    product_sales[line_key]["quantity"] += qty
                    product_sales[line_key]["revenue"] += revenue
                else:
                    product_sales[line_key] = {
                        "product_id": item.get("product_id", "unknown"),
                        "variation_id": item.get("variation_id"),
                        "name": name,
                        "quantity": qty,
                        "revenue": revenue,
                    }

        # Sort by revenue, take top 10
        sorted_products = sorted(product_sales.values(), key=lambda x: x["revenue"], reverse=True)[
            :10
        ]

        return json.dumps(sorted_products)

    except Exception as e:
        logger.error(f"Error computing top products: {e}")
        return "[]"


def backfill_summaries(start_date, end_date=None):
    """
    Backfill daily_sales_summary for a date range.
    Useful for initial migration or after data recovery.
    """
    from datetime import timedelta

    if end_date is None:
        end_date = date.today()
    if isinstance(start_date, str):
        start_date = datetime.strptime(start_date, "%Y-%m-%d").date()
    if isinstance(end_date, str):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()

    current = start_date
    count = 0
    while current <= end_date:
        try:
            update_daily_summary(current)
            count += 1
        except Exception as e:
            logger.error(f"Backfill failed for {current}: {e}")
        current += timedelta(days=1)

    logger.info(f"Backfill complete: {count} days processed ({start_date} → {end_date})")
    return count
