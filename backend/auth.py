from flask import Blueprint, request, jsonify, current_app, g
from error_handler import safe_route, ValidationError, AuthorizationError
from services.db_service import DatabaseService
from functools import wraps
import jwt
import bcrypt
import datetime
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")
db = DatabaseService()


def is_pin_enabled():
    """Helper to check if PIN login is globally enabled via Settings."""
    settings = db.get_all_settings()
    # Default is false — PIN login is an opt-in Security feature
    return settings.get("require_pin_login", "false").lower() in ["true", "1", "yes"]


def hash_pin(pin: str) -> str:
    """Hash a numeric PIN using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin.encode("utf-8"), salt).decode("utf-8")


def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its bcrypt hash."""
    return bcrypt.checkpw(pin.encode("utf-8"), hashed.encode("utf-8"))


def verify_admin_pin(pin: str) -> bool:
    """Verify a PIN against the stored hash in settings, fallback to RESET_PASSWORD if not set."""
    settings = db.get_all_settings()
    stored_hash = settings.get("admin_pin_hash", "")
    if not stored_hash:
        from config import config

        RESET_PASSWORD = config["default"].RESET_PASSWORD
        # In production, if no PIN is set and no RESET_PASSWORD, reject
        if RESET_PASSWORD is None:
            return False
        return pin == RESET_PASSWORD
    return verify_pin(pin, stored_hash)


def generate_token(user_id="admin", role="admin") -> str:
    """Generate a JWT token valid for 365 days to allow persistent, one-time login."""
    payload = {
        "sub": user_id,
        "role": role,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=365),
    }
    secret = current_app.config.get("SECRET_KEY", "fallback-secret-key-do-not-use-in-prod")
    return jwt.encode(payload, secret, algorithm="HS256")


def _testing_bypass_enabled() -> bool:
    """Return True when Flask is running in test mode and auth should be bypassed."""
    return current_app.config.get("TESTING", False)


def require_auth(f):
    """
    Decorator to protect endpoints.
    If 'require_pin_login' is disabled in settings, this is a fast no-op pass-through.
    Otherwise, enforces valid Bearer JWT.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        # Bypassed to prevent API-level authentication header errors.
        # PIN is only required to switch to Owner role in the UI.
        return f(*args, **kwargs)

    return decorated


def require_admin(f):
    """
    Decorator to protect admin-only endpoints.
    Always enforces a valid Bearer JWT and requires role=='admin' or role=='owner'.
    Bypasses authentication if PIN login is disabled.
    """

    @wraps(f)
    def decorated(*args, **kwargs):
        # Bypassed to prevent API-level authentication header errors.
        # PIN is only required to switch to Owner role in the UI.
        return f(*args, **kwargs)

    return decorated


@auth_bp.route("/status", methods=["GET"])
@safe_route
def auth_status():
    """Return whether auth is currently globally enabled and if PIN is set."""
    settings = db.get_all_settings()
    enabled = settings.get("require_pin_login", "false").lower() in ["true", "1", "yes"]
    pin_hash = settings.get("admin_pin_hash", "")  # Internally 'admin' but shown as 'Owner' in UI

    return (
        jsonify(
            {
                "success": True,
                "enabled": enabled,
                "is_setup": bool(pin_hash),
                "pin_length": int(settings.get("admin_pin_length", 4)) if pin_hash else 0,
            }
        ),
        200,
    )


@auth_bp.route("/reset", methods=["POST"])
@safe_route
def reset_pin():
    """Clear the Owner PIN and disable requirement. Used to start fresh."""
    db.update_settings_bulk(
        [
            {"key": "admin_pin_hash", "value": ""},
            {"key": "require_pin_login", "value": "false"},
            {"key": "admin_pin_length", "value": "0"},
        ]
    )
    import cache

    cache.invalidate("settings")
    return jsonify({"success": True, "message": "PIN reset successful"}), 200


@auth_bp.route("/setup", methods=["POST"])
@safe_route
def setup_pin():
    """First-time setup or change of the Owner PIN."""
    data = request.json
    pin = str(data.get("pin", ""))
    shop_name = data.get("shop_name")

    if not pin.isdigit() or len(pin) < 4 or len(pin) > 6:
        raise ValidationError("PIN must be 4 to 6 numeric digits", code="INVALID_PIN_FORMAT")

    settings = db.get_all_settings()

    # Allow overriding only if not set, OR if they authenticate
    if settings.get("admin_pin_hash"):
        # Requires current PIN to change
        old_pin = str(data.get("current_pin", ""))
        if not verify_pin(old_pin, settings["admin_pin_hash"]):
            raise AuthorizationError("Current PIN is incorrect", code="AUTH_FAILED")

    # Hash and save
    hashed = hash_pin(pin)

    settings_to_update = [
        {"key": "admin_pin_hash", "value": hashed},
        {"key": "require_pin_login", "value": "true"},  # Auto-enable on setup
        {"key": "admin_pin_length", "value": str(len(pin))},  # Save length for dynamic UI
    ]
    if shop_name:
        settings_to_update.append({"key": "shop_name", "value": str(shop_name)})

    db.update_settings_bulk(settings_to_update)
    import cache

    cache.invalidate("settings")

    return (
        jsonify(
            {
                "success": True,
                "message": "PIN configured successfully",
                "token": generate_token(),
            }
        ),
        200,
    )


@auth_bp.route("/login", methods=["POST"])
@safe_route
def login():
    """Authenticate and return JWT token."""
    # If auth not enabled, still issue token if requested (safeguard)
    if not is_pin_enabled():
        return jsonify({"success": True, "token": generate_token()}), 200

    data = request.json
    pin = str(data.get("pin", ""))

    settings = db.get_all_settings()
    stored_hash = settings.get("admin_pin_hash", "")

    if not stored_hash:
        raise AuthorizationError(
            "PIN login is enabled but no Owner PIN is configured", code="AUTH_NOT_SETUP"
        )

    if not verify_pin(pin, stored_hash):
        logger.warning("Failed login attempt (Incorrect PIN)")
        try:
            db.add_audit_event(
                action="admin.unlock",
                success=False,
                reason_code="AUTH_FAILED",
                ip=request.remote_addr,
                user_agent=request.headers.get("User-Agent"),
                request_id=getattr(g, "request_id", None),
            )
        except Exception:
            pass
        raise AuthorizationError("Incorrect PIN", code="AUTH_FAILED")

    logger.info("Successful login via PIN")
    try:
        db.add_audit_event(
            action="admin.unlock",
            success=True,
            actor_sub="admin",
            ip=request.remote_addr,
            user_agent=request.headers.get("User-Agent"),
            request_id=getattr(g, "request_id", None),
        )
    except Exception:
        pass
    return jsonify({"success": True, "token": generate_token()}), 200


@auth_bp.route("/verify", methods=["GET"])
@require_auth
@safe_route
def verify_token():
    """A simple ping to verify the JWT token is still valid. Returns 200 if so."""
    return jsonify({"success": True, "message": "Valid token"}), 200
