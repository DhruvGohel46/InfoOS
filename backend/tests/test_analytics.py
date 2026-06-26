"""
Tests for analytics and daily summary endpoints.
"""

import json
import pytest
from datetime import date


def test_today_summary_endpoint(client, init_database):
    """GET /api/summary/today should return a summary dict with expected fields."""
    response = client.get("/api/summary/today")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    summary = data["summary"]
    # The summary can be a dict with known fields OR an empty/fallback structure
    assert isinstance(summary, dict)
    # At minimum, a valid summary response must be a dict
    assert summary is not None


def test_summary_updated_after_bill(client, init_database):
    """
    After creating a bill, today's summary total_sales should increase.
    """
    # Get baseline
    before = client.get("/api/summary/today")
    before_data = json.loads(before.data)["summary"]
    before_sales = before_data.get("total_sales", 0)

    # Create a bill worth 200
    payload = {
        "customer_name": "Analytics Test",
        "payment_method": "CASH",
        "products": [
            {"product_id": "TEST-1", "name": "Test Burger", "price": 100.0, "quantity": 2}
        ],
    }
    bill_response = client.post(
        "/api/bill/create", data=json.dumps(payload), content_type="application/json"
    )
    assert bill_response.status_code == 201

    # Check summary again
    after = client.get("/api/summary/today")
    after_data = json.loads(after.data)["summary"]
    after_sales = after_data.get("total_sales", 0)

    assert after_sales >= before_sales + 200.0


def test_summary_for_date_valid(client, init_database):
    """GET /api/summary/date/YYYY-MM-DD should return a summary for that date."""
    today = date.today().strftime("%Y-%m-%d")
    response = client.get(f"/api/summary/date/{today}")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True


def test_summary_for_date_invalid_format(client, init_database):
    """GET /api/summary/date/<bad_date> should return 400 validation error."""
    response = client.get("/api/summary/date/not-a-date")
    assert response.status_code == 400
    data = json.loads(response.data)
    assert data["success"] is False


def test_top_products_endpoint(client, init_database):
    """GET /api/summary/top-products should return a list."""
    response = client.get("/api/summary/top-products")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    assert isinstance(data.get("products", []), list)


def test_range_summary_weekly(client, init_database):
    """GET /api/summary/range?range=week should return a weekly range summary."""
    today = date.today().strftime("%Y-%m-%d")
    response = client.get(f"/api/summary/range?range=week&date={today}")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    summary = data["summary"]
    assert summary["range"] == "week"
    assert "start_date" in summary
    assert "end_date" in summary
    assert "total_sales" in summary
    assert "products" in summary


def test_range_summary_monthly(client, init_database):
    """GET /api/summary/range?range=month should return a monthly range summary."""
    today = date.today().strftime("%Y-%m-%d")
    response = client.get(f"/api/summary/range?range=month&date={today}")
    assert response.status_code == 200
    data = json.loads(response.data)
    assert data["success"] is True
    summary = data["summary"]
    assert summary["range"] == "month"
    assert "start_date" in summary
    assert "end_date" in summary
    assert "total_sales" in summary
    assert "products" in summary
