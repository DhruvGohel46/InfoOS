"""
=============================================================================
 STRUCTURED LOGGING MODULE — logger.py
=============================================================================

 Provides:
   - JSON-formatted rotating file handler (10 MB × 5 backups)
   - Console handler for development
   - Request-level middleware: injects request_id, logs method/path/status/ms
   - Performance decorator for slow function detection
   - setup_logging(app)  — call once inside create_app()
   - register_logger_middleware(app)  — attach before/after_request hooks

 Log location:  <DATA_DIR>/logs/app.log
=============================================================================
"""

import os
import time
import uuid
import logging
import functools
from logging.handlers import RotatingFileHandler
from flask import request, g


# ---------------------------------------------------------------------------
# JSON-like formatter (no external dep required)
# ---------------------------------------------------------------------------
class _PrettyFormatter(logging.Formatter):
    """
    Outputs lines as:
        2026-05-02T14:00:00 | LEVEL    | module:lineno | message
    Keeps it human-readable in the console while still being parseable.
    """

    LEVEL_COLORS = {
        "DEBUG": "\033[36m",  # cyan
        "INFO": "\033[32m",  # green
        "WARNING": "\033[33m",  # yellow
        "ERROR": "\033[31m",  # red
        "CRITICAL": "\033[35m",  # magenta
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.LEVEL_COLORS.get(record.levelname, "")
        level = f"{color}{record.levelname:<8}{self.RESET}"
        loc = f"{record.module}:{record.lineno}"
        ts = self.formatTime(record, "%Y-%m-%dT%H:%M:%S")
        # Inject request_id if available
        rid = getattr(record, "request_id", "-")
        return f"{ts} | {level} | {loc:<28} | {record.getMessage()}  [{rid}]"


class _FileFormatter(logging.Formatter):
    """
    Structured pipe-separated format for the rotating log file.
    Easy to grep and import into log-analysis tools.
    """

    def format(self, record):
        ts = self.formatTime(record, "%Y-%m-%dT%H:%M:%S")
        rid = getattr(record, "request_id", "-")
        loc = f"{record.module}:{record.lineno}"
        msg = record.getMessage()
        if record.exc_info:
            msg += "\n" + self.formatException(record.exc_info)
        return f"{ts} | {record.levelname:<8} | {loc:<32} | {msg}  [rid={rid}]"


# ---------------------------------------------------------------------------
# setup_logging — call once inside create_app()
# ---------------------------------------------------------------------------
def setup_logging(app):
    """
    Initialise structured rotating file logging.
    Safe to call multiple times (idempotent handler check).
    """
    data_dir = app.config.get("DATA_DIR", "data")
    log_dir = os.path.join(data_dir, "logs")
    os.makedirs(log_dir, exist_ok=True)

    log_file = os.path.join(log_dir, "app.log")

    is_developer_mode = os.environ.get("DEVELOPER_MODE") == "true"
    level = logging.DEBUG if (app.config.get("DEBUG") or is_developer_mode) else logging.INFO

    root = logging.getLogger()

    # Avoid adding handlers twice (important with Flask's use_reloader=False)
    if any(isinstance(h, RotatingFileHandler) for h in root.handlers):
        return

    # ── Rotating file handler (10 MB × 5 backups = 50 MB max) ────────────
    fh = RotatingFileHandler(log_file, maxBytes=10 * 1024 * 1024, backupCount=5, encoding="utf-8")
    fh.setLevel(level)
    fh.setFormatter(_FileFormatter())

    # ── Console handler ───────────────────────────────────────────────────
    ch = logging.StreamHandler()
    ch.setLevel(level)
    ch.setFormatter(_PrettyFormatter())

    root.setLevel(level)
    root.addHandler(fh)
    root.addHandler(ch)

    # Suppress noisy third-party loggers (unless developer mode is ON)
    if is_developer_mode:
        logging.getLogger("werkzeug").setLevel(logging.DEBUG)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.INFO)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.INFO)
        logging.getLogger("schedule").setLevel(logging.INFO)
    else:
        logging.getLogger("werkzeug").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
        logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
        logging.getLogger("schedule").setLevel(logging.WARNING)

    app.logger.info("Logging initialised → %s  (level=%s)", log_file, logging.getLevelName(level))


# ---------------------------------------------------------------------------
# register_logger_middleware — attach to Flask app
# ---------------------------------------------------------------------------
def register_logger_middleware(app):
    """
    Attach before_request / after_request hooks.
    - Stamps each request with a UUID (X-Request-ID header or generated).
    - Logs method, path, status and wall-clock time after every response.
    - Skips /health and static image serving to keep logs clean.
    """
    _SKIP_PATHS = {"/health", "/api/images", "/api/sounds"}

    @app.before_request
    def _before():
        g.t0 = time.perf_counter()
        g.request_id = request.headers.get("X-Request-ID", str(uuid.uuid4())[:8])

    @app.after_request
    def _after(response):
        # Skip noisy paths
        if any(request.path.startswith(p) for p in _SKIP_PATHS):
            return response

        ms = (time.perf_counter() - getattr(g, "t0", time.perf_counter())) * 1000
        rid = getattr(g, "request_id", "-")

        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        if ms > 1000:  # slow-request warning
            level = logging.WARNING

        app.logger.log(
            level,
            "%s %s → %d  (%.0fms)",
            request.method,
            request.path,
            response.status_code,
            ms,
            extra={"request_id": rid},
        )
        response.headers["X-Request-ID"] = rid
        return response


# ---------------------------------------------------------------------------
# Decorator: log_perf
# ---------------------------------------------------------------------------
def log_perf(threshold_ms: float = 500):
    """
    Decorator that logs execution time of any function.
    Only emits a log line when the call exceeds `threshold_ms`.

    Usage:
        @log_perf(threshold_ms=200)
        def my_slow_query(): ...
    """

    def decorator(fn):
        _log = logging.getLogger(fn.__module__)

        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            t0 = time.perf_counter()
            try:
                return fn(*args, **kwargs)
            finally:
                ms = (time.perf_counter() - t0) * 1000
                if ms > threshold_ms:
                    _log.warning("SLOW  %s.%s  took %.0f ms", fn.__module__, fn.__qualname__, ms)

        return wrapper

    return decorator
