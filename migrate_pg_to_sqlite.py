
import os
import sys
from sqlalchemy import create_engine, MetaData, Table, select, insert, text
from sqlalchemy.orm import sessionmaker

# Add backend to path to import config
sys.path.append(os.path.join(os.getcwd(), 'backend'))

try:
    from backend.config import Config
    from backend.models import db
except ImportError:
    # If running from inside backend
    from config import Config
    from models import db

def migrate():
    # Source: PostgreSQL
    # Use the hardcoded default or env var if set
    pg_url = os.environ.get("PG_DATABASE_URL") or "postgresql://postgres:dharmik@localhost:5432/rebill_db"
    
    # Target: SQLite
    # Use absolute path to avoid "unable to open database file" errors
    current_dir = os.path.dirname(os.path.abspath(__file__))
    sqlite_db_path = os.path.join(current_dir, 'backend', 'data', 'pos.db')
    sqlite_url = os.environ.get("SQLITE_DATABASE_URL") or f"sqlite:///{sqlite_db_path}"
    
    print(f"Connecting to source: {pg_url}")
    print(f"Connecting to target: {sqlite_url}")
    
    pg_engine = create_engine(pg_url)
    sqlite_engine = create_engine(sqlite_url)
    
    pg_meta = MetaData()
    
    # Tables to migrate in order (respecting FKs)
    # Note: In Postgres, some tables were in 'worker' schema.
    # In SQLite, they are all in the default schema.
    tables_to_migrate = [
        ('settings', None),
        ('categories', None),
        ('products', None),
        ('inventory', None),
        ('bills', None),
        ('workers', 'worker'),
        ('expenses', None),
        ('expense_items', None),
        ('advances', 'worker'),
        ('salary_payments', 'worker'),
        ('attendance', 'worker'),
        ('reminders', None)
    ]
    
    # First, make sure target tables exist
    # We can use our models to create them
    from flask import Flask
    temp_app = Flask(__name__)
    temp_app.config['SQLALCHEMY_DATABASE_URI'] = sqlite_url
    temp_app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(temp_app)
    
    with temp_app.app_context():
        print("Creating tables in SQLite...")
        db.create_all()
        
        # Also handle reminders table which might be separate
        try:
            from backend.reminders.models import Base as ReminderBase
            ReminderBase.metadata.create_all(sqlite_engine)
        except Exception as e:
            print(f"Note: Reminders table creation skip/fail: {e}")

    for table_name, schema in tables_to_migrate:
        print(f"Migrating table: {table_name} (schema: {schema})...")
        
        try:
            # Reflect source table
            src_table = Table(table_name, pg_meta, autoload_with=pg_engine, schema=schema)
            
            # Select all from source
            with pg_engine.connect() as pg_conn:
                rows = pg_conn.execute(select(src_table)).fetchall()
                
            if not rows:
                print(f"  Table {table_name} is empty, skipping.")
                continue
                
            print(f"  Found {len(rows)} rows.")
            
            # Target table (reflected from SQLite)
            target_meta = MetaData()
            dest_table = Table(table_name, target_meta, autoload_with=sqlite_engine)
            
            # Clear target table first? Usually best for a fresh migration
            with sqlite_engine.connect() as sqlite_conn:
                sqlite_conn.execute(dest_table.delete())
                sqlite_conn.commit()
                
                # Insert rows
                # Convert Row objects to dicts
                row_dicts = [dict(row._mapping) for row in rows]
                
                # Batch insert
                sqlite_conn.execute(insert(dest_table), row_dicts)
                sqlite_conn.commit()
                
            print(f"  Successfully migrated {len(rows)} rows to {table_name}.")
            
        except Exception as e:
            print(f"  Error migrating {table_name}: {e}")

    print("\nMigration completed!")

if __name__ == "__main__":
    migrate()
