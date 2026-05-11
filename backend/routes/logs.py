"""
=============================================================================
 LOGS API ROUTE — routes/logs.py
=============================================================================
 Exposes recent log lines for the optional admin log-viewer panel.
 GET /api/logs/recent?lines=100&level=WARNING
=============================================================================
"""

from flask import Blueprint, request, jsonify
from auth import require_admin
from error_handler import safe_route
import os
import logging

logger = logging.getLogger(__name__)
logs_bp = Blueprint("logs", __name__)


def _get_log_path():
    """Resolve the rotating log file path from DATA_DIR env var."""
    data_dir = os.environ.get("POS_DATA_DIR", "data")
    return os.path.join(data_dir, "logs", "app.log")


@logs_bp.route("/api/logs/recent", methods=["GET"])
@require_admin
@safe_route
def get_recent_logs():
    """
    Return the last N lines of the application log.
    Query params:
      - lines  (int, default 200, max 1000)
      - level  (str, optional) — filter to WARNING / ERROR / CRITICAL
    """
    n = min(int(request.args.get("lines", 200)), 1000)
    level = request.args.get("level", "").upper()

    log_path = _get_log_path()
    if not os.path.exists(log_path):
        return jsonify(
            {
                "success": True,
                "lines": [],
                "total": 0,
                "note": "Log file not yet created",
            }
        )

    try:
        with open(log_path, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()

        # Optionally filter by log level keyword
        if level in ("DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            all_lines = [l for l in all_lines if f"| {level}" in l]

        recent = all_lines[-n:]
        return jsonify(
            {
                "success": True,
                "lines": [l.rstrip("\n") for l in recent],
                "total": len(all_lines),
                "returned": len(recent),
                "log_path": log_path,
            }
        )
    except Exception as e:
        logger.error("Failed to read log file: %s", e)
        return jsonify({"success": False, "error": str(e)}), 500


@logs_bp.route("/api/logs/write", methods=["POST"])
@safe_route
def write_frontend_log():
    """
    Receive a log entry from the frontend (Electron renderer via fetch)
    and append it to the same rotating log at the given level.
    Body: { level, source, message, [extra fields] }
    This is the HTTP fallback — Electron also has the IPC writeLog channel.
    """
    data = request.json or {}
    level = data.get("level", "info").upper()
    source = data.get("source", "frontend")
    message = data.get("message", "")

    level_no = getattr(logging, level, logging.INFO)
    logging.getLogger(f"frontend.{source}").log(
        level_no, "[FRONTEND] %s", message, extra={"request_id": "fe"}
    )
    return jsonify({"success": True})
