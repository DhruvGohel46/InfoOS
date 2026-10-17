import logging
from typing import Dict, Any, Optional
from datetime import datetime
from models import db, ShopProfile, Settings

logger = logging.getLogger(__name__)

# Mapping between ShopProfile fields and Settings table keys for backward compatibility
PROFILE_TO_SETTINGS_MAP = {
    "shop_name": "shop_name",
    "shop_address": "shop_address",
    "shop_contact": "shop_contact",
    "gst_no": "gst_no",
    "currency_symbol": "currency_symbol",
    "logo_path": "logo_url",
    "open_time": "shop_open_time",
    "close_time": "shop_close_time",
    "business_day_cutoff": "business_day_cutoff_time",
}


class ProfileService:
    """Service for managing the shop profile stored in the dedicated profile.db."""

    @classmethod
    def get_profile_record(cls) -> ShopProfile:
        """Fetch or initialize the single ShopProfile record from profile.db."""
        try:
            profile = ShopProfile.query.first()
            if not profile:
                profile = ShopProfile(
                    shop_name="InfoOS Store",
                    brand_tagline="",
                    business_type="Restaurant",
                    owner_name="",
                    logo_path="",
                    shop_address="",
                    city="",
                    state="",
                    pincode="",
                    country="India",
                    shop_contact="",
                    email="",
                    website_url="",
                    gst_no="",
                    fssai_lic_no="",
                    pan_no="",
                    open_time="09:00",
                    close_time="23:00",
                    business_day_cutoff="02:00",
                    seating_capacity=0,
                    currency_symbol="₹",
                    currency_code="INR",
                    default_tax_rate=0.0,
                    store_description="",
                    ai_communication_tone="Concise & Professional",
                )
                db.session.add(profile)
                db.session.commit()
            return profile
        except Exception as e:
            logger.error("Error retrieving ShopProfile: %s", e)
            db.session.rollback()
            return ShopProfile()

    @classmethod
    def get_profile(cls) -> Dict[str, Any]:
        """Return the shop profile as a flat dictionary."""
        record = cls.get_profile_record()
        return record.to_dict() if record else {}

    @classmethod
    def update_profile(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update shop profile fields in profile.db and keep settings in sync."""
        try:
            profile = cls.get_profile_record()
            if not profile:
                profile = ShopProfile()
                db.session.add(profile)

            # Update known columns on ShopProfile
            updatable_fields = [
                "shop_name",
                "brand_tagline",
                "business_type",
                "owner_name",
                "logo_path",
                "shop_address",
                "city",
                "state",
                "pincode",
                "country",
                "latitude",
                "longitude",
                "shop_contact",
                "email",
                "website_url",
                "gst_no",
                "fssai_lic_no",
                "pan_no",
                "open_time",
                "close_time",
                "business_day_cutoff",
                "seating_capacity",
                "currency_symbol",
                "currency_code",
                "default_tax_rate",
                "store_description",
                "ai_communication_tone",
            ]

            # Also accept aliases like logo_url -> logo_path
            normalized_data = dict(data)
            if "logo_url" in normalized_data and "logo_path" not in normalized_data:
                normalized_data["logo_path"] = normalized_data["logo_url"]
            if "shop_open_time" in normalized_data and "open_time" not in normalized_data:
                normalized_data["open_time"] = normalized_data["shop_open_time"]
            if "shop_close_time" in normalized_data and "close_time" not in normalized_data:
                normalized_data["close_time"] = normalized_data["shop_close_time"]
            if (
                "business_day_cutoff_time" in normalized_data
                and "business_day_cutoff" not in normalized_data
            ):
                normalized_data["business_day_cutoff"] = normalized_data["business_day_cutoff_time"]

            for field in updatable_fields:
                if field in normalized_data:
                    val = normalized_data[field]
                    if field in ("latitude", "longitude"):
                        try:
                            val = float(val) if val not in (None, "") else None
                        except (ValueError, TypeError):
                            val = None
                    elif field == "seating_capacity":
                        try:
                            val = int(val)
                        except (ValueError, TypeError):
                            val = 0
                    elif field == "default_tax_rate":
                        try:
                            val = float(val)
                        except (ValueError, TypeError):
                            val = 0.0
                    else:
                        val = str(val).strip() if val is not None else ""
                    setattr(profile, field, val)

            profile.updated_at = datetime.now()

            # Sync matching fields to legacy settings table in pos.db for backward compatibility
            for profile_key, setting_key in PROFILE_TO_SETTINGS_MAP.items():
                if profile_key in normalized_data:
                    val_to_sync = str(normalized_data[profile_key])
                    setting_row = Settings.query.get(setting_key)
                    if setting_row:
                        setting_row.value = val_to_sync
                        setting_row.updated_at = datetime.now()
                    else:
                        db.session.add(
                            Settings(key=setting_key, value=val_to_sync, group_name="shop")
                        )

            db.session.commit()
            return profile.to_dict()
        except Exception as e:
            logger.error("Error updating ShopProfile: %s", e)
            db.session.rollback()
            raise e

    @classmethod
    def get_ai_system_context(cls) -> str:
        """Format an enriched context block describing the shop profile for AI agents."""
        p = cls.get_profile()
        parts = []
        if p.get("shop_name"):
            parts.append(f"Store: {p['shop_name']}")
        if p.get("business_type"):
            parts.append(f"Type: {p['business_type']}")
        if p.get("owner_name"):
            parts.append(f"Owner: {p['owner_name']}")
        if p.get("city") or p.get("state"):
            location = ", ".join(filter(None, [p.get("city"), p.get("state")]))
            parts.append(f"Location: {location}")
        if p.get("currency_symbol"):
            parts.append(f"Currency: {p['currency_symbol']} ({p.get('currency_code', 'INR')})")
        if p.get("open_time") and p.get("close_time"):
            parts.append(f"Hours: {p['open_time']} to {p['close_time']}")
        if p.get("store_description"):
            parts.append(f"About: {p['store_description']}")
        if p.get("ai_communication_tone"):
            parts.append(f"Preferred AI Tone: {p['ai_communication_tone']}")

        return " | ".join(parts) if parts else "InfoOS Retail/Restaurant Store"
