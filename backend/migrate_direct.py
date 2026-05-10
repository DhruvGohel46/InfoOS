from sqlalchemy import create_engine, text

# Get URI from config directly
DATABASE_URL = "postgresql://postgres:dharmik@localhost:5432/rebill_db"


def migrate():
    engine = create_engine(DATABASE_URL)
    with engine.connect() as connection:
        try:
            connection.execute(
                text("ALTER TABLE order_items ALTER COLUMN quantity TYPE VARCHAR(100)")
            )
            connection.commit()
            print("Quantity column altered to VARCHAR(100) successfully.")
        except Exception as e:
            print(f"Error: {e}")


if __name__ == "__main__":
    migrate()
