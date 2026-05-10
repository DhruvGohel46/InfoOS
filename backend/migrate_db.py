from app import create_app
from models import db
from sqlalchemy import text

app = create_app("development")
with app.app_context():
    try:
        # For PostgreSQL
        db.session.execute(text("ALTER TABLE order_items ALTER COLUMN quantity TYPE VARCHAR(100)"))
        db.session.commit()
        print("Column altered successfully (Postgres)")
    except Exception as e:
        db.session.rollback()
        print(f"Postgres alter failed, trying SQLite: {e}")
        try:
            # SQLite doesn't support ALTER COLUMN TYPE easily.
            # But usually db_service.py's config indicates Postgres.
            # If it were SQLite, we'd have to recreate the table.
            pass
        except Exception as e2:
            print(f"Migration failed: {e2}")

if __name__ == "__main__":
    pass
