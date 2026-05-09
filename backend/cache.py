"""
=============================================================================
 IN-MEMORY CACHE LAYER — cache.py
=============================================================================

 Production SaaS pattern: cache frequently-read, rarely-changed data in
 process memory so the database is only hit on cold-start or after mutation.

 Uses cachetools.TTLCache — entries expire after a configurable TTL.
 Explicit invalidation is called after any write (POST/PUT/DELETE) so
 stale data is never served to the POS.

 This replaces the need for Redis in a single-server deployment.
=============================================================================
"""

from cachetools import TTLCache
import threading
import logging

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Cache configuration
# ---------------------------------------------------------------------------
# Max items per cache bucket.  Each bucket holds ONE key (the full dataset).
# TTL is in seconds.
_DEFAULT_TTL = 300  # 5 minutes
_SETTINGS_TTL = 600  # 10 minutes  (settings rarely change)
_WORKERS_TTL = 600  # 10 minutes

_lock = threading.Lock()

# Individual cache stores keyed by domain
_caches = {
    "products": TTLCache(maxsize=8, ttl=_DEFAULT_TTL),
    "products_with_stock": TTLCache(maxsize=8, ttl=_DEFAULT_TTL),
    "categories": TTLCache(maxsize=8, ttl=_DEFAULT_TTL),
    "settings": TTLCache(maxsize=4, ttl=_SETTINGS_TTL),
    "workers": TTLCache(maxsize=4, ttl=_WORKERS_TTL),
}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def get(domain: str, key: str = "default"):
    """
    Return cached value or None if not present / expired.

    Usage:
        data = cache.get('products', 'active')
        if data is None:
            data = db.get_all_products()
            cache.set('products', 'active', data)
    """
    store = _caches.get(domain)
    if store is None:
        return None
    with _lock:
        return store.get(key)


def set(domain: str, key: str, value, ttl: int = None):
    """
    Store a value in the cache.

    If `ttl` is provided it replaces the store for that domain with a
    fresh TTLCache using the new TTL — use sparingly (mostly for testing).
    """
    global _caches
    with _lock:
        store = _caches.get(domain)
        if store is None:
            # Auto-create a new bucket
            _caches[domain] = TTLCache(maxsize=8, ttl=ttl or _DEFAULT_TTL)
            store = _caches[domain]
        store[key] = value
        logger.debug(f"CACHE SET  [{domain}:{key}]  ({len(store)} entries)")


def invalidate(domain: str, key: str = None):
    """
    Invalidate (clear) cached data.

    - If `key` is None → clear the entire domain bucket.
    - If `key` is given → remove only that key.
    """
    store = _caches.get(domain)
    if store is None:
        return
    with _lock:
        if key is None:
            store.clear()
            logger.debug(f"CACHE INVALIDATE  [{domain}] (all keys)")
        else:
            store.pop(key, None)
            logger.debug(f"CACHE INVALIDATE  [{domain}:{key}]")


def invalidate_all():
    """Nuclear option — clear every cache bucket."""
    with _lock:
        for store in _caches.values():
            store.clear()
    logger.debug("CACHE INVALIDATE ALL")


def stats() -> dict:
    """Return a snapshot of cache sizes for debugging."""
    with _lock:
        return {domain: len(store) for domain, store in _caches.items()}
