import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import Inventory, db
from sqlalchemy import text


def check_db():
    print("Checking database schema...")
    app = create_app("default")
    with app.app_context():
        try:
            # Check if column exists by trying to select it
            result = db.session.execute(
                text("SELECT id, name, stock, max_stock_history FROM inventory LIMIT 5")
            ).fetchall()
            print("Column 'max_stock_history' EXISTS.")
            print("First 5 items:")
            for row in result:
                print(
                    f"ID: {row.id}, Name: {row.name}, Stock: {row.stock}, Max Hist: {row.max_stock_history}"
                )
        except Exception as e:
            print(f"Column 'max_stock_history' MISSING or Error: {e}")

        try:
            # Check for unit_price column in inventory
            result = db.session.execute(text("PRAGMA table_info(inventory)")).fetchall()
            columns = [row[1] for row in result]
            if "unit_price" not in columns:
                print("Adding unit_price column to inventory table...")
                db.session.execute(
                    text("ALTER TABLE inventory ADD COLUMN unit_price FLOAT DEFAULT 0.0")
                )
                db.session.commit()
                print("Column 'unit_price' added successfully.")
            else:
                print("Column 'unit_price' EXISTS.")
        except Exception as e:
            print(f"Error checking/adding 'unit_price': {e}")


if __name__ == "__main__":
    check_db()
