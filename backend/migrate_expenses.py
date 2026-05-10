from sqlalchemy import create_engine, text
import os

# Get URI from config or env
DATABASE_URL = (
    os.environ.get("DATABASE_URL") or "postgresql://postgres:dharmik@localhost:5432/rebill_db"
)


def migrate():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        print("Starting migration...")

        # 1. Drop reminders table
        try:
            connection.execute(text("DROP TABLE IF EXISTS reminders CASCADE"))
            connection.commit()
            print("Dropped reminders table.")
        except Exception as e:
            print(f"Error dropping reminders: {e}")

        # 2. Refactor expenses table
        try:
            # Check if columns exist before renaming
            result = connection.execute(
                text(
                    "SELECT column_name FROM information_schema.columns WHERE table_name='expenses'"
                )
            )
            columns = [row[0] for row in result]

            if "supplier_name" in columns:
                connection.execute(
                    text("ALTER TABLE expenses RENAME COLUMN supplier_name TO title")
                )
                print("Renamed supplier_name to title")

            if "total_amount" in columns:
                connection.execute(
                    text("ALTER TABLE expenses RENAME COLUMN total_amount TO amount")
                )
                print("Renamed total_amount to amount")

            if "expense_date" in columns:
                connection.execute(text("ALTER TABLE expenses RENAME COLUMN expense_date TO date"))
                print("Renamed expense_date to date")

            if "worker_id" not in columns:
                connection.execute(text("ALTER TABLE expenses ADD COLUMN worker_id VARCHAR(36)"))
                # Add foreign key constraint
                # Note: Worker table is in 'worker' schema
                connection.execute(
                    text(
                        "ALTER TABLE expenses ADD CONSTRAINT fk_expense_worker FOREIGN KEY (worker_id) REFERENCES worker.workers(worker_id) ON DELETE SET NULL"
                    )
                )
                print("Added worker_id column and FK constraint")

            # Ensure title is not null (might have been null before)
            connection.execute(
                text("UPDATE expenses SET title = 'Business Expense' WHERE title IS NULL")
            )
            connection.execute(text("ALTER TABLE expenses ALTER COLUMN title SET NOT NULL"))

            connection.commit()
            print("Expenses table refactored successfully.")
        except Exception as e:
            print(f"Error refactoring expenses: {e}")
            connection.rollback()


if __name__ == "__main__":
    migrate()
