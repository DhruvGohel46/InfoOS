"""
mobile_sync_service.py — Mobile App Sync Service
=================================================
Handles one-way sync of workers from InfoOS (SQLite) to Supabase.
All sync operations are fire-and-forget: failures queue locally and retry
when internet returns. Normal POS work is NEVER blocked or slowed.

Switched OFF by default. Enable via Settings → Mobile Sync tab.
"""

import logging
import secrets
import string
import threading
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ─── Thread safety ────────────────────────────────────────────────────────────
_flush_lock = threading.Lock()


# ─── Settings helpers ─────────────────────────────────────────────────────────

def _get_setting(key: str, default: str = "") -> str:
    """Read a single key from the Settings table (no caching — always fresh)."""
    try:
        from models import Settings
        row = Settings.query.filter_by(key=key).first()
        return row.value if row and row.value else default
    except Exception as e:
        logger.debug("mobile_sync: cannot read setting %s: %s", key, e)
        return default


def is_sync_enabled() -> bool:
    """Return True only if the owner has explicitly turned mobile sync on."""
    return _get_setting("mobile_sync_enabled", "false").lower() == "true"


def _get_supabase_url() -> str:
    return _get_setting("mobile_sync_supabase_url", "").strip()


def _get_supabase_key() -> str:
    return _get_setting("mobile_sync_supabase_anon_key", "").strip()


# ─── Supabase client ──────────────────────────────────────────────────────────

def _get_client():
    """
    Build and return a supabase-py client using credentials from Settings.
    Returns None if not configured or supabase package is unavailable.
    """
    url = _get_supabase_url()
    key = _get_supabase_key()
    if not url or not key:
        logger.debug("mobile_sync: Supabase URL/key not configured — skipping")
        return None
    try:
        from supabase import create_client  # lazy import — only load when needed
        return create_client(url, key)
    except ImportError:
        logger.warning(
            "mobile_sync: 'supabase' Python package not installed. "
            "Run: pip install supabase>=2.0.0"
        )
        return None
    except Exception as e:
        logger.warning("mobile_sync: failed to create Supabase client: %s", e)
        return None


# ─── Payload builder ──────────────────────────────────────────────────────────

def _build_worker_payload(worker) -> dict:
    """
    Convert a Worker ORM object to a dict safe to push to Supabase.
    Photos are excluded (too large; mobile app omits them for now).
    """
    return {
        "worker_id": worker.worker_id,
        "name": worker.name or "",
        "phone": worker.phone or "",
        "email": worker.email or "",
        "role": worker.role or "",
        "salary": float(worker.salary or 0.0),
        "join_date": worker.join_date.isoformat() if worker.join_date else None,
        "status": worker.status or "active",
        "synced_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── PIN generation ───────────────────────────────────────────────────────────

def generate_signup_pin() -> str:
    """Generate a cryptographically random 6-digit numeric PIN."""
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _hash_pin(plain_pin: str) -> str:
    """Return a bcrypt hash of the plain PIN for safe storage in Supabase."""
    import bcrypt  # already in requirements.txt
    return bcrypt.hashpw(plain_pin.encode(), bcrypt.gensalt()).decode()


# ─── Logging helpers ──────────────────────────────────────────────────────────

def _write_log(worker_id: Optional[str], operation: str, status: str, message: str = ""):
    """Append one row to MobileSyncLog. Silently swallows its own errors."""
    try:
        from models import db, MobileSyncLog
        entry = MobileSyncLog(
            worker_id=worker_id,
            operation=operation,
            status=status,
            message=message[:2000] if message else "",
        )
        db.session.add(entry)
        db.session.commit()
    except Exception as e:
        logger.debug("mobile_sync: could not write log entry: %s", e)
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass


def _enqueue(worker_id: str, operation: str, payload: dict):
    """Add a sync item to the local offline queue."""
    import json
    try:
        from models import db, MobileSyncQueue
        item = MobileSyncQueue(
            worker_id=worker_id,
            operation=operation,
            payload_json=json.dumps(payload),
        )
        db.session.add(item)
        db.session.commit()
        logger.info("mobile_sync: queued %s for worker %s", operation, worker_id)
    except Exception as e:
        logger.warning("mobile_sync: failed to enqueue %s for %s: %s", operation, worker_id, e)
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass


# ─── Core push logic ──────────────────────────────────────────────────────────

def _push_to_supabase(client, worker_id: str, operation: str, payload: dict) -> bool:
    """
    Attempt a single upsert/deactivate to Supabase.
    Returns True on success, False on failure.
    """
    try:
        if operation == "upsert":
            client.table("workers").upsert(payload).execute()
        elif operation == "deactivate":
            client.table("workers").update({"status": "inactive", "synced_at": payload["synced_at"]}).eq("worker_id", worker_id).execute()
        logger.info("mobile_sync: pushed %s for worker %s", operation, worker_id)
        return True
    except Exception as e:
        logger.warning("mobile_sync: push failed for worker %s: %s", worker_id, e)
        return False


# ─── Main entry point (called from WorkerService hooks) ──────────────────────

def sync_worker(worker_id: str, operation: str = "upsert", plain_pin: Optional[str] = None):
    """
    Called after every create_worker / update_worker / delete_worker commit.

    - If sync is disabled: returns silently (no overhead).
    - If online: pushes immediately, falls back to queue on failure.
    - If offline / misconfigured: queues for later retry.
    - NEVER raises — all errors are caught and logged.

    plain_pin: only provided on new-worker creation; hashed before sending.
    """
    if not is_sync_enabled():
        return

    try:
        from models import Worker
        worker = Worker.query.get(worker_id)
        if not worker:
            logger.debug("mobile_sync: worker %s not found, skipping", worker_id)
            return

        payload = _build_worker_payload(worker)

        # Attach hashed PIN if this is a first-time create with a PIN
        if plain_pin and operation == "upsert":
            try:
                payload["signup_pin_hash"] = _hash_pin(plain_pin)
                payload["pin_used"] = False
            except Exception as pe:
                logger.warning("mobile_sync: PIN hash failed: %s", pe)

        client = _get_client()
        if client is None:
            _enqueue(worker_id, operation, payload)
            _write_log(worker_id, operation, "queued", "Supabase client unavailable — queued for retry")
            return

        success = _push_to_supabase(client, worker_id, operation, payload)
        if success:
            _write_log(worker_id, operation, "success")
        else:
            _enqueue(worker_id, operation, payload)
            _write_log(worker_id, operation, "queued", "Push failed — queued for retry")

    except Exception as e:
        logger.warning("mobile_sync: sync_worker error (non-fatal): %s", e)
        try:
            _write_log(worker_id, operation, "error", str(e))
        except Exception:
            pass


# ─── Sync all workers (triggered by "Sync All" button) ───────────────────────

def sync_all_workers() -> dict:
    """
    Push every worker in pos.db to Supabase.
    Returns a summary dict: {total, success, error, queued}.
    """
    if not is_sync_enabled():
        return {"success": False, "error": "Mobile sync is disabled", "total": 0}

    client = _get_client()
    total = success = error = queued = 0

    try:
        from models import Worker
        workers = Worker.query.all()
        total = len(workers)

        for w in workers:
            try:
                payload = _build_worker_payload(w)
                if client:
                    ok = _push_to_supabase(client, w.worker_id, "upsert", payload)
                    if ok:
                        success += 1
                        _write_log(w.worker_id, "upsert", "success", "bulk sync")
                    else:
                        _enqueue(w.worker_id, "upsert", payload)
                        _write_log(w.worker_id, "upsert", "queued", "bulk sync push failed")
                        queued += 1
                else:
                    _enqueue(w.worker_id, "upsert", payload)
                    _write_log(w.worker_id, "upsert", "queued", "bulk sync — no client")
                    queued += 1
            except Exception as we:
                logger.warning("mobile_sync: sync_all error for %s: %s", w.worker_id, we)
                error += 1

    except Exception as e:
        logger.error("mobile_sync: sync_all_workers failed: %s", e)
        return {"success": False, "error": str(e), "total": total}

    return {
        "success": True,
        "total": total,
        "pushed": success,
        "queued": queued,
        "error": error,
    }


# ─── Offline queue flush ──────────────────────────────────────────────────────

MAX_ATTEMPTS = 10


def flush_queue() -> dict:
    """
    Retry all queued sync items.
    Called on startup and when network comes back online.
    Thread-safe — uses a lock so only one flush runs at a time.
    """
    if not _flush_lock.acquire(blocking=False):
        logger.debug("mobile_sync: flush_queue already running, skipping")
        return {"skipped": True}

    flushed = failed = 0
    try:
        if not is_sync_enabled():
            return {"skipped": True, "reason": "sync disabled"}

        client = _get_client()
        if client is None:
            return {"skipped": True, "reason": "no client"}

        import json
        from models import db, MobileSyncQueue

        items = (
            MobileSyncQueue.query
            .filter(MobileSyncQueue.attempts < MAX_ATTEMPTS)
            .order_by(MobileSyncQueue.created_at.asc())
            .all()
        )

        for item in items:
            try:
                payload = json.loads(item.payload_json) if item.payload_json else {}
                ok = _push_to_supabase(client, item.worker_id, item.operation, payload)
                if ok:
                    db.session.delete(item)
                    _write_log(item.worker_id, item.operation, "success", "retried from queue")
                    flushed += 1
                else:
                    item.attempts += 1
                    item.last_attempt = datetime.now(timezone.utc)
                    failed += 1
            except Exception as e:
                item.attempts += 1
                item.last_attempt = datetime.now(timezone.utc)
                failed += 1
                logger.debug("mobile_sync: flush item error: %s", e)

        db.session.commit()
        logger.info("mobile_sync: flush_queue — flushed=%d failed=%d", flushed, failed)
    except Exception as e:
        logger.warning("mobile_sync: flush_queue error: %s", e)
        try:
            from models import db
            db.session.rollback()
        except Exception:
            pass
    finally:
        _flush_lock.release()

    return {"flushed": flushed, "failed": failed}


# ─── Queue depth / status ─────────────────────────────────────────────────────

def get_queue_depth() -> int:
    """Return number of pending items in the offline queue."""
    try:
        from models import MobileSyncQueue
        return MobileSyncQueue.query.filter(MobileSyncQueue.attempts < MAX_ATTEMPTS).count()
    except Exception:
        return 0


def get_last_sync_time() -> Optional[str]:
    """Return ISO timestamp of the most recent successful sync log entry."""
    try:
        from models import MobileSyncLog
        row = (
            MobileSyncLog.query
            .filter_by(status="success")
            .order_by(MobileSyncLog.created_at.desc())
            .first()
        )
        return row.created_at.isoformat() if row else None
    except Exception:
        return None


# ─── Payroll sync stubs (prepared, NOT enabled) ───────────────────────────────

def sync_salary_payment(payment_id: str):
    """
    TODO: Enable when mobile app payroll feature is ready.
    Syncs a SalaryPayment row to Supabase worker_salaries table.
    Not called from anywhere yet — stub only.
    """
    pass  # noqa: unnecessary-pass


def sync_advance(advance_id: str):
    """
    TODO: Enable when mobile app payroll feature is ready.
    Syncs an Advance row to Supabase worker_advances table.
    Not called from anywhere yet — stub only.
    """
    pass  # noqa: unnecessary-pass

