"""
=============================================================================
 POS BOOTSTRAP ROUTE — routes/pos.py
=============================================================================

 API Aggregation endpoint that returns everything the POS screen needs
 in a single request.  Eliminates 5+ separate API calls on POS load.

 GET /api/pos/bootstrap
 →  products, categories, workers, settings, next_bill_number
=============================================================================
"""

from flask import Blueprint, jsonify
from auth import require_auth
from error_handler import safe_route
import cache
from services.db_service import DatabaseService
from models import db, Bill, Worker, Settings
from sqlalchemy import func
from datetime import date
import logging

logger = logging.getLogger(__name__)

pos_bp = Blueprint("pos", __name__, url_prefix="/api/pos")
db_service = DatabaseService()


@pos_bp.route("/bootstrap", methods=["GET"])
@safe_route
def bootstrap():
    """Single aggregated endpoint for POS initialization.

    Pulls from in-memory cache when available, falls back to DB.
    This replaces 5 separate API calls:
      GET /products
      GET /categories
      GET /workers
      GET /settings
      GET /bill/next-number
    """
    # 1. Products (with stock)
    products = cache.get("products_with_stock", "active")
    if products is None:
        products = db_service.get_all_products_with_stock(include_inactive=False)
        cache.set("products_with_stock", "active", products)

    # 2. Categories
    categories = cache.get("categories", "active")
    if categories is None:
        categories = db_service.get_all_categories(include_inactive=False)
        cache.set("categories", "active", categories)

    # 3. Workers
    workers = cache.get("workers", "active")
    if workers is None:
        worker_objs = Worker.query.filter_by(status="active").all()
        workers = [
            {
                "worker_id": w.worker_id,
                "name": w.name,
                "role": w.role,
                "phone": w.phone,
                "status": w.status,
            }
            for w in worker_objs
        ]
        cache.set("workers", "active", workers)

    # 4. Settings
    settings = cache.get("settings", "all")
    if settings is None:
        settings = db_service.get_all_settings()
        cache.set("settings", "all", settings)

    # 5. Next bill number (always fresh — lightweight query)
    today = date.today()
    max_bill = (
        db.session.query(func.max(Bill.bill_no))
        .filter(func.date(Bill.created_at) == today)
        .scalar()
    )
    next_bill_number = (max_bill or 0) + 1

    return jsonify(
        {
            "success": True,
            "products": products,
            "categories": categories,
            "workers": workers,
            "settings": settings,
            "next_bill_number": next_bill_number,
            "_cache_stats": cache.stats(),
        }
    )
