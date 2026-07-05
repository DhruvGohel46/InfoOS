from flask import Blueprint, request, jsonify
from auth import require_admin
from models import db, WorkerType
from error_handler import safe_route, ValidationError, NotFoundError
from validators import MarshmallowValidationError
import logging

logger = logging.getLogger(__name__)

worker_types_bp = Blueprint("worker_types", __name__, url_prefix="/api/worker-types")


@worker_types_bp.route("", methods=["GET"])
@safe_route
def get_worker_types():
    """Get all worker types."""
    worker_types = WorkerType.query.order_by(WorkerType.name).all()
    return jsonify({"success": True, "worker_types": [wt.to_dict() for wt in worker_types]}), 200


@worker_types_bp.route("/<int:type_id>", methods=["GET"])
@safe_route
def get_worker_type(type_id):
    """Get a specific worker type."""
    worker_type = WorkerType.query.get(type_id)
    if not worker_type:
        raise NotFoundError("Worker type not found", code="WORKER_TYPE_NOT_FOUND")
    return jsonify({"success": True, "worker_type": worker_type.to_dict()}), 200


@worker_types_bp.route("", methods=["POST"])
@require_admin
@safe_route
def create_worker_type():
    """Create a new worker type."""
    data = request.json

    if not data or not data.get("name"):
        raise ValidationError("Worker type name is required", code="WORKER_TYPE_NAME_REQUIRED")

    # Check if name already exists
    existing = WorkerType.query.filter_by(name=data["name"]).first()
    if existing:
        raise ValidationError(
            "Worker type with this name already exists", code="WORKER_TYPE_EXISTS"
        )

    worker_type = WorkerType(
        name=data["name"],
        description=data.get("description", ""),
        is_active=data.get("is_active", True),
    )

    db.session.add(worker_type)
    db.session.commit()

    logger.info(f"Worker type created: {worker_type.name}")
    return (
        jsonify(
            {
                "success": True,
                "message": "Worker type created successfully",
                "worker_type": worker_type.to_dict(),
            }
        ),
        201,
    )


@worker_types_bp.route("/<int:type_id>", methods=["PUT"])
@require_admin
@safe_route
def update_worker_type(type_id):
    """Update a worker type."""
    data = request.json
    worker_type = WorkerType.query.get(type_id)

    if not worker_type:
        raise NotFoundError("Worker type not found", code="WORKER_TYPE_NOT_FOUND")

    # Check if name is being changed and if it conflicts
    if "name" in data and data["name"] != worker_type.name:
        existing = WorkerType.query.filter_by(name=data["name"]).first()
        if existing:
            raise ValidationError(
                "Worker type with this name already exists", code="WORKER_TYPE_EXISTS"
            )
        worker_type.name = data["name"]

    if "description" in data:
        worker_type.description = data["description"]
    if "is_active" in data:
        worker_type.is_active = data["is_active"]

    db.session.commit()

    logger.info(f"Worker type updated: {worker_type.name}")
    return (
        jsonify(
            {
                "success": True,
                "message": "Worker type updated successfully",
                "worker_type": worker_type.to_dict(),
            }
        ),
        200,
    )


@worker_types_bp.route("/<int:type_id>", methods=["DELETE"])
@require_admin
@safe_route
def delete_worker_type(type_id):
    """Delete a worker type."""
    worker_type = WorkerType.query.get(type_id)

    if not worker_type:
        raise NotFoundError("Worker type not found", code="WORKER_TYPE_NOT_FOUND")

    # Check if any workers are using this type
    from models import Worker

    workers_count = Worker.query.filter_by(worker_type_id=type_id).count()
    if workers_count > 0:
        raise ValidationError(
            f"Cannot delete worker type. {workers_count} worker(s) are using this type.",
            code="WORKER_TYPE_IN_USE",
        )

    db.session.delete(worker_type)
    db.session.commit()

    logger.info(f"Worker type deleted: {worker_type.name}")
    return jsonify({"success": True, "message": "Worker type deleted successfully"}), 200
