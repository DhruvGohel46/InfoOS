"""
Tests for inventory endpoints and stock management logic.
"""

import json
import pytest


def test_get_all_inventory_returns_list(client, init_database):
    """GET /api/inventory should return a list of items."""
    response = client.get("/api/inventory")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    assert isinstance(data["inventory"], list)


def test_get_low_stock_returns_list(client, init_database):
    """GET /api/inventory/low-stock should return count and list."""
    response = client.get("/api/inventory/low-stock")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    assert "low_stock_items" in data
    assert "count" in data
    assert isinstance(data["low_stock_items"], list)


def test_stock_deduction_after_bill(client, init_database):
    """
    Creating a bill for a DIRECT_SALE inventory item should reduce its stock.
    Seed: TEST-1 product with 50 units in stock.
    """
    from models import Inventory

    # Capture stock before billing
    with client.application.app_context():
        inv = Inventory.query.filter_by(product_id="TEST-1").first()
        stock_before = inv.stock

    payload = {
        "customer_name": "Stock Test",
        "payment_method": "CASH",
        "products": [
            {"product_id": "TEST-1", "name": "Test Burger", "price": 100.0, "quantity": 2}
        ],
    }
    response = client.post(
        "/api/bill/create", data=json.dumps(payload), content_type="application/json"
    )
    assert response.status_code == 201

    # Stock should have decreased by the sold quantity
    with client.application.app_context():
        inv = Inventory.query.filter_by(product_id="TEST-1").first()
        assert inv.stock == stock_before - 2


def test_inventory_item_not_found(client, init_database):
    """GET /api/inventory/<id> with a non-existent ID should return 404."""
    response = client.get("/api/inventory/999999")
    assert response.status_code == 404
    data = json.loads(response.data)
    assert data["success"] is False
