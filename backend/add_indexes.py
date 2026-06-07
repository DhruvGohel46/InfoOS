"""
=============================================================================
 DATABASE INDEX MIGRATION — add_indexes.py
=============================================================================

 Run this script once to add performance indexes to existing tables.
 Safe to re-run — uses CREATE INDEX IF NOT EXISTS.

 Usage:
   cd backend
   python add_indexes.py
=============================================================================
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db
from sqlalchemy import text

INDEXES = [
    # Bills
    ("idx_bills_created_at", "bills", "created_at"),
    ("idx_bills_status", "bills", "status"),
    # Products
    ("idx_products_category_id", "products", "category_id"),
    ("idx_products_active", "products", "active"),
    # Expenses
    ("idx_expenses_date", "expenses", "date"),
    # Daily Sales Summary
    ("idx_daily_summary_date", "daily_sales_summary", "date"),
]


def main():
    config_name = "default"
    app = create_app(config_name)

    with app.app_context():
        # Ensure all tables exist first
        db.create_all()
        print("✅ All tables verified/created")

        # Create indexes
        for idx_name, table_name, column_name in INDEXES:
            try:
                sql = text(f"CREATE INDEX IF NOT EXISTS {idx_name} ON {table_name} ({column_name})")
                db.session.execute(sql)
                db.session.commit()
                print(f"✅ Index {idx_name} on {table_name}({column_name})")
            except Exception as e:
                db.session.rollback()
                print(f"⚠️  Index {idx_name}: {e}")

        print("\n🎉 Index migration complete!")

        # Optionally backfill daily summaries
        try:
            from services.aggregation_service import backfill_summaries
            from datetime import date, timedelta

            # Backfill last 90 days
            start_date = date.today() - timedelta(days=90)
            print(f"\n📊 Backfilling daily summaries from {start_date}...")
            count = backfill_summaries(start_date)
            print(f"✅ Backfilled {count} days of analytics data")
        except Exception as e:
            print(f"⚠️  Backfill warning: {e}")


if __name__ == "__main__":
    main()
