"""
routes/mobile_sync.py — Mobile Sync REST Endpoints
===================================================
Flask blueprint exposing settings, sync-now, flush, log, and status
endpoints for the mobile worker sync feature.

All routes require admin authentication.
"""

from flask import Blueprint, jsonify, request
from auth import require_admin
from error_handler import safe_route, ValidationError
import logging

logger = logging.getLogger(__name__)

mobile_sync_bp = Blueprint("mobile_sync", __name__)


# ─── Settings ────────────────────────────────────────────────────────────────

@mobile_sync_bp.route("/api/mobile-sync/settings", methods=["GET"])
@require_admin
@safe_route
def get_mobile_sync_settings():
    """Return current mobile sync settings. Anon key is masked in the response."""
    from services.db_service import DatabaseService
    db_service = DatabaseService()
    all_settings = db_service.get_all_settings()

    url = all_settings.get("mobile_sync_supabase_url", "")
    key = all_settings.get("mobile_sync_supabase_anon_key", "")

    return jsonify({
        "success": True,
        "enabled": all_settings.get("mobile_sync_enabled", "false").lower() == "true",
        "supabase_url": url,
        "supabase_anon_key_set": bool(key),
        "supabase_anon_key_preview": (key[:8] + "••••••••") if key else "",
    })


@mobile_sync_bp.route("/api/mobile-sync/settings", methods=["PUT"])
@require_admin
@safe_route
def update_mobile_sync_settings():
    """Save sync settings to the Settings table."""
    data = request.json or {}
    if not isinstance(data, dict):
        raise ValidationError("Invalid request body", code="INVALID_BODY")

    from models import db, Settings

    def _upsert(key, value):
        row = Settings.query.filter_by(key=key).first()
        if row:
            row.value = str(value)
        else:
            db.session.add(Settings(key=key, value=str(value), group_name="mobile_sync"))

    # enabled flag
    if "enabled" in data:
        _upsert("mobile_sync_enabled", "true" if data["enabled"] else "false")

    # Supabase URL
    if "supabase_url" in data:
        url = str(data["supabase_url"]).strip()
        if url and not url.startswith("https://"):
            raise ValidationError("Supabase URL must start with https://", code="INVALID_URL")
        _upsert("mobile_sync_supabase_url", url)

    # Anon key (only update if a non-empty value is sent — empty means "keep existing")
    if "supabase_anon_key" in data and data["supabase_anon_key"]:
        _upsert("mobile_sync_supabase_anon_key", str(data["supabase_anon_key"]).strip())

    db.session.commit()

    # Invalidate settings cache so the service picks up new values immediately
    try:
        import cache
        cache.invalidate("settings")
    except Exception:
        pass

    return jsonify({"success": True, "message": "Mobile sync settings saved"})


# ─── Status ───────────────────────────────────────────────────────────────────

@mobile_sync_bp.route("/api/mobile-sync/status", methods=["GET"])
@require_admin
@safe_route
def get_mobile_sync_status():
    """Return queue depth, last sync time, and enabled flag."""
    from services.mobile_sync_service import (
        is_sync_enabled, get_queue_depth, get_last_sync_time
    )
    return jsonify({
        "success": True,
        "enabled": is_sync_enabled(),
        "queue_depth": get_queue_depth(),
        "last_sync": get_last_sync_time(),
    })


# ─── Sync All ─────────────────────────────────────────────────────────────────

@mobile_sync_bp.route("/api/mobile-sync/sync-all", methods=["POST"])
@require_admin
@safe_route
def sync_all_workers():
    """Push all workers to Supabase right now. Returns a progress summary."""
    from services.mobile_sync_service import sync_all_workers as _sync_all
    result = _sync_all()
    return jsonify(result)


# ─── Flush Queue ──────────────────────────────────────────────────────────────

@mobile_sync_bp.route("/api/mobile-sync/flush-queue", methods=["POST"])
@require_admin
@safe_route
def flush_queue():
    """Retry all queued sync items immediately (called when internet returns)."""
    from services.mobile_sync_service import flush_queue as _flush
    result = _flush()
    return jsonify({"success": True, **result})


# ─── Log ──────────────────────────────────────────────────────────────────────

@mobile_sync_bp.route("/api/mobile-sync/log", methods=["GET"])
@require_admin
@safe_route
def get_sync_log():
    """Return the last 200 sync log entries, newest first."""
    from models import MobileSyncLog, Worker
    from sqlalchemy.orm import joinedload

    limit = min(int(request.args.get("limit", 200)), 500)
    rows = (
        MobileSyncLog.query
        .order_by(MobileSyncLog.created_at.desc())
        .limit(limit)
        .all()
    )

    # Build a worker_id → name map for display
    worker_ids = list({r.worker_id for r in rows if r.worker_id})
    name_map = {}
    if worker_ids:
        workers = Worker.query.filter(Worker.worker_id.in_(worker_ids)).all()
        name_map = {w.worker_id: w.name for w in workers}

    return jsonify({
        "success": True,
        "log": [
            {
                "id": r.id,
                "worker_id": r.worker_id,
                "worker_name": name_map.get(r.worker_id, "—"),
                "operation": r.operation,
                "status": r.status,
                "message": r.message or "",
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ],
    })

