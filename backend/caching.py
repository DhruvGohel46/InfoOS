"""
=============================================================================
 ROUTE CACHING LAYER — caching.py
=============================================================================
 Uses Flask-Caching to cache heavy API responses (like /api/summary/*).
 Automatically invalidated when mutations occur (e.g., new bill created).
=============================================================================
"""

from flask_caching import Cache

# Use SimpleCache (in-memory) for a single-server deployment.
# For multi-process/Gunicorn, you'd want Redis, but since this is an Electron
# wrapped local server, SimpleCache is perfect and zero-dependency.
cache = Cache(config={"CACHE_TYPE": "SimpleCache", "CACHE_DEFAULT_TIMEOUT": 300})
