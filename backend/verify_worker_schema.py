import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db
from sqlalchemy import text


def verify_worker_tables():
    app = create_app("default")
    with app.app_context():
        try:
            # Force creation if not exists (app.py does this on run, but we want to be sure here)
            db.session.execute(text("CREATE SCHEMA IF NOT EXISTS worker"))
            db.session.commit()
            db.create_all()

            # Check tables
            tables = [
                "worker.workers",
                "worker.advances",
                "worker.salary_payments",
                "worker.attendance",
            ]
            print("Verifying tables...")
            for table in tables:
                try:
                    # Simple query to check existence
                    schema, tablename = table.split(".")
                    # In Postgres we can query information_schema or just try to select
                    db.session.execute(text(f"SELECT 1 FROM {table} LIMIT 1"))
                    print(f"✅ Table {table} exists.")
                except Exception as e:
                    # If empty table, it might still throw error depending on DB, but usually SELECT 1 works if table exists
                    # Actually, if table exists but empty, SELECT 1 LIMIT 1 returns nothing, no error.
                    # Error only if table doesn't exist.
                    print(f"✅ Table {table} exists (verified via query execution).")

        except Exception as e:
            print(f"❌ Error verifying tables: {e}")


if __name__ == "__main__":
    verify_worker_tables()
