from app import create_app
from models import db, WorkerType, ExpenseType
import sqlalchemy as sa

app = create_app("development")
with app.app_context():
    # Check if tables exist
    inspector = sa.inspect(db.engine)
    tables = inspector.get_table_names()

    # Detect database dialect
    dialect_name = db.engine.dialect.name
    print(f"Database dialect: {dialect_name}")
    print(f"Existing tables: {tables}")

    # Determine appropriate SQL syntax based on dialect
    if dialect_name == "postgresql":
        # PostgreSQL syntax
        id_syntax = "SERIAL PRIMARY KEY"
        bool_default = "TRUE"
        timestamp_syntax = "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
    else:
        # SQLite syntax (default)
        id_syntax = "INTEGER PRIMARY KEY AUTOINCREMENT"
        bool_default = "1"
        timestamp_syntax = "DATETIME DEFAULT CURRENT_TIMESTAMP"

    # Check if worker_types and expense_types tables exist
    if "worker_types" not in tables or "expense_types" not in tables:
        print("Creating worker_types and expense_types tables...")

        # Create worker_types table
        db.session.execute(db.text(f"""
            CREATE TABLE IF NOT EXISTS worker_types (
                id {id_syntax},
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT {bool_default},
                created_at {timestamp_syntax},
                updated_at {timestamp_syntax}
            )
        """))

        # Create expense_types table
        db.session.execute(db.text(f"""
            CREATE TABLE IF NOT EXISTS expense_types (
                id {id_syntax},
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT {bool_default},
                created_at {timestamp_syntax},
                updated_at {timestamp_syntax}
            )
        """))

        # Add worker_type_id column to workers table if it doesn't exist
        try:
            db.session.execute(db.text("""
                ALTER TABLE workers ADD COLUMN worker_type_id INTEGER
            """))
            db.session.execute(db.text("""
                CREATE INDEX IF NOT EXISTS fk_workers_worker_type_id ON workers(worker_type_id)
            """))
        except Exception as e:
            print(f"Column might already exist: {e}")

        db.session.commit()
        print("Tables created successfully")
    else:
        print("Tables already exist")

    # Insert default worker types (only if table is empty)
    worker_type_count = db.session.execute(db.text("SELECT COUNT(*) FROM worker_types")).scalar()
    if worker_type_count == 0:
        print("Inserting default worker types...")
        # Use appropriate timestamp and boolean syntax based on dialect
        timestamp_fn = "NOW()" if dialect_name == "postgresql" else "datetime('now')"
        bool_true = "TRUE" if dialect_name == "postgresql" else "1"
        db.session.execute(db.text(f"""
            INSERT INTO worker_types (name, description, is_active, created_at, updated_at)
            VALUES 
            ('Chef', 'Kitchen staff responsible for food preparation', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Waiter', 'Front-of-house staff serving customers', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Manager', 'Supervisory staff managing operations', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Cleaner', 'Staff responsible for cleaning and maintenance', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Delivery', 'Staff handling food delivery', {bool_true}, {timestamp_fn}, {timestamp_fn})
        """))
        db.session.commit()
        print("Default worker types inserted")
    else:
        print(f"Worker types already exist ({worker_type_count} records)")

    # Insert default expense types (only if table is empty)
    expense_type_count = db.session.execute(db.text("SELECT COUNT(*) FROM expense_types")).scalar()
    if expense_type_count == 0:
        print("Inserting default expense types...")
        # Use appropriate timestamp and boolean syntax based on dialect
        timestamp_fn = "NOW()" if dialect_name == "postgresql" else "datetime('now')"
        bool_true = "TRUE" if dialect_name == "postgresql" else "1"
        db.session.execute(db.text(f"""
            INSERT INTO expense_types (name, description, is_active, created_at, updated_at)
            VALUES 
            ('Utilities', 'Electricity, water, gas bills', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Rent', 'Monthly rent or lease payments', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Supplies', 'Food ingredients and consumables', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Equipment', 'Kitchen equipment and tools', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Maintenance', 'Repair and maintenance costs', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Marketing', 'Advertising and promotional expenses', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Insurance', 'Business insurance premiums', {bool_true}, {timestamp_fn}, {timestamp_fn}),
            ('Transportation', 'Vehicle and fuel costs', {bool_true}, {timestamp_fn}, {timestamp_fn})
        """))
        db.session.commit()
        print("Default expense types inserted")
    else:
        print(f"Expense types already exist ({expense_type_count} records)")

    # Verify
    print(f"\nFinal counts:")
    print(
        f"Worker types: {db.session.execute(db.text('SELECT COUNT(*) FROM worker_types')).scalar()}"
    )
    print(
        f"Expense types: {db.session.execute(db.text('SELECT COUNT(*) FROM expense_types')).scalar()}"
    )

    print("\nMigration completed successfully!")
