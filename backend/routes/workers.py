from flask import Blueprint, request, jsonify
from auth import require_auth
from models import db, Worker, Advance, SalaryPayment, Attendance
from sqlalchemy import func, extract
from services.worker_service import WorkerService
from error_handler import safe_route, ValidationError, NotFoundError
from validators import (
    WorkerCreateSchema,
    WorkerUpdateSchema,
    AdvanceCreateSchema,
    AttendanceSchema,
    SalaryGenerateSchema,
    MarshmallowValidationError,
)
from datetime import datetime, date
import cache
import logging

logger = logging.getLogger(__name__)

workers_bp = Blueprint("workers", __name__)

# Reusable schema instances
_worker_create_schema = WorkerCreateSchema()
_worker_update_schema = WorkerUpdateSchema()
_advance_schema = AdvanceCreateSchema()
_attendance_schema = AttendanceSchema()
_salary_schema = SalaryGenerateSchema()


@workers_bp.route("/api/workers", methods=["GET"])
@safe_route
def get_workers():
    """Get all workers with today's attendance and current cycle advances."""
    workers = WorkerService.get_all_workers()
    result = []

    # Get today's attendance map
    attendance_map = WorkerService.get_today_attendance()

    # Calculate Salary Cycle Period
    start_date, inclusive_end_date = WorkerService._get_finance_cycle_dates()

    advances_map = WorkerService.get_advances_sum_map(start_date, inclusive_end_date)

    for w in workers:
        result.append(
            {
                "worker_id": w.worker_id,
                "name": w.name,
                "role": w.role,
                "salary": w.salary,
                "phone": w.phone,
                "photo": w.photo,
                "status": w.status,
                "today_attendance": attendance_map.get(w.worker_id, "Not Marked"),
                "current_advance": advances_map.get(w.worker_id, 0.0),
                "cycle_start": start_date.isoformat(),
                "cycle_end": inclusive_end_date.isoformat(),
            }
        )
    return jsonify(result)


@workers_bp.route("/api/workers", methods=["POST"])
@require_auth
@safe_route
def create_worker():
    """Create a new worker."""
    data = request.json

    try:
        validated = _worker_create_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid worker data: {e.messages}", code="WORKER_VALIDATION_FAILED"
        )

    worker = WorkerService.create_worker(validated)
    cache.invalidate("workers")
    return jsonify({"success": True, "worker_id": worker.worker_id}), 201


@workers_bp.route("/api/workers/<worker_id>", methods=["GET"])
@safe_route
def get_worker(worker_id):
    """Get a specific worker with current cycle stats."""
    worker = WorkerService.get_worker(worker_id)
    if not worker:
        raise NotFoundError("Worker not found", code="WORKER_NOT_FOUND")

    # Calculate Current Cycle Stats for this specific worker
    start_date, end_date = WorkerService._get_finance_cycle_dates()
    current_advance = (
        db.session.query(func.sum(Advance.amount))
        .filter(
            Advance.worker_id == worker_id,
            Advance.date >= start_date,
            Advance.date <= end_date,
        )
        .scalar()
        or 0.0
    )

    return jsonify(
        {
            "worker_id": worker.worker_id,
            "name": worker.name,
            "phone": worker.phone,
            "email": worker.email,
            "role": worker.role,
            "salary": worker.salary,
            "join_date": worker.join_date.isoformat() if worker.join_date else None,
            "status": worker.status,
            "photo": worker.photo,
            "current_cycle": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "advance": float(current_advance),
                "net_payable": float(worker.salary - current_advance),
            },
        }
    )


@workers_bp.route("/api/workers/<worker_id>", methods=["PUT"])
@require_auth
@safe_route
def update_worker(worker_id):
    """Update a worker's details."""
    data = request.json

    try:
        validated = _worker_update_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid update data: {e.messages}", code="WORKER_UPDATE_VALIDATION_FAILED"
        )

    worker = WorkerService.update_worker(worker_id, validated)
    if not worker:
        raise NotFoundError("Worker not found", code="WORKER_NOT_FOUND")

    cache.invalidate("workers")
    return jsonify({"success": True})


@workers_bp.route("/api/workers/<worker_id>", methods=["DELETE"])
@require_auth
@safe_route
def delete_worker(worker_id):
    """Soft-delete a worker."""
    success = WorkerService.soft_delete_worker(worker_id)
    if not success:
        raise NotFoundError("Worker not found", code="WORKER_NOT_FOUND")
    return jsonify({"success": True})


# ADVANCES
@workers_bp.route("/api/workers/<worker_id>/advance", methods=["POST"])
@require_auth
@safe_route
def add_advance(worker_id):
    """Add an advance payment for a worker."""
    data = request.json

    try:
        validated = _advance_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid advance data: {e.messages}", code="ADVANCE_VALIDATION_FAILED"
        )

    advance = WorkerService.add_advance(
        worker_id, validated["amount"], validated.get("reason", "")
    )
    return jsonify({"success": True, "advance_id": advance.advance_id})


@workers_bp.route("/api/workers/<worker_id>/advances", methods=["GET"])
@safe_route
def get_advances(worker_id):
    """Get all advances for a worker."""
    advances = WorkerService.get_advances(worker_id)
    return jsonify(
        [
            {
                "advance_id": a.advance_id,
                "amount": a.amount,
                "reason": a.reason,
                "date": a.date.isoformat(),
            }
            for a in advances
        ]
    )


@workers_bp.route("/api/workers/<worker_id>/expenses", methods=["GET"])
@safe_route
def get_worker_expenses(worker_id):
    """Get all expenses linked to a specific worker."""
    from models import Expense

    expenses = (
        Expense.query.filter_by(worker_id=worker_id).order_by(Expense.date.desc()).all()
    )
    total_paid = sum(e.amount for e in expenses)

    return jsonify(
        {
            "success": True,
            "expenses": [e.to_dict() for e in expenses],
            "total_paid": total_paid,
        }
    )


# SALARY
@workers_bp.route("/api/workers/<worker_id>/salary-history", methods=["GET"])
@safe_route
def get_salary_history(worker_id):
    """Get salary payment history for a worker."""
    history = WorkerService.get_salary_history(worker_id)
    return jsonify(
        [
            {
                "payment_id": p.payment_id,
                "month": p.month,
                "year": p.year,
                "base_salary": p.base_salary,
                "advance_deduction": p.advance_deduction,
                "final_salary": p.final_salary,
                "paid": p.paid,
                "paid_date": p.paid_date.isoformat() if p.paid_date else None,
            }
            for p in history
        ]
    )


@workers_bp.route("/api/workers/<worker_id>/generate-salary", methods=["POST"])
@require_auth
@safe_route
def generate_salary(worker_id):
    """Generate salary record for a worker."""
    data = request.json

    try:
        validated = _salary_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid salary data: {e.messages}", code="SALARY_VALIDATION_FAILED"
        )

    month = validated.get("month", date.today().month)
    year = validated.get("year", date.today().year)

    payment = WorkerService.generate_salary(worker_id, month, year)
    if not payment:
        raise NotFoundError("Worker not found", code="WORKER_NOT_FOUND")

    return jsonify(
        {
            "success": True,
            "payment": {
                "payment_id": payment.payment_id,
                "base_salary": payment.base_salary,
                "advance_deduction": payment.advance_deduction,
                "final_salary": payment.final_salary,
            },
        }
    )


@workers_bp.route("/api/salary/<payment_id>/pay", methods=["POST"])
@require_auth
@safe_route
def mark_salary_paid(payment_id):
    """Mark a salary payment as paid."""
    success = WorkerService.mark_salary_paid(payment_id)
    return jsonify({"success": success})


@workers_bp.route("/api/workers/salary/status", methods=["GET"])
@safe_route
def check_salary_status():
    """Check salary status for a given month/year."""
    month = request.args.get("month", type=int, default=date.today().month)
    year = request.args.get("year", type=int, default=date.today().year)

    status = WorkerService.check_salary_status(month, year)
    return jsonify(status)


# STATS
@workers_bp.route("/api/workers/stats", methods=["GET"])
@safe_route
def get_worker_stats():
    """Get aggregate worker statistics."""
    workers = WorkerService.get_all_workers()
    total_workers = len(workers)
    active_workers = len([w for w in workers if w.status == "active"])

    total_salary = sum(w.salary for w in workers if w.status == "active" and w.salary)

    active_worker_ids = {w.worker_id for w in workers}

    start_date, inclusive_end_date = WorkerService._get_finance_cycle_dates()

    total_advances = (
        db.session.query(func.sum(Advance.amount))
        .join(Worker)
        .filter(
            Worker.status == "active",
            Advance.date >= start_date,
            Advance.date <= inclusive_end_date,
        )
        .scalar()
        or 0.0
    )

    paid_salaries = (
        db.session.query(func.sum(SalaryPayment.final_salary))
        .filter(
            SalaryPayment.month == inclusive_end_date.month,
            SalaryPayment.year == inclusive_end_date.year,
            SalaryPayment.paid == True,
        )
        .scalar()
        or 0.0
    )

    net_payable = total_salary - float(total_advances) - float(paid_salaries)

    today_attendance = WorkerService.get_today_attendance()
    present_today = len(
        [
            status
            for w_id, status in today_attendance.items()
            if status == "Present" and w_id in active_worker_ids
        ]
    )

    return jsonify(
        {
            "totalWorkers": total_workers,
            "activeWorkers": active_workers,
            "presentToday": present_today,
            "totalSalary": float(total_salary),
            "netPayable": float(net_payable),
            "cycle_start": start_date.isoformat(),
            "cycle_end": inclusive_end_date.isoformat(),
        }
    )


# ATTENDANCE
@workers_bp.route("/api/workers/<worker_id>/attendance", methods=["GET"])
@safe_route
def get_worker_attendance(worker_id):
    """Get attendance history for a worker."""
    history = WorkerService.get_attendance_history(worker_id)
    return jsonify(
        [
            {
                "attendance_id": a.attendance_id,
                "date": a.date.isoformat(),
                "status": a.status,
                "check_in": a.check_in.strftime("%H:%M") if a.check_in else None,
                "check_out": a.check_out.strftime("%H:%M") if a.check_out else None,
            }
            for a in history
        ]
    )


@workers_bp.route("/api/workers/<worker_id>/attendance", methods=["POST"])
@require_auth
@safe_route
def mark_attendance(worker_id):
    """Mark attendance for a worker."""
    data = request.json

    try:
        validated = _attendance_schema.load(data or {})
    except MarshmallowValidationError as e:
        raise ValidationError(
            f"Invalid attendance data: {e.messages}",
            code="ATTENDANCE_VALIDATION_FAILED",
        )

    status = validated.get("status", "Present")
    check_in = (
        datetime.strptime(validated["check_in"], "%H:%M").time()
        if validated.get("check_in")
        else None
    )
    check_out = (
        datetime.strptime(validated["check_out"], "%H:%M").time()
        if validated.get("check_out")
        else None
    )

    entry = WorkerService.record_attendance(worker_id, status, check_in, check_out)
    return jsonify({"success": True, "status": entry.status})


@workers_bp.route("/api/workers/<worker_id>/attendance", methods=["PUT"])
@require_auth
@safe_route
def update_attendance(worker_id):
    """Update attendance record (e.g., for check-out)."""
    data = request.json
    date_str = data.get("date", date.today().isoformat())
    check_out = (
        datetime.strptime(data["check_out"], "%H:%M").time()
        if data.get("check_out")
        else None
    )

    attendance = Attendance.query.filter_by(
        worker_id=worker_id, date=datetime.strptime(date_str, "%Y-%m-%d").date()
    ).first()

    if not attendance:
        raise NotFoundError("Attendance record not found", code="ATTENDANCE_NOT_FOUND")

    attendance.check_out = check_out
    attendance.updated_at = datetime.utcnow()

    db.session.commit()

    return jsonify(
        {
            "success": True,
            "check_out": check_out.strftime("%H:%M") if check_out else None,
        }
    )


@workers_bp.route("/api/workers/attendance/bulk", methods=["POST"])
@require_auth
@safe_route
def bulk_attendance():
    """Mark all active workers as Present."""
    workers = WorkerService.get_all_workers()
    ids = [w.worker_id for w in workers]
    count = WorkerService.bulk_mark_present(ids)
    return jsonify({"success": True, "marked_count": count})


@workers_bp.route("/api/workers/attendance/status", methods=["GET"])
@safe_route
def check_attendance_status():
    """Check if attendance is marked for today."""
    is_marked = WorkerService.check_todays_attendance_status()
    return jsonify({"is_marked": is_marked})
