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


def test_inventory_batch_lifecycle_and_expiry(client, init_database):
    """
    Test adding a batch with expiry date, retrieving batches,
    fetching expiring inventory, and deleting a batch.
    """
    from datetime import date, timedelta
    from models import Inventory

    with client.application.app_context():
        inv = Inventory.query.filter_by(product_id="TEST-1").first()
        inv_id = inv.id
        initial_stock = inv.stock

    tomorrow = (date.today() + timedelta(days=1)).isoformat()

    # 1. Add a batch of 10 units with tomorrow's expiry
    batch_payload = {
        "inventory_id": inv_id,
        "quantity": 10.0,
        "expiry_date": tomorrow,
        "batch_number": "LOT-999",
        "cost_per_unit": 25.0,
    }
    res = client.post(
        "/api/inventory/batches",
        data=json.dumps(batch_payload),
        content_type="application/json",
    )
    assert res.status_code == 201
    batch_data = json.loads(res.data)
    assert batch_data["success"] is True
    batch_id = batch_data["batch_id"]
    assert isinstance(batch_id, int)

    # 2. Verify stock increased by 10 on the inventory item
    res = client.get(f"/api/inventory/{inv_id}")
    assert res.status_code == 200
    item_data = json.loads(res.data)["item"]
    assert item_data["stock"] == initial_stock + 10.0
    assert item_data["batch_count"] >= 1

    # 3. List batches for this inventory item
    res = client.get(f"/api/inventory/batches/{inv_id}")
    assert res.status_code == 200
    batches_data = json.loads(res.data)
    assert batches_data["success"] is True
    assert any(b["id"] == batch_id for b in batches_data["batches"])

    # 4. Check expiring items endpoint
    res = client.get("/api/inventory/expiring?days=7")
    assert res.status_code == 200
    exp_data = json.loads(res.data)
    assert exp_data["success"] is True
    assert exp_data["count"] >= 1
    assert any(item["id"] == inv_id for item in exp_data["items"])

    # 5. Delete the batch and verify stock decrement
    res = client.delete(f"/api/inventory/batches/{batch_id}")
    assert res.status_code == 200
    del_data = json.loads(res.data)
    assert del_data["success"] is True

    res = client.get(f"/api/inventory/{inv_id}")
    assert res.status_code == 200
    item_data_after = json.loads(res.data)["item"]
    assert item_data_after["stock"] == initial_stock
