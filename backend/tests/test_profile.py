import json
import pytest
from services.profile_service import ProfileService
from services.db_service import DatabaseService
from models import ShopProfile, Settings, db


def test_profile_initialization_and_defaults(app):
    """Test that profile is initialized with approved fields in profile.db."""
    with app.app_context():
        profile = ProfileService.get_profile()
        assert profile is not None
        assert "shop_name" in profile
        assert "brand_tagline" in profile
        assert "business_type" in profile
        assert "owner_name" in profile
        assert "logo_path" in profile
        assert "shop_address" in profile
        assert "city" in profile
        assert "state" in profile
        assert "pincode" in profile
        assert "shop_contact" in profile
        assert "email" in profile
        assert "website_url" in profile
        assert "gst_no" in profile
        assert "fssai_lic_no" in profile
        assert "pan_no" in profile
        assert "open_time" in profile
        assert "close_time" in profile
        assert "business_day_cutoff" in profile
        assert "seating_capacity" in profile
        assert "currency_symbol" in profile
        assert "currency_code" in profile
        assert "default_tax_rate" in profile
        assert "store_description" in profile
        assert "ai_communication_tone" in profile


def test_profile_api_get_and_put(client, app):
    """Test GET and PUT /api/profile endpoints."""
    # 1. GET /api/profile
    res = client.get("/api/profile")
    assert res.status_code == 200
    data = res.get_json()
    assert data["success"] is True
    assert "profile" in data
    assert "ai_context" in data

    # 2. PUT /api/profile
    update_payload = {
        "shop_name": "Antigravity Gourmet Cafe",
        "brand_tagline": "Specialty Coffee & Bakery",
        "business_type": "Cafe & Bakery",
        "owner_name": "Dhruv",
        "city": "Ahmedabad",
        "state": "Gujarat",
        "pincode": "380015",
        "shop_contact": "+91 99999 88888",
        "email": "cafe@antigravity.io",
        "gst_no": "24ABCDE1234F1Z9",
        "fssai_lic_no": "10020030040050",
        "seating_capacity": 45,
        "currency_symbol": "₹",
        "store_description": "Artisanal coffee and wood-fired artisanal pastries.",
        "ai_communication_tone": "Warm & Welcoming",
    }

    put_res = client.put(
        "/api/profile", data=json.dumps(update_payload), content_type="application/json"
    )
    assert put_res.status_code == 200
    put_data = put_res.get_json()
    assert put_data["success"] is True
    assert put_data["profile"]["shop_name"] == "Antigravity Gourmet Cafe"
    assert put_data["profile"]["owner_name"] == "Dhruv"
    assert put_data["profile"]["seating_capacity"] == 45
    assert "Antigravity Gourmet Cafe" in put_data["ai_context"]

    # 3. Verify DatabaseService gets the synced shop_name
    with app.app_context():
        db_svc = DatabaseService()
        all_settings = db_svc.get_all_settings()
        assert all_settings["shop_name"] == "Antigravity Gourmet Cafe"
        assert all_settings["gst_no"] == "24ABCDE1234F1Z9"


def test_ai_context_generation(app):
    """Test AI prompt grounding string format."""
    with app.app_context():
        ProfileService.update_profile(
            {
                "shop_name": "Royal Bistro",
                "business_type": "Fine Dine",
                "owner_name": "Chef Alex",
                "city": "Mumbai",
                "ai_communication_tone": "Concise & Professional",
            }
        )
        ai_context = ProfileService.get_ai_system_context()
        assert "Store: Royal Bistro" in ai_context
        assert "Type: Fine Dine" in ai_context
        assert "Owner: Chef Alex" in ai_context
        assert "Location: Mumbai" in ai_context
