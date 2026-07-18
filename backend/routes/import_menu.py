"""
import_menu.py — Bulk Menu Ingestion Endpoint
==============================================
Accepts a .csv or .xlsx file upload and creates Groups → Categories → Products
following the structured import protocol defined in the menu format guide.

Processing rules (per guide):
  • Mandatory columns : Item Name, Category, Group, Price
  • Optional columns  : variation(1), variation(1) price,
                        variation(2), variation(2) price, takeaway add-on
  • variation(1) == "None" → standalone item, no variation array entries
  • takeaway add-on > 0    → takeaway_price = base_price + add-on
  • Currency symbols (₹ $ rs) in numeric slots → stripped, default 0.00
  • Duplicate product names → skipped (not duplicated)
"""

from flask import Blueprint, request, jsonify
from auth import require_admin
from services.db_service import DatabaseService
from error_handler import safe_route, ValidationError
import cache
import logging
import re
import uuid
import time
import io

logger = logging.getLogger(__name__)

import_menu_bp = Blueprint("import_menu", __name__, url_prefix="/api/import-menu")
db = DatabaseService()

# ── Column name constants (lowercase, stripped) ───────────────────────────────
COL_ITEM_NAME = "item name"
COL_CATEGORY = "category"
COL_GROUP = "group"
COL_PRICE = "price"
COL_VAR1 = "variation(1)"
COL_VAR1_PRICE = "variation(1) price"
COL_VAR2 = "variation(2)"
COL_VAR2_PRICE = "variation(2) price"
COL_TAKEAWAY = "takeaway add-on"

MANDATORY_COLS = {COL_ITEM_NAME, COL_CATEGORY, COL_GROUP, COL_PRICE}
OPTIONAL_COLS = {COL_VAR1, COL_VAR1_PRICE, COL_VAR2, COL_VAR2_PRICE, COL_TAKEAWAY}


# ── Helpers ───────────────────────────────────────────────────────────────────


def _strip_currency(value) -> float:
    """
    Extract a bare numeric float from a potentially currency-decorated string.
    e.g. "₹120", "$10.5", "rs 80" → 120.0, 10.5, 80.0
    Returns 0.0 on failure or blank.
    """
    if value is None:
        return 0.0
    s = str(value).strip()
    if s == "" or s.lower() in ("none", "null", "nan", "-"):
        return 0.0
    # Remove currency symbols and labels
    s = re.sub(r"[₹$€£¥rs]+", "", s, flags=re.IGNORECASE).strip()
    try:
        return float(s)
    except (ValueError, TypeError):
        return 0.0


def _safe_str(value, default="") -> str:
    """Return a clean stripped string or default if blank/null."""
    if value is None:
        return default
    s = str(value).strip()
    return default if s.lower() in ("", "nan", "none", "null") else s


def _normalize_col(name: str) -> str:
    """Lowercase and strip a column header for comparison."""
    return str(name).lower().strip()


def _update_catalog_version():
    db.update_settings_bulk([{"key": "catalog_version", "value": str(int(time.time()))}])
    cache.invalidate("settings")


# ── Ingestion logic ───────────────────────────────────────────────────────────


def _get_or_create_group(group_name: str, group_cache: dict) -> int | None:
    """Return group id, creating if needed. Uses a local dict to avoid repeated DB hits."""
    key = group_name.lower()
    if key in group_cache:
        return group_cache[key]

    existing = db.get_group_by_name(group_name, "default")
    if existing:
        group_cache[key] = existing["id"]
        return existing["id"]

    # Create new group
    new_id = db.create_group(
        {
            "organization_id": "default",
            "name": group_name,
            "description": "",
            "display_order": 0,
            "color": "",
            "icon": "",
            "is_active": True,
        }
    )
    if new_id:
        cache.invalidate("groups")
        group_cache[key] = new_id
        logger.info("Import: created group '%s' (id=%s)", group_name, new_id)
        return new_id

    logger.warning("Import: failed to create group '%s'", group_name)
    return None


def _get_or_create_category(cat_name: str, group_id: int | None, cat_cache: dict) -> int | None:
    """Return category id, creating if needed."""
    key = cat_name.lower()
    if key in cat_cache:
        return cat_cache[key]

    existing = db.get_category_by_name(cat_name)
    if existing:
        cat_cache[key] = existing["id"]
        return existing["id"]

    new_id = db.create_category(
        {
            "name": cat_name,
            "description": "",
            "active": True,
            "group_id": group_id,
        }
    )
    if new_id:
        cache.invalidate("categories")
        cat_cache[key] = new_id
        logger.info("Import: created category '%s' (id=%s)", cat_name, new_id)
        return new_id

    logger.warning("Import: failed to create category '%s'", cat_name)
    return None


def _build_variations(row: dict, col_map: dict) -> list:
    """
    Build the variations array for a product from a parsed row.

    Returns [] if variation(1) is absent or equals 'None'.
    """
    var1_col = col_map.get(COL_VAR1)
    if var1_col is None:
        return []

    var1_name = _safe_str(row.get(var1_col))
    if not var1_name or var1_name.lower() == "none":
        return []

    # Multi-variant item
    var1_price_col = col_map.get(COL_VAR1_PRICE)
    var2_col = col_map.get(COL_VAR2)
    var2_price_col = col_map.get(COL_VAR2_PRICE)

    var1_price = _strip_currency(row.get(var1_price_col)) if var1_price_col else 0.0

    variations = [{"id": str(uuid.uuid4()), "name": var1_name, "price": var1_price}]

    if var2_col:
        var2_name = _safe_str(row.get(var2_col))
        if var2_name and var2_name.lower() != "none":
            var2_price = _strip_currency(row.get(var2_price_col)) if var2_price_col else var1_price
            variations.append({"id": str(uuid.uuid4()), "name": var2_name, "price": var2_price})

    return variations


def _process_rows(rows: list, col_map: dict) -> dict:
    """
    Core ingestion loop. Returns:
      { created: [...], skipped: [...], errors: [...] }
    """
    created = []
    skipped = []
    errors = []

    group_cache: dict = {}
    cat_cache: dict = {}

    # Pre-load all existing product names (lowercase) to detect duplicates fast
    try:
        existing_products = db.get_all_products(include_inactive=True)
        existing_names = {p["name"].lower() for p in existing_products}
    except Exception as exc:
        logger.error("Import: failed to load existing products: %s", exc)
        existing_names = set()

    for idx, row in enumerate(rows, start=2):  # Row 1 = header
        row_label = f"Row {idx}"

        # ── Mandatory field extraction ────────────────────────────────────────
        item_name = _safe_str(row.get(col_map.get(COL_ITEM_NAME, "")))
        category_name = _safe_str(row.get(col_map.get(COL_CATEGORY, "")))
        group_name = _safe_str(row.get(col_map.get(COL_GROUP, "")))
        price_raw = row.get(col_map.get(COL_PRICE, ""))

        if not item_name:
            skipped.append({"row": row_label, "reason": "Item Name is blank"})
            continue
        if not category_name:
            skipped.append({"row": row_label, "name": item_name, "reason": "Category is blank"})
            continue
        if not group_name:
            skipped.append({"row": row_label, "name": item_name, "reason": "Group is blank"})
            continue

        price = _strip_currency(price_raw)
        if price <= 0 and price_raw not in (0, "0", 0.0):
            # A non-zero value was supplied but couldn't parse — still allow 0 price items
            pass

        # ── Duplicate check ───────────────────────────────────────────────────
        if item_name.lower() in existing_names:
            skipped.append(
                {
                    "row": row_label,
                    "name": item_name,
                    "reason": "Product already exists (skipped to prevent duplicate)",
                }
            )
            continue

        # ── Group & Category resolution ───────────────────────────────────────
        try:
            group_id = _get_or_create_group(group_name, group_cache)
            cat_id = _get_or_create_category(category_name, group_id, cat_cache)
        except Exception as exc:
            errors.append({"row": row_label, "name": item_name, "reason": str(exc)})
            continue

        # ── Variations ────────────────────────────────────────────────────────
        try:
            variations = _build_variations(row, col_map)
        except Exception as exc:
            errors.append(
                {"row": row_label, "name": item_name, "reason": f"Variation parse error: {exc}"}
            )
            continue

        # ── Takeaway surcharge ────────────────────────────────────────────────
        takeaway_col = col_map.get(COL_TAKEAWAY)
        takeaway_addon = _strip_currency(row.get(takeaway_col)) if takeaway_col else 0.0
        takeaway_price = round(price + takeaway_addon, 2) if takeaway_addon > 0 else None

        # ── Build & persist product ───────────────────────────────────────────
        import json as _json

        product_id = str(uuid.uuid4())[:20].replace("-", "")
        product_data = {
            "product_id": product_id,
            "name": item_name,
            "price": price,
            "takeaway_price": takeaway_price,
            "category_id": cat_id,
            "category": category_name,
            "active": True,
            "variations": _json.dumps(variations),
        }

        try:
            success = db.create_product(product_data)
            if success:
                existing_names.add(item_name.lower())  # prevent intra-file duplicates
                created.append({"row": row_label, "name": item_name})
                logger.info("Import: created product '%s'", item_name)
            else:
                errors.append(
                    {
                        "row": row_label,
                        "name": item_name,
                        "reason": "DB create_product returned False (possible duplicate ID)",
                    }
                )
        except Exception as exc:
            errors.append({"row": row_label, "name": item_name, "reason": str(exc)})

    # Flush caches once after full import
    if created:
        cache.invalidate("products")
        cache.invalidate("products_with_stock")
        _update_catalog_version()

    return {"created": created, "skipped": skipped, "errors": errors}


# ── Flask route ───────────────────────────────────────────────────────────────


@import_menu_bp.route("", methods=["POST"])
@require_admin
@safe_route
def import_menu():
    """
    POST /api/import-menu
    Multipart: file=<csv or xlsx>

    Parses the menu file and bulk-creates groups, categories, and products.
    Returns a JSON summary:
      { success, message, stats: { created, skipped, errors }, details: {...} }
    """
    if "file" not in request.files:
        raise ValidationError(
            "No file provided. Send a multipart/form-data request with a 'file' field.",
            code="MISSING_FILE",
        )

    upload = request.files["file"]
    filename = upload.filename or ""

    if not filename:
        raise ValidationError("File has no name.", code="EMPTY_FILENAME")

    ext = filename.rsplit(".", 1)[-1].lower()
    if ext not in ("csv", "xlsx", "xls"):
        raise ValidationError(
            f"Unsupported file type '.{ext}'. Please upload a .csv or .xlsx file.",
            code="UNSUPPORTED_FORMAT",
        )

    # ── Read file into pandas DataFrame ──────────────────────────────────────
    try:
        import pandas as pd

        file_bytes = io.BytesIO(upload.read())

        if ext == "csv":
            df = pd.read_csv(file_bytes, dtype=str, keep_default_na=False)
        else:
            df = pd.read_excel(file_bytes, dtype=str, keep_default_na=False)

        # Drop completely empty rows
        df.dropna(how="all", inplace=True)
        df = df[df.apply(lambda r: r.str.strip().ne("").any(), axis=1)]

    except Exception as exc:
        logger.error("Import: failed to parse uploaded file: %s", exc)
        raise ValidationError(f"Could not read the uploaded file: {exc}", code="FILE_PARSE_ERROR")

    if df.empty:
        raise ValidationError("The uploaded file contains no data rows.", code="EMPTY_FILE")

    # ── Build column map: normalised-name → actual DataFrame column ──────────
    col_map: dict = {}
    missing_mandatory: list = []

    for actual_col in df.columns:
        normalised = _normalize_col(actual_col)
        if normalised in MANDATORY_COLS | OPTIONAL_COLS:
            col_map[normalised] = actual_col

    for mandatory in MANDATORY_COLS:
        if mandatory not in col_map:
            missing_mandatory.append(mandatory.title())

    if missing_mandatory:
        raise ValidationError(
            f"Missing mandatory column(s): {', '.join(missing_mandatory)}. "
            "Please check the format guide and re-upload.",
            code="MISSING_MANDATORY_COLUMNS",
        )

    # ── Process rows ──────────────────────────────────────────────────────────
    rows = df.to_dict(orient="records")
    result = _process_rows(rows, col_map)

    total_rows = len(rows)
    n_created = len(result["created"])
    n_skipped = len(result["skipped"])
    n_errors = len(result["errors"])

    message = (
        f"Import complete: {n_created} product(s) created, "
        f"{n_skipped} skipped, {n_errors} error(s)."
    )

    logger.info("Import summary for '%s': %s", filename, message)

    return (
        jsonify(
            {
                "success": True,
                "message": message,
                "stats": {
                    "total_rows": total_rows,
                    "created": n_created,
                    "skipped": n_skipped,
                    "errors": n_errors,
                },
                "details": result,
            }
        ),
        200,
    )


@import_menu_bp.route("/sample-csv", methods=["GET"])
@safe_route
def download_sample_csv():
    """Send the format guide sample CSV file."""
    from flask import send_from_directory
    import os

    # Serve from the 'guide' directory in root
    guide_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "guide"))
    return send_from_directory(
        guide_dir,
        "menu_multi_group_format_guide.csv",
        as_attachment=True,
        download_name="menu_sample_format.csv",
    )


@import_menu_bp.route("/sample-xlsx", methods=["GET"])
@safe_route
def download_sample_xlsx():
    """Send the format guide sample Excel file."""
    from flask import send_from_directory
    import os

    # Serve from the 'guide' directory in root
    guide_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "guide"))
    return send_from_directory(
        guide_dir,
        "menu_multi_group_format_guide.xlsx",
        as_attachment=True,
        download_name="menu_sample_format.xlsx",
    )


@import_menu_bp.route("/bulk-json", methods=["POST"])
@require_admin
@safe_route
def import_menu_json():
    """
    POST /api/import-menu/bulk-json
    Body: { "products": [...], "master_name": "...", "menu_version": "..." }

    Performs:
    1. Validation
    2. Local Backup: Saves the current categories, groups, and products to backups/menu_backup_YYYYMMDD_HHMMSS.json
    3. Import: Wipes existing local groups, categories, subcategories, products and replaces them with new data.
    4. Save Import History: Inserts into import_history table.
    """
    from flask import current_app
    from datetime import datetime
    import os
    import json
    from models import (
        db as sa_db,
        Product as SaProduct,
        Category as SaCategory,
        ItemGroup as SaItemGroup,
        ImportHistory as SaImportHistory,
    )

    payload = request.get_json() or {}
    products_list = payload.get("products")
    master_name = payload.get("master_name", "Master Franchise")
    menu_version = payload.get("menu_version", "1.0.0")

    if not isinstance(products_list, list):
        raise ValidationError("Payload must contain a 'products' array.", code="INVALID_PAYLOAD")

    # 1. Backup local menu database
    backup_path = ""
    try:
        # Build backup data
        all_products = db.get_all_products(include_inactive=True)
        backup_data = {
            "backup_version": "1.0.0",
            "backed_up_at": datetime.now().isoformat(),
            "products": all_products,
        }

        data_dir = current_app.config.get("DATA_DIR", "data")
        backup_dir = os.path.join(data_dir, "backups")
        os.makedirs(backup_dir, exist_ok=True)

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_path = os.path.join(backup_dir, f"menu_backup_{timestamp}.json")

        with open(backup_path, "w", encoding="utf-8") as f:
            json.dump(backup_data, f, indent=2)

        logger.info("Local backup created successfully at: %s", backup_path)
    except Exception as exc:
        logger.error("Failed to create menu backup before import: %s", exc)
        raise ValidationError(f"Failed to create local backup: {exc}", code="BACKUP_FAILED")

    # 2. Wipe existing local products, categories, groups (Wipe & Replace)
    try:
        # SQLite raw SQL wipes
        sa_db.session.query(SaProduct).delete()
        sa_db.session.query(SaCategory).delete()
        sa_db.session.query(SaItemGroup).delete()
        sa_db.session.commit()
    except Exception as exc:
        logger.error("Wipe existing catalog failed: %s", exc)
        sa_db.session.rollback()
        raise ValidationError(f"Failed to wipe existing menu catalog: {exc}", code="WIPE_FAILED")

    # 3. Re-create categories & products
    created_count = 0
    skipped_count = 0
    errors = []

    group_cache = {}
    cat_cache = {}

    for idx, p in enumerate(products_list):
        try:
            name = p.get("name")
            category_name = p.get("category", "General")
            price = float(p.get("price", 0))
            product_code = p.get("product_code", p.get("sku", ""))
            description = p.get("description", "")
            image_filename = p.get("image", p.get("image_filename", ""))

            if not name:
                skipped_count += 1
                continue

            group_name = "Menu"
            group_id = _get_or_create_group(group_name, group_cache)
            cat_id = _get_or_create_category(category_name, group_id, cat_cache)

            variations = p.get("variants", p.get("variations", []))
            if isinstance(variations, str):
                try:
                    variations = json.loads(variations)
                except:
                    variations = []

            product_id = product_code if product_code else str(uuid.uuid4())[:20].replace("-", "")
            product_data = {
                "product_id": product_id,
                "name": name,
                "price": price,
                "takeaway_price": p.get("takeaway_price"),
                "category_id": cat_id,
                "category": category_name,
                "image_filename": image_filename,
                "active": p.get("available", p.get("active", True)),
                "variations": variations,
            }

            success = db.create_product(product_data)
            if success:
                created_count += 1
            else:
                errors.append(f"Failed to save product: {name}")
        except Exception as exc:
            errors.append(f"Error parsing product at index {idx}: {exc}")

    # 4. Save import history
    try:
        history = SaImportHistory(
            master_name=master_name,
            menu_version=menu_version,
            imported_at=datetime.now(),
            product_count=created_count,
            status="SUCCESS" if not errors else "PARTIAL",
        )
        sa_db.session.add(history)
        sa_db.session.commit()
    except Exception as exc:
        logger.error("Failed to save import history: %s", exc)

    # Invalidate caches
    cache.invalidate("products")
    cache.invalidate("products_with_stock")
    cache.invalidate("categories")
    cache.invalidate("groups")
    _update_catalog_version()

    return jsonify(
        {
            "success": True,
            "message": f"Successfully imported {created_count} products. Backup saved.",
            "backup_path": backup_path,
            "stats": {"created": created_count, "skipped": skipped_count, "errors": len(errors)},
            "errors": errors,
        }
    )
