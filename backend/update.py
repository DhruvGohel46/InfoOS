import os
import sys
import subprocess
import shutil


def log(msg):
    print(f"[UpdateScript]: {msg}")
    sys.stdout.flush()


def backup_database():
    """Take a timestamped backup of pos.db before any migrations run."""
    try:
        data_dir = os.environ.get("POS_DATA_DIR") or os.path.join(
            os.path.dirname(sys.executable) if getattr(sys, "frozen", False)
            else os.path.dirname(os.path.abspath(__file__)),
            "data",
        )
        db_path = os.path.join(data_dir, "pos.db")
        if not os.path.exists(db_path):
            log("pos.db not found — skipping backup (first run)")
            return
        backup_path = db_path + ".pre_mobile_sync.bak"
        if not os.path.exists(backup_path):
            shutil.copy2(db_path, backup_path)
            log(f"Database backed up to: {backup_path}")
        else:
            log("Backup already exists — skipping")
    except Exception as e:
        log(f"WARNING: Could not back up database: {e}")


def migrate_mobile_sync_tables():
    """
    Create MobileSyncQueue and MobileSyncLog tables if they do not exist.
    Uses raw SQLite so this works without Flask app context.
    Safe to run multiple times (IF NOT EXISTS).
    """
    try:
        import sqlite3
        data_dir = os.environ.get("POS_DATA_DIR") or os.path.join(
            os.path.dirname(sys.executable) if getattr(sys, "frozen", False)
            else os.path.dirname(os.path.abspath(__file__)),
            "data",
        )
        db_path = os.path.join(data_dir, "pos.db")
        if not os.path.exists(db_path):
            log("pos.db not found — skipping mobile sync table migration")
            return

        conn = sqlite3.connect(db_path)
        cur = conn.cursor()

        cur.execute("""
            CREATE TABLE IF NOT EXISTS mobile_sync_queue (
                id           TEXT PRIMARY KEY,
                worker_id    TEXT NOT NULL,
                operation    TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                attempts     INTEGER DEFAULT 0,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_attempt DATETIME
            )
        """)

        cur.execute("""
            CREATE TABLE IF NOT EXISTS mobile_sync_log (
                id         TEXT PRIMARY KEY,
                worker_id  TEXT,
                operation  TEXT NOT NULL,
                status     TEXT NOT NULL,
                message    TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Indexes (IF NOT EXISTS not supported for indexes pre-SQLite 3.3.7, use try/except)
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_mobile_queue_attempts ON mobile_sync_queue(attempts)",
            "CREATE INDEX IF NOT EXISTS idx_mobile_queue_worker   ON mobile_sync_queue(worker_id)",
            "CREATE INDEX IF NOT EXISTS idx_mobile_log_status     ON mobile_sync_log(status)",
            "CREATE INDEX IF NOT EXISTS idx_mobile_log_worker     ON mobile_sync_log(worker_id)",
            "CREATE INDEX IF NOT EXISTS idx_mobile_log_created    ON mobile_sync_log(created_at)",
        ]:
            try:
                cur.execute(idx_sql)
            except Exception:
                pass

        conn.commit()
        conn.close()
        log("Mobile sync tables created/verified successfully.")
    except Exception as e:
        log(f"WARNING: Mobile sync table migration failed: {e}")


def main():
    log("Starting post-install updater script...")

    # Back up the database before running any migrations
    backup_database()

    # Create mobile sync tables
    migrate_mobile_sync_tables()

    # Run library dependency checks/upgrades
    try:
        log("Checking python library dependencies...")
        try:
            import openpyxl

            log(f"Current openpyxl version installed: {openpyxl.__version__}")
            # If version is older than 3.1.5, upgrade it programmatically
            ver_parts = [int(x) for x in openpyxl.__version__.split(".") if x.isdigit()]
            if len(ver_parts) >= 3 and (
                ver_parts[0] < 3
                or (ver_parts[0] == 3 and ver_parts[1] < 1)
                or (ver_parts[0] == 3 and ver_parts[1] == 1 and ver_parts[2] < 5)
            ):
                log("Upgrading openpyxl library dynamically...")
                subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl>=3.1.5"])
                log("openpyxl upgraded successfully.")
        except Exception as py_err:
            log(f"Dependency upgrade warning: {py_err}. Attempting pip install openpyxl...")
            try:
                subprocess.check_call([sys.executable, "-m", "pip", "install", "openpyxl>=3.1.5"])
            except Exception as pip_err:
                log(f"Failed to auto-upgrade openpyxl: {pip_err}")
    except Exception as e:
        log(f"Error checking dependencies: {e}")

    log("Updater script completed successfully.")


if __name__ == "__main__":
    main()
