"""
=============================================================================
 IN-MEMORY CACHE LAYER — cache.py (DISABLED)
=============================================================================
 Caching is disabled. All reads and writes are forced to run directly
 against the SQLite database to avoid stale or out-of-sync state.
=============================================================================
"""

import logging

logger = logging.getLogger(__name__)


def get(domain: str, key: str = "default"):
    """Always return None to force database reads."""
    return None


def set(domain: str, key: str, value, ttl: int = None):
    """No-op: do not cache values in memory."""
    pass


def invalidate(domain: str, key: str = None):
    """No-op: nothing to invalidate."""
    pass


def invalidate_all():
    """No-op: nothing to invalidate."""
    pass


def stats() -> dict:
    """Always return empty dict."""
    return {}
