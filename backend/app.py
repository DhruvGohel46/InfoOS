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

    # Enable CORS for all routes
    CORS(
        app,
        resources={
            r"/api/*": {
                "origins": "*",
                "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                "allow_headers": ["Content-Type", "Authorization"],
            }
        },
    )

    # Register blueprints
    app.register_blueprint(products_bp)
    app.register_blueprint(billing_bp)
    app.register_blueprint(summary_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(categories_bp)
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
        os.makedirs(os.path.join(app.config["DATA_DIR"], "Sound"), exist_ok=True)
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

        serve(app, host="0.0.0.0", port=args.port)
    else:
        _log.info("Using Flask development server")
        app.run(
            host="0.0.0.0",
            port=args.port,
            debug=app.config["DEBUG"],
            use_reloader=False,  # Prevent duplicate refresher threads
        )
