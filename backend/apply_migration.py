from app import create_app
from models import db, WorkerType, ExpenseType
import sqlalchemy as sa

app = create_app('development')
with app.app_context():
    # Check if tables exist
    inspector = sa.inspect(db.engine)
    tables = inspector.get_table_names()
    
    print(f"Existing tables: {tables}")
    
    # Check if worker_types and expense_types tables exist
    if 'worker_types' not in tables or 'expense_types' not in tables:
        print("Creating worker_types and expense_types tables...")
        
        # Create worker_types table
        db.session.execute(db.text("""
            CREATE TABLE IF NOT EXISTS worker_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        
        # Create expense_types table
        db.session.execute(db.text("""
            CREATE TABLE IF NOT EXISTS expense_types (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) NOT NULL UNIQUE,
                description TEXT,
                is_active BOOLEAN DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
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
        db.session.execute(db.text("""
            INSERT INTO worker_types (name, description, is_active, created_at, updated_at)
            VALUES 
            ('Chef', 'Kitchen staff responsible for food preparation', 1, datetime('now'), datetime('now')),
            ('Waiter', 'Front-of-house staff serving customers', 1, datetime('now'), datetime('now')),
            ('Manager', 'Supervisory staff managing operations', 1, datetime('now'), datetime('now')),
            ('Cleaner', 'Staff responsible for cleaning and maintenance', 1, datetime('now'), datetime('now')),
            ('Delivery', 'Staff handling food delivery', 1, datetime('now'), datetime('now'))
        """))
        db.session.commit()
        print("Default worker types inserted")
    else:
        print(f"Worker types already exist ({worker_type_count} records)")
    
    # Insert default expense types (only if table is empty)
    expense_type_count = db.session.execute(db.text("SELECT COUNT(*) FROM expense_types")).scalar()
    if expense_type_count == 0:
        print("Inserting default expense types...")
        db.session.execute(db.text("""
            INSERT INTO expense_types (name, description, is_active, created_at, updated_at)
            VALUES 
            ('Utilities', 'Electricity, water, gas bills', 1, datetime('now'), datetime('now')),
            ('Rent', 'Monthly rent or lease payments', 1, datetime('now'), datetime('now')),
            ('Supplies', 'Food ingredients and consumables', 1, datetime('now'), datetime('now')),
            ('Equipment', 'Kitchen equipment and tools', 1, datetime('now'), datetime('now')),
            ('Maintenance', 'Repair and maintenance costs', 1, datetime('now'), datetime('now')),
            ('Marketing', 'Advertising and promotional expenses', 1, datetime('now'), datetime('now')),
            ('Insurance', 'Business insurance premiums', 1, datetime('now'), datetime('now')),
            ('Transportation', 'Vehicle and fuel costs', 1, datetime('now'), datetime('now'))
        """))
        db.session.commit()
        print("Default expense types inserted")
    else:
        print(f"Expense types already exist ({expense_type_count} records)")
    
    # Verify
    print(f"\nFinal counts:")
    print(f"Worker types: {db.session.execute(db.text('SELECT COUNT(*) FROM worker_types')).scalar()}")
    print(f"Expense types: {db.session.execute(db.text('SELECT COUNT(*) FROM expense_types')).scalar()}")
    
    print("\nMigration completed successfully!")
