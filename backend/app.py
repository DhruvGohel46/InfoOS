from flask import Flask, jsonify
from flask_cors import CORS
from flask_migrate import Migrate
import os
import logging
import threading
from dotenv import load_dotenv
from config import config
from error_handler import register_error_handlers
from logger import setup_logging, register_logger_middleware

_log = logging.getLogger(__name__)

# Load environment variables from .env file
load_dotenv()


def start_dashboard_refresher():
    """Start the dashboard refresher and reminder checker in a separate thread"""
    from dashboard_refresher import DashboardRefresher
    from models import db, Reminder
    import time
    from datetime import datetime

    # Run dashboard refresher
    try:
        refresher = DashboardRefresher()
        _log.info("Dashboard Refresher started — daily refresh at 00:01")
        import threading as _t

        dash_thread = _t.Thread(target=refresher.start_scheduler, daemon=True)
        dash_thread.start()
    except Exception as e:
        _log.error("Failed to start dashboard refresher: %s", e)

    # Start reminder checker loop
    # Re-using the same background logic structure for reminders
    def check_reminders_loop():
        # Access application instance through create_app inside thread
        from app import create_app
        import traceback

        local_app = create_app("default")  # Re-create or use existing?
        # Better: use current_app context or create a context once.
        with local_app.app_context():
            while True:
                try:
                    # Use local time since reminders are stored as local datetime strings.
                    now = datetime.now()
                    triggered_reminders = Reminder.query.filter(
                        Reminder.status == "pending", Reminder.reminder_time <= now
                    ).all()

                    for reminder in triggered_reminders:
                        _log.info("Reminder triggered: %s", reminder.title)
                        reminder.status = "triggered"
                        reminder.triggered_at = now
                        reminder.last_triggered_at = now
                        db.session.commit()
                except Exception as e:
                    _log.error("Reminder checker error: %s", e)
                    db.session.rollback()
                finally:
                    # Reset the scoped session so one failed transaction does not
                    # poison future reminder checks in this thread.
                    db.session.remove()
                time.sleep(10)  # Check every 10 seconds

    reminder_thread = threading.Thread(target=check_reminders_loop, daemon=True)
    reminder_thread.start()
    _log.info("Reminder micro-checker started — polling every 10 s")


def create_app(config_name="default"):
    """Create and configure Flask application"""
    app = Flask(__name__)

    # Import route blueprints logic moved inside to allow env vars to take effect before config loading in modules
    from dashboard_refresher import DashboardRefresher
    from routes.products import products_bp
    from routes.billing import billing_bp
    from routes.summary import summary_bp
    from routes.reports import reports_bp
    from routes.categories import categories_bp
    from routes.groups import groups_bp
    from routes.settings import settings_bp
    from routes.inventory import inventory_bp
    from routes.workers import workers_bp
    from routes.expenses import expenses_bp
    from routes.reminders import reminders_bp
    from routes.pos import pos_bp
    from auth import auth_bp
    from routes.logs import logs_bp
    from limiter import limiter

    # Load configuration
    app.config.from_object(config[config_name])

    # Initialize SQLAlchemy and Migrate
    from models import db

    db.init_app(app)
    Migrate(app, db)
    limiter.init_app(app)

    # Initialize Flask-Caching
    from caching import cache

    cache.init_app(app)

    # Structured logging (must come before blueprints so routes get the logger)
    setup_logging(app)
    register_logger_middleware(app)

    # Enable CORS globally — applying resource-specific rules caused preflight
    # OPTIONS requests to fail when Flask error handlers fired before the route
    # handler, stripping CORS headers from the response.
    CORS(
        app,
        origins="*",
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allow_headers=["Content-Type", "Authorization"],
        supports_credentials=False,
    )

    # Register blueprints
    app.register_blueprint(products_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(summary_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(groups_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(workers_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(reminders_bp)
    app.register_blueprint(pos_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(logs_bp)

    # Serve product images
    @app.route("/api/images/<path:filename>")
    def serve_image(filename):
        from flask import send_from_directory

        # Use DATA_DIR from config, assuming images are in 'images' subdir
        images_dir = os.path.join(app.config["DATA_DIR"], "images")
        return send_from_directory(images_dir, filename, max_age=2592000)

    # Serve sounds
    @app.route("/api/sounds/<path:filename>")
    def serve_sound(filename):
        from flask import send_from_directory

        # Sounds are stored in the 'Sound' subdirectory
        sounds_dir = os.path.join(app.config["DATA_DIR"], "Sound")
        # Return the file without caching so changes are reflected immediately
        response = send_from_directory(sounds_dir, filename)
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        return response

    # Root endpoint
    @app.route("/")
    def index():
        return jsonify(
            {
                "message": "POS Backend API",
                "version": "1.0.0",
                "status": "running",
                "endpoints": {
                    "products": "/api/products",
                    "billing": "/api/bill",
                    "summary": "/api/summary",
                    "reports": "/api/reports",
                    "categories": "/api/categories",
                    "settings": "/api/settings",
                    "inventory": "/api/inventory",
                    "workers": "/api/workers",
                    "reminders": "/api/reminders",
                    "expenses": "/api/expenses",
                },
            }
        )

    # Health check endpoint
    @app.route("/health")
    @limiter.exempt
    def health_check():
        return jsonify(
            {
                "status": "healthy",
                "timestamp": str(os.times()),
                "data_directory": app.config["DATA_DIR"],
            }
        )

    # System version and migration info endpoint
    @app.route("/api/system/info")
    @limiter.exempt
    def system_info():
        db_version = "unknown"
        try:
            from sqlalchemy import text

            with db.engine.connect() as conn:
                result = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
                if result:
                    db_version = result[0]
        except Exception:
            db_version = "initial"

        # Check rembg availability
        from routes.products import _rembg_available, _rembg_loading

        rembg_status = "unavailable"
        if _rembg_available is True:
            rembg_status = "active"
        elif _rembg_loading:
            rembg_status = "loading"

        return jsonify(
            {
                "success": True,
                "backend_version": "1.0.0",
                "database_schema_version": db_version,
                "status": "healthy",
                "rembg_status": rembg_status,
            }
        )

    # Register centralized error handlers (400, 404, 405, 409, 500)
    register_error_handlers(app)

    return app


def db_health_check(app, db):
    """Verify database connection and critical tables."""
    from sqlalchemy import text

    try:
        with app.app_context():
            db.session.execute(text("SELECT 1"))
            db.session.commit()
            _log.info("Database health check: OK")
    except Exception as e:
        _log.error("Database health check FAILED: %s", e)


def run_programmatic_sqlite_migrations(app, db):
    """Execute dynamic alter statements for SQLite database columns that db.create_all() won't add."""
    from sqlalchemy import text

    try:
        with app.app_context():
            with db.engine.begin() as conn:
                # 1. Create item_groups table if not exists
                conn.execute(text("""
                    CREATE TABLE IF NOT EXISTS item_groups (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        organization_id TEXT DEFAULT 'default',
                        name TEXT NOT NULL,
                        description TEXT,
                        display_order INTEGER DEFAULT 0,
                        color TEXT,
                        icon TEXT,
                        is_active BOOLEAN DEFAULT 1,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        deleted_at TIMESTAMP DEFAULT NULL
                    )
                """))

                # 2. Add group_id to categories
                res = conn.execute(text("PRAGMA table_info(categories)"))
                cat_cols = [row[1] for row in res.fetchall()]
                if "group_id" not in cat_cols:
                    _log.info("Migrating SQLite: Adding group_id column to categories table")
                    conn.execute(
                        text(
                            "ALTER TABLE categories ADD COLUMN group_id INTEGER REFERENCES item_groups(id)"
                        )
                    )

                # 3. Add order_type and table_no to bills
                res = conn.execute(text("PRAGMA table_info(bills)"))
                bills_cols = [row[1] for row in res.fetchall()]
                if "order_type" not in bills_cols:
                    _log.info("Migrating SQLite: Adding order_type column to bills table")
                    conn.execute(
                        text("ALTER TABLE bills ADD COLUMN order_type TEXT DEFAULT 'dine-in'")
                    )
                if "table_no" not in bills_cols:
                    _log.info("Migrating SQLite: Adding table_no column to bills table")
                    conn.execute(text("ALTER TABLE bills ADD COLUMN table_no TEXT"))

                # 4. Add variations to products
                res = conn.execute(text("PRAGMA table_info(products)"))
                product_cols = [row[1] for row in res.fetchall()]
                if "variations" not in product_cols:
                    _log.info("Migrating SQLite: Adding variations column to products table")
                    conn.execute(
                        text("ALTER TABLE products ADD COLUMN variations TEXT DEFAULT '[]'")
                    )
                # 5. Add takeaway_price to products
                if "takeaway_price" not in product_cols:
                    _log.info("Migrating SQLite: Adding takeaway_price column to products table")
                    conn.execute(text("ALTER TABLE products ADD COLUMN takeaway_price FLOAT"))
            _log.info("Programmatic SQLite migrations completed successfully")
    except Exception as e:
        _log.error("Error during programmatic SQLite migrations: %s", e)


if __name__ == "__main__":
    import argparse
    import sys
    from sqlalchemy import text

    # Parse command line arguments
    parser = argparse.ArgumentParser(description="POS Backend Server")
    parser.add_argument("--data-dir", help="Path to data directory")
    parser.add_argument("--port", type=int, default=5050, help="Port to run server on")
    args = parser.parse_args()

    # Set data directory if provided
    if args.data_dir:
        os.environ["POS_DATA_DIR"] = args.data_dir
        _log.info("Data directory overridden: %s", args.data_dir)

    # Create app and run
    # If frozen (PyInstaller), use 'production' config by default
    config_name = "production" if getattr(sys, "frozen", False) else "development"
    app = create_app(config_name)
    from models import db

    # Create tables if they don't exist
    try:
        with app.app_context():
            db.create_all()
            _log.info("Database tables created/verified")

            # Run programmatic column migrations on SQLite
            run_programmatic_sqlite_migrations(app, db)

            # Execute database migrations programmatically
            migrations_dir = os.path.join(app.config["BASE_DIR"], "migrations")
            if os.path.exists(migrations_dir):
                try:
                    from flask_migrate import upgrade

                    _log.info("Running database migrations from: %s", migrations_dir)
                    upgrade(directory=migrations_dir)
                    _log.info("Database migrations completed successfully")
                except Exception as migrate_err:
                    _log.error("Failed to run database migrations: %s", migrate_err)
    except Exception as e:
        _log.error("Error creating database tables: %s", e)

    # Perform Database Health Check
    db_health_check(app, db)

    # Ensure data directory exists
    try:
        os.makedirs(app.config["DATA_DIR"], exist_ok=True)
        os.makedirs(app.config["BILLS_DIR"], exist_ok=True)
        os.makedirs(app.config["ARCHIVE_DIR"], exist_ok=True)
        os.makedirs(app.config["EXPORT_DIR"], exist_ok=True)
        sounds_dir = os.path.join(app.config["DATA_DIR"], "Sound")
        os.makedirs(sounds_dir, exist_ok=True)

        # Seed default reminder.mp3 if it doesn't exist in the data directory
        default_sound_dest = os.path.join(sounds_dir, "reminder.mp3")
        if not os.path.exists(default_sound_dest):
            import shutil

            # Look for bundled default sound in multiple possible locations
            candidate_paths = []
            if getattr(sys, "frozen", False):
                # Production: bundled via PyInstaller in resources
                candidate_paths.append(os.path.join(sys._MEIPASS, "Sound", "reminder.mp3"))
                candidate_paths.append(
                    os.path.join(os.path.dirname(sys.executable), "Sound", "reminder.mp3")
                )
            # Dev / fallback: check relative to backend source
            candidate_paths.append(
                os.path.join(app.config["BASE_DIR"], "data", "Sound", "reminder.mp3")
            )

            for src_path in candidate_paths:
                if os.path.exists(src_path):
                    shutil.copy2(src_path, default_sound_dest)
                    _log.info("Seeded default reminder.mp3 from: %s", src_path)
                    break
            else:
                _log.warning("Default reminder.mp3 not found in any bundled location")
    except OSError as e:
        print(f"Error creating directories: {e}")
        # Continue anyway, might be permission issue handled by user

    # Start dashboard refresher in background thread
    refresher_thread = threading.Thread(target=start_dashboard_refresher, daemon=True)
    refresher_thread.start()

    _log.info("Starting InfoBill POS Backend...")
    _log.info("Data directory : %s", app.config["DATA_DIR"])
    _log.info("Server         : http://localhost:%d", args.port)
    _log.info("Debug mode     : %s", app.config["DEBUG"])

    if config_name == "production":
        _log.info("Using Waitress WSGI server for production")
        from waitress import serve

        backend_host = os.environ.get("BACKEND_HOST", "0.0.0.0")
        serve(app, host=backend_host, port=args.port)
    else:
        _log.info("Using Flask development server")
        backend_host = os.environ.get("BACKEND_HOST", "0.0.0.0")
        app.run(
            host=backend_host,
            port=args.port,
            debug=app.config["DEBUG"],
            use_reloader=False,  # Prevent duplicate refresher threads
        )
