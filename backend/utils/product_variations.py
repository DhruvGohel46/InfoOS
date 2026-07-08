"""Helpers for optional product variations."""

from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional


def parse_variations(raw: Any) -> List[Dict[str, Any]]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return raw
    if isinstance(raw, str):
        if not raw.strip():
            return []
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, list) else []
        except (json.JSONDecodeError, TypeError):
            return []
    return []


def serialize_variations(variations: Any) -> str:
    normalized = normalize_variations(variations)
    return json.dumps(normalized)


def normalize_variations(variations: Any) -> List[Dict[str, Any]]:
    parsed = parse_variations(variations)
    normalized: List[Dict[str, Any]] = []

    for index, item in enumerate(parsed):
        if not isinstance(item, dict):
            continue

        name = str(item.get("name", "")).strip()
        if not name:
            continue

        try:
            price = float(item.get("price", 0))
        except (TypeError, ValueError):
            continue

        if price < 0:
            continue

        variation_id = str(item.get("id") or "").strip() or str(uuid.uuid4())
        normalized.append({"id": variation_id, "name": name, "price": price, "order": index})

    return normalized


def enrich_product_dict(product: Dict[str, Any]) -> Dict[str, Any]:
    variations = normalize_variations(product.get("variations"))
    product["variations"] = variations
    product["hasVariations"] = len(variations) > 0
    return product


def resolve_bill_line_item(product: Dict[str, Any], item_data: Dict[str, Any]) -> Dict[str, Any]:
    quantity = int(item_data["quantity"])
    variation_id = item_data.get("variation_id")
    variations = product.get("variations") or []
    has_variations = len(variations) > 0

    if has_variations:
        if not variation_id:
            raise ValueError(
                f'Product "{product.get("name", product.get("product_id"))}" requires a variation selection'
            )

        variation = next((v for v in variations if v.get("id") == variation_id), None)
        if not variation:
            raise ValueError("Invalid variation selected")

        return {
            "product_id": product["product_id"],
            "variation_id": variation_id,
            "variation_name": variation["name"],
            "name": f'{product["name"]} ({variation["name"]})',
            "price": float(variation["price"]),
            "quantity": quantity,
        }

    if variation_id:
        raise ValueError(
            f'Product "{product.get("name", product.get("product_id"))}" has no variations'
        )

    return {
        "product_id": product["product_id"],
        "name": product["name"],
        "price": float(product["price"]),
        "quantity": quantity,
    }


def sales_line_key(item: Dict[str, Any]) -> str:
    product_id = item.get("product_id", "unknown")
    variation_id = item.get("variation_id")
    if variation_id:
        return f"{product_id}:{variation_id}"
    return product_id
