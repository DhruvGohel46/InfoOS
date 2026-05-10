from app import create_app
from models import db, Bill
from sqlalchemy import func
from datetime import date


def reset_daily_bill_numbers():
    """Reset today's bill numbers to start from 1"""

    app = create_app("default")

    with app.app_context():
        try:
            today = date.today()
            print(f"Resetting bill numbers for: {today}")

            # Get today's bills ordered by creation time
            # Note: Postgres 'date' function or separate date column needed if created_at is datetime
            # We use func.date(Bill.created_at) which works in Postgres
            today_bills = (
                Bill.query.filter(func.date(Bill.created_at) == today)
                .order_by(Bill.created_at.asc())
                .all()
            )

            if not today_bills:
                print("No bills found for today!")
                return

            print(f"Found {len(today_bills)} bills for today")

            # Reset bill numbers starting from 1
            for i, bill in enumerate(today_bills, 1):
                old_bill_no = bill.bill_no
                bill.bill_no = i
                print(f"Bill {old_bill_no} -> Bill {i} (ID: {bill.id})")

            db.session.commit()

            print(f"\n✅ Successfully reset {len(today_bills)} bill numbers for today!")

        except Exception as e:
            print(f"❌ Error: {e}")
            db.session.rollback()


if __name__ == "__main__":
    reset_daily_bill_numbers()
