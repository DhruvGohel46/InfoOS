"""
=============================================================================
 CENTRALIZED ERROR HANDLER — error_handler.py
=============================================================================

 Production-grade error handling for the Flask application.

 Provides:
   - Custom exception classes with HTTP status codes and error codes
   - A @safe_route decorator that wraps route handlers in try/except
   - Consistent JSON error response shape across all endpoints:
     { "success": false, "error": "human readable message", "code": "ERROR_CODE" }
   - Central registration of Flask error handlers (400, 404, 405, 409, 500)

 Usage in route files:
   from error_handler import safe_route, ValidationError, NotFoundError

   @bp.route('/example', methods=['POST'])
   @safe_route
   def my_route():
       raise ValidationError("Name is required", code="MISSING_NAME")
=============================================================================
"""

import functools
import logging
import traceback
from flask import jsonify

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Custom Exception Classes
# ---------------------------------------------------------------------------

class AppError(Exception):
    """Base application error that carries an HTTP status and machine-readable code."""

    def __init__(self, message: str, status_code: int = 500, code: str = "INTERNAL_ERROR"):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.code = code


class ValidationError(AppError):
    """Raised when request data fails validation (400)."""

    def __init__(self, message: str = "Invalid request data", code: str = "VALIDATION_ERROR"):
        super().__init__(message, status_code=400, code=code)


class NotFoundError(AppError):
    """Raised when a requested resource does not exist (404)."""

    def __init__(self, message: str = "Resource not found", code: str = "NOT_FOUND"):
        super().__init__(message, status_code=404, code=code)


class ConflictError(AppError):
    """Raised when the operation conflicts with current state (409)."""

    def __init__(self, message: str = "Resource conflict", code: str = "CONFLICT"):
        super().__init__(message, status_code=409, code=code)


class AuthorizationError(AppError):
    """Raised when authentication/authorization fails (401)."""

    def __init__(self, message: str = "Unauthorized", code: str = "UNAUTHORIZED"):
        super().__init__(message, status_code=401, code=code)


# ---------------------------------------------------------------------------
# Canonical error response builder
# ---------------------------------------------------------------------------

def error_response(message: str, status_code: int, code: str = "ERROR"):
    """Build a consistent JSON error response.

    Returns:
        tuple: (Response, status_code)
    """
    return jsonify({
        "success": False,
        "error": message,
        "code": code,
    }), status_code


# ---------------------------------------------------------------------------
# @safe_route decorator
# ---------------------------------------------------------------------------

def safe_route(fn):
    """Decorator that wraps a Flask route handler in structured error handling.

    Catches:
      - AppError subclasses → returns their status_code and code
      - ValueError → 400 VALIDATION_ERROR
      - Generic Exception → 500 INTERNAL_ERROR  (logs full traceback)

    This eliminates duplicated try/except boilerplate across route files.
    """

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except AppError as e:
            # Known application errors — log at WARNING level
            logger.warning(f"[{e.code}] {e.message}")
            return error_response(e.message, e.status_code, e.code)
        except ValueError as e:
            logger.warning(f"[VALIDATION_ERROR] {str(e)}")
            return error_response(f"Invalid data format: {str(e)}", 400, "VALIDATION_ERROR")
        except Exception as e:
            # Unexpected errors — log full traceback at ERROR level
            logger.error(f"Unhandled exception in {fn.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            return error_response(
                f"Internal server error: {str(e)}",
                500,
                "INTERNAL_ERROR"
            )

    return wrapper


# ---------------------------------------------------------------------------
# Flask app-level error handler registration
# ---------------------------------------------------------------------------

def register_error_handlers(app):
    """Register global HTTP error handlers on the Flask app.

    Replaces the inline @app.errorhandler blocks in app.py.
    """

    @app.errorhandler(400)
    def bad_request(error):
        return error_response(
            str(error.description) if hasattr(error, 'description') else "Bad request",
            400,
            "BAD_REQUEST"
        )

    @app.errorhandler(404)
    def not_found(error):
        return error_response(
            "Endpoint not found",
            404,
            "ENDPOINT_NOT_FOUND"
        )

    @app.errorhandler(405)
    def method_not_allowed(error):
        return error_response(
            "Method not allowed",
            405,
            "METHOD_NOT_ALLOWED"
        )

    @app.errorhandler(409)
    def conflict(error):
        return error_response(
            str(error.description) if hasattr(error, 'description') else "Conflict",
            409,
            "CONFLICT"
        )

    @app.errorhandler(500)
    def internal_error(error):
        return error_response(
            "Internal server error",
            500,
            "INTERNAL_ERROR"
        )

    logger.info("Centralized error handlers registered")
