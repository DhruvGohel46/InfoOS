"""
=============================================================================
 ROUTE CACHING LAYER — caching.py (DISABLED)
=============================================================================
 Uses Flask-Caching NullCache backend to bypass route caching.
 All summary, report, and POS API responses are computed fresh from database.
=============================================================================
"""

from flask_caching import Cache

# Set CACHE_TYPE to "NullCache" to disable all Flask route caching.
cache = Cache(config={"CACHE_TYPE": "NullCache"})
