from flask import Blueprint, request, jsonify, current_app, _request_ctx_stack
from error_handler import safe_route, ValidationError, AuthorizationError
from services.db_service import DatabaseService
from functools import wraps
import jwt
import bcrypt
import datetime
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')
db = DatabaseService()

def is_pin_enabled():
    """Helper to check if PIN login is globally enabled via Settings."""
    settings = db.get_all_settings()
    # Default is false — PIN login is an opt-in Security feature
    return settings.get('require_pin_login', 'false').lower() in ['true', '1', 'yes']

def hash_pin(pin: str) -> str:
    """Hash a numeric PIN using bcrypt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(pin.encode('utf-8'), salt).decode('utf-8')

def verify_pin(pin: str, hashed: str) -> bool:
    """Verify a PIN against its bcrypt hash."""
    return bcrypt.checkpw(pin.encode('utf-8'), hashed.encode('utf-8'))

def generate_token(user_id="admin") -> str:
    """Generate a JWT token valid for 8 hours (typical shift)."""
    payload = {
        'sub': user_id,
        'iat': datetime.datetime.utcnow(),
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=8)
    }
    secret = current_app.config.get('SECRET_KEY', 'fallback-secret-key-do-not-use-in-prod')
    return jwt.encode(payload, secret, algorithm='HS256')

def require_auth(f):
    """
    Decorator to protect endpoints.
    If 'require_pin_login' is disabled in settings, this is a fast no-op pass-through.
    Otherwise, enforces valid Bearer JWT.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        if not is_pin_enabled():
            return f(*args, **kwargs)

        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            raise AuthorizationError("Missing or invalid Authorization header", code="AUTH_MISSING")

        token = auth_header.split(" ")[1]
        secret = current_app.config.get('SECRET_KEY', 'fallback-secret-key-do-not-use-in-prod')
        
        try:
            payload = jwt.decode(token, secret, algorithms=["HS256"])
            # Inject user logic context if needed here
        except jwt.ExpiredSignatureError:
            raise AuthorizationError("Token has expired", code="AUTH_EXPIRED")
        except jwt.InvalidTokenError:
            raise AuthorizationError("Invalid token", code="AUTH_INVALID")

        return f(*args, **kwargs)
    return decorated


@auth_bp.route('/status', methods=['GET'])
@safe_route
def auth_status():
    """Return whether auth is currently globally enabled and if PIN is set."""
    settings = db.get_all_settings()
    enabled = settings.get('require_pin_login', 'false').lower() in ['true', '1', 'yes']
    pin_hash = settings.get('admin_pin_hash', '')
    
    return jsonify({
        'success': True,
        'enabled': enabled,
        'is_setup': bool(pin_hash)
    }), 200


@auth_bp.route('/setup', methods=['POST'])
@safe_route
def setup_pin():
    """First-time setup of the admin PIN."""
    data = request.json
    pin = str(data.get('pin', ''))
    
    if not pin.isdigit() or len(pin) < 4 or len(pin) > 6:
        raise ValidationError("PIN must be 4 to 6 numeric digits", code="INVALID_PIN_FORMAT")

    settings = db.get_all_settings()
    
    # Allow overriding only if not set, OR if they authenticate
    if settings.get('admin_pin_hash'):
        # Requires current PIN to change
        old_pin = str(data.get('current_pin', ''))
        if not verify_pin(old_pin, settings['admin_pin_hash']):
            raise AuthorizationError("Current PIN is incorrect", code="AUTH_FAILED")
            
    # Hash and save
    hashed = hash_pin(pin)
    
    db.update_settings_bulk([
        {'key': 'admin_pin_hash', 'value': hashed},
        {'key': 'require_pin_login', 'value': 'true'} # Auto-enable on setup
    ])

    return jsonify({
        'success': True,
        'message': 'PIN configured successfully',
        'token': generate_token()
    }), 200


@auth_bp.route('/login', methods=['POST'])
@safe_route
def login():
    """Authenticate and return JWT token."""
    # If auth not enabled, still issue token if requested (safeguard)
    if not is_pin_enabled():
        return jsonify({
            'success': True,
            'token': generate_token()
        }), 200

    data = request.json
    pin = str(data.get('pin', ''))
    
    settings = db.get_all_settings()
    stored_hash = settings.get('admin_pin_hash', '')
    
    if not stored_hash:
        raise AuthorizationError("PIN login is enabled but no PIN is configured", code="AUTH_NOT_SETUP")

    if not verify_pin(pin, stored_hash):
        logger.warning("Failed login attempt (Incorrect PIN)")
        raise AuthorizationError("Incorrect PIN", code="AUTH_FAILED")

    logger.info("Successful login via PIN")
    return jsonify({
        'success': True,
        'token': generate_token()
    }), 200


@auth_bp.route('/verify', methods=['GET'])
@require_auth
@safe_route
def verify_token():
    """A simple ping to verify the JWT token is still valid. Returns 200 if so."""
    return jsonify({
        'success': True,
        'message': 'Valid token'
    }), 200
