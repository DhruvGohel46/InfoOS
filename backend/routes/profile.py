from flask import Blueprint, jsonify, request
from services.profile_service import ProfileService
from error_handler import safe_route, ValidationError
import cache
import logging
import json
import urllib.request
import urllib.parse

logger = logging.getLogger(__name__)

profile_bp = Blueprint("profile", __name__)


@profile_bp.route("/api/profile", methods=["GET"])
@safe_route
def get_profile():
    """Retrieve full shop profile and generated AI grounding context from profile.db."""
    profile_data = ProfileService.get_profile()
    ai_context = ProfileService.get_ai_system_context()
    return jsonify({"success": True, "profile": profile_data, "ai_context": ai_context})


@profile_bp.route("/api/profile", methods=["PUT"])
@safe_route
def update_profile():
    """Update shop profile in profile.db and synchronize with settings."""
    data = request.json
    if not data or not isinstance(data, dict):
        raise ValidationError("Profile data must be a JSON object", code="INVALID_DATA")

    updated_profile = ProfileService.update_profile(data)
    cache.invalidate("settings")

    return jsonify(
        {
            "success": True,
            "message": "Shop profile updated successfully",
            "profile": updated_profile,
            "ai_context": ProfileService.get_ai_system_context(),
        }
    )


@profile_bp.route("/api/profile/detect-location", methods=["GET"])
@safe_route
def detect_location():
    """Detect store device location via network IP geolocation.

    Provides a fast, zero-permission fallback for desktop PCs / Electron apps
    where hardware GPS is unavailable or browser network service is unconfigured.
    """
    # 1. Primary: ipapi.co
    try:
        req = urllib.request.Request(
            "https://ipapi.co/json/", headers={"User-Agent": "InfoOS-POS/1.0"}
        )
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if "latitude" in data and "longitude" in data:
                return (
                    jsonify(
                        {
                            "success": True,
                            "latitude": float(data["latitude"]),
                            "longitude": float(data["longitude"]),
                            "city": data.get("city", ""),
                            "region": data.get("region", ""),
                            "country": data.get("country_name", ""),
                            "source": "ipapi",
                        }
                    ),
                    200,
                )
    except Exception as e:
        logger.warning("ipapi.co location detection failed: %s", e)

    # 2. Secondary: ipwho.is
    try:
        req = urllib.request.Request("https://ipwho.is/", headers={"User-Agent": "InfoOS-POS/1.0"})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success", False) and "latitude" in data:
                return (
                    jsonify(
                        {
                            "success": True,
                            "latitude": float(data["latitude"]),
                            "longitude": float(data["longitude"]),
                            "city": data.get("city", ""),
                            "region": data.get("region", ""),
                            "country": data.get("country", ""),
                            "source": "ipwhois",
                        }
                    ),
                    200,
                )
    except Exception as e:
        logger.warning("ipwho.is location detection failed: %s", e)

    # 3. Fallback: existing profile location if already configured
    curr = ProfileService.get_profile()
    if curr.get("latitude") and curr.get("longitude"):
        return (
            jsonify(
                {
                    "success": True,
                    "latitude": float(curr["latitude"]),
                    "longitude": float(curr["longitude"]),
                    "city": curr.get("city", ""),
                    "region": curr.get("state", ""),
                    "country": curr.get("country", ""),
                    "source": "saved_profile",
                }
            ),
            200,
        )

    return (
        jsonify(
            {
                "success": False,
                "error": "Could not detect location from network. Please enter an address or click the map.",
            }
        ),
        404,
    )


@profile_bp.route("/api/profile/geocode", methods=["GET"])
@safe_route
def geocode_address():
    """Geocode an address, city, or postal code on the server side."""
    query = request.args.get("q", "").strip()
    if not query:
        raise ValidationError("Query parameter 'q' is required", code="MISSING_QUERY")

    # 1. Primary: Open-Meteo Geocoding
    try:
        url = f"https://geocoding-api.open-meteo.com/v1/search?name={urllib.parse.quote(query)}&count=1&language=en&format=json"
        req = urllib.request.Request(url, headers={"User-Agent": "InfoOS-POS/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            results = data.get("results", [])
            if results:
                return (
                    jsonify(
                        {
                            "success": True,
                            "latitude": float(results[0]["latitude"]),
                            "longitude": float(results[0]["longitude"]),
                            "display_name": results[0].get("name", query),
                        }
                    ),
                    200,
                )
    except Exception as e:
        logger.warning("Open-Meteo server geocode failed: %s", e)

    # 2. Secondary: Nominatim OSM
    try:
        url = f"https://nominatim.openstreetmap.org/search?q={urllib.parse.quote(query)}&format=json&limit=1"
        req = urllib.request.Request(
            url, headers={"User-Agent": "InfoOS-POS/1.0 (infoos@local.dev)"}
        )
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data and len(data) > 0:
                return (
                    jsonify(
                        {
                            "success": True,
                            "latitude": float(data[0]["lat"]),
                            "longitude": float(data[0]["lon"]),
                            "display_name": data[0].get("display_name", query),
                        }
                    ),
                    200,
                )
    except Exception as e:
        logger.warning("Nominatim server geocode failed: %s", e)

    return (
        jsonify(
            {
                "success": False,
                "error": f"Could not find coordinates for '{query}'. Please click directly on the map.",
            }
        ),
        404,
    )
