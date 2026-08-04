from flask import Blueprint, jsonify, request
from services.db_service import DatabaseService
from error_handler import safe_route, ValidationError
import cache
import logging

logger = logging.getLogger(__name__)

settings_bp = Blueprint("settings", __name__)
db_service = DatabaseService()


@settings_bp.route("/api/settings", methods=["GET"])
@safe_route
def get_settings():
    """Get all settings (cached)."""
    settings = cache.get("settings", "all")
    if settings is None:
        settings = db_service.get_all_settings()
        cache.set("settings", "all", settings)
    return jsonify(settings)


@settings_bp.route("/api/settings", methods=["PUT"])
@safe_route
def update_settings():
    """Update settings (bulk or single)."""
    data = request.json
    if not data:
        raise ValidationError("No data provided", code="MISSING_DATA")

    # Migration check when updating salary_date_mode
    current_settings = db_service.get_all_settings()
    old_mode = current_settings.get("salary_date_mode", "GLOBAL")

    settings_dict = {}
    if isinstance(data, list):
        settings_dict = {
            item.get("key"): item.get("value") for item in data if isinstance(item, dict)
        }
    elif isinstance(data, dict):
        settings_dict = data

    new_mode = settings_dict.get("salary_date_mode")
    if new_mode and old_mode != new_mode:
        if old_mode == "GLOBAL" and new_mode == "WORKER":
            # Switching from Global -> Worker mode:
            # Automatically copy the current global salary day into every existing worker's salary_day field
            global_day_str = (
                settings_dict.get("global_salary_day")
                or settings_dict.get("salary_day")
                or current_settings.get("global_salary_day")
                or current_settings.get("salary_day", "10")
            )
            try:
                global_day_int = int(global_day_str)
            except (ValueError, TypeError):
                global_day_int = 10

            from models import Worker, db

            workers = Worker.query.all()
            for w in workers:
                if not w.salary_day:
                    w.salary_day = global_day_int
            db.session.commit()

    # Check if it's a list or a dict
    if isinstance(data, list):
        success = db_service.update_settings_bulk(data)
    elif isinstance(data, dict):
        settings_list = [{"key": k, "value": str(v)} for k, v in data.items()]
        success = db_service.update_settings_bulk(settings_list)
    else:
        raise ValidationError("Invalid data format", code="INVALID_FORMAT")

    if not success:
        raise Exception("Failed to update settings")

    cache.invalidate("settings")
    return jsonify({"success": True, "message": "Settings updated successfully"})


@settings_bp.route("/api/settings/printer-info", methods=["GET"])
@safe_route
def get_printer_info():
    """Get list of available printers and status of currently active printer."""
    from services.printer_service import PrinterService

    ps = PrinterService()

    # Active printer name from DB settings
    settings = db_service.get_all_settings()
    active_printer = settings.get("active_printer")
    if active_printer:
        ps.printer_name = active_printer
    else:
        ps._ensure_initialized()
        active_printer = ps.printer_name

    available = ps.get_available_printers()
    status = ps.get_printer_status()

    return jsonify(
        {
            "success": True,
            "active_printer": active_printer,
            "available_printers": available,
            "status": status.get("status", "Unknown"),
            "error": status.get("error"),
        }
    )


@settings_bp.route("/api/settings/upload-sound", methods=["POST"])
@safe_route
def upload_sound():
    """Upload a custom reminder sound."""
    import os
    from flask import current_app, send_from_directory
    from werkzeug.utils import secure_filename

    if "file" not in request.files:
        raise ValidationError("No file part", code="MISSING_FILE")

    file = request.files["file"]
    if file.filename == "":
        raise ValidationError("No selected file", code="NO_FILE")

    if file:
        # Validate extension
        allowed_extensions = {"mp3", "wav", "ogg"}
        ext = file.filename.rsplit(".", 1)[1].lower() if "." in file.filename else ""
        if ext not in allowed_extensions:
            raise ValidationError(
                f"Invalid file type. Allowed: {', '.join(allowed_extensions)}", code="INVALID_TYPE"
            )

        # Save as custom_reminder.[ext] to simplify settings
        filename = f"custom_reminder.{ext}"
        sounds_dir = os.path.join(current_app.config["DATA_DIR"], "Sound")
        os.makedirs(sounds_dir, exist_ok=True)

        file_path = os.path.join(sounds_dir, filename)
        file.save(file_path)

        return jsonify(
            {"success": True, "message": "Sound uploaded successfully", "filename": filename}
        )

    raise ValidationError("File upload failed", code="UPLOAD_FAILED")
