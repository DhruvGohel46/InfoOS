from models import db, Worker, Advance, SalaryPayment, Attendance, Expense
from datetime import datetime, date
import uuid
from sqlalchemy import func, extract, and_


class WorkerService:
    @staticmethod
    def create_worker(data):
        new_worker = Worker(
            name=data.get("name"),
            phone=data.get("phone"),
            email=data.get("email"),
            role=data.get("role"),
            salary=float(data.get("salary", 0)),
            join_date=(
                datetime.strptime(data.get("join_date"), "%Y-%m-%d").date()
                if data.get("join_date")
                else date.today()
            ),
            status=data.get("status", "active"),
            photo=data.get("photo"),
        )
        db.session.add(new_worker)
        db.session.commit()
        return new_worker

    @staticmethod
    def update_worker(worker_id, data):
        worker = Worker.query.get(worker_id)
        if not worker:
            return None

        if "name" in data:
            worker.name = data["name"]
        if "phone" in data:
            worker.phone = data["phone"]
        if "email" in data:
            worker.email = data["email"]
        if "role" in data:
            worker.role = data["role"]
        if "salary" in data:
            worker.salary = float(data["salary"])
        if "status" in data:
            worker.status = data["status"]
        if "photo" in data:
            worker.photo = data["photo"]

        db.session.commit()
        return worker

    @staticmethod
    def get_all_workers():
        return Worker.query.filter_by(status="active").order_by(Worker.name).all()

    @staticmethod
    def get_worker(worker_id):
        return Worker.query.get(worker_id)

    @staticmethod
    def soft_delete_worker(worker_id):
        worker = Worker.query.get(worker_id)
        if worker:
            worker.status = "inactive"
            db.session.commit()
            return True
        return False

    # ADVANCE MANAGEMENT
    @staticmethod
    def add_advance(worker_id, amount, reason):
        worker = Worker.query.get(worker_id)
        worker_name = worker.name if worker else "Unknown Worker"

        advance = Advance(worker_id=worker_id, amount=amount, reason=reason, date=date.today())
        db.session.add(advance)

        # ALSO RECORD AS EXPENSE
        expense = Expense(
            title=f"Worker Advance: {worker_name}",
            amount=amount,
            category="Advance",
            date=date.today(),
            worker_id=worker_id,
            payment_method="Cash",  # Default for advances
            notes=f"Advance given for: {reason}",
        )
        db.session.add(expense)

        db.session.commit()
        return advance

    @staticmethod
    def get_advances(worker_id):
        return Advance.query.filter_by(worker_id=worker_id).order_by(Advance.date.desc()).all()

    @staticmethod
    def _get_finance_cycle_dates():
        """Helper to get current cycle start/end dates based on settings."""
        from models import Settings

        salary_day_setting = Settings.query.filter_by(key="salary_day").first()
        salary_day = (
            int(salary_day_setting.value)
            if (salary_day_setting and salary_day_setting.value)
            else 1
        )

        today = date.today()
        if today.day >= salary_day:
            start_date = date(today.year, today.month, salary_day)
            # End is next month's salary_day - 1
            next_month = today.month + 1 if today.month < 12 else 1
            next_year = today.year if today.month < 12 else today.year + 1
            end_date = date(next_year, next_month, salary_day)
        else:
            prev_month = today.month - 1 if today.month > 1 else 12
            prev_year = today.year if today.month > 1 else today.year - 1
            start_date = date(prev_year, prev_month, salary_day)
            end_date = date(today.year, today.month, salary_day)

        from datetime import timedelta

        inclusive_end_date = end_date - timedelta(days=1)
        return start_date, inclusive_end_date

    # SALARY MANAGEMENT
    @staticmethod
    def generate_salary(worker_id, month=None, year=None):
        worker = Worker.query.get(worker_id)
        if not worker:
            return None

        # If month/year not provided, use current cycle
        if not month or not year:
            start_date, end_date = WorkerService._get_finance_cycle_dates()
            # For saving in payment record, we use the end month as the 'period' month
            # (e.g., if cycle is May 15 - June 14, it's considered June's salary or May's salary?)
            # Usually it's the month the cycle ends in or starts in.
            # We use month/year from end_date for naming consistency.
            month = end_date.month
            year = end_date.year
        else:
            # If explicit month/year provided (e.g. from history generator), calculate cycle for that month
            from models import Settings

            salary_day_setting = Settings.query.filter_by(key="salary_day").first()
            salary_day = (
                int(salary_day_setting.value)
                if (salary_day_setting and salary_day_setting.value)
                else 1
            )

            # For explicit month, cycle starts at salary_day of month-1 and ends at salary_day-1 of month
            prev_m = month - 1 if month > 1 else 12
            prev_y = year if month > 1 else year - 1
            start_date = date(prev_y, prev_m, salary_day)
            end_date = date(year, month, salary_day)
            from datetime import timedelta

            end_date = end_date - timedelta(days=1)

        # Calculate total advances for the SPECIFIC cycle period
        total_advances = (
            db.session.query(func.sum(Advance.amount))
            .filter(
                Advance.worker_id == worker_id,
                Advance.date >= start_date,
                Advance.date <= end_date,
            )
            .scalar()
            or 0.0
        )

        final_salary = worker.salary - total_advances

        # Check if already generated
        existing = SalaryPayment.query.filter_by(
            worker_id=worker_id, month=month, year=year
        ).first()

        if existing:
            existing.base_salary = worker.salary
            existing.advance_deduction = total_advances
            existing.final_salary = final_salary
            payment = existing
        else:
            payment = SalaryPayment(
                worker_id=worker_id,
                month=month,
                year=year,
                base_salary=worker.salary,
                advance_deduction=total_advances,
                final_salary=final_salary,
                paid=False,
            )
            db.session.add(payment)

        db.session.commit()
        return payment

    @staticmethod
    def mark_salary_paid(payment_id):
        payment = SalaryPayment.query.get(payment_id)
        if payment:
            payment.paid = True
            payment.paid_date = date.today()

            # ALSO RECORD AS EXPENSE
            expense = Expense(
                title=f"Salary Payment: {payment.worker.name} ({payment.month}/{payment.year})",
                amount=payment.final_salary,
                category="Salary",
                date=date.today(),
                worker_id=payment.worker_id,
                payment_method="Bank Transfer",  # Common default for salary
                notes=f"Base: {payment.base_salary}, Deduction: {payment.advance_deduction}",
            )
            db.session.add(expense)

            db.session.commit()
            return True
        return False

    @staticmethod
    def get_salary_history(worker_id):
        return (
            SalaryPayment.query.filter_by(worker_id=worker_id)
            .order_by(SalaryPayment.year.desc(), SalaryPayment.month.desc())
            .all()
        )

    @staticmethod
    def check_salary_status(month, year):
        """
        Check salary payment status for all active workers for a specific month/year.
        """
        # Get all active workers
        active_workers = Worker.query.filter_by(status="active").all()
        total_workers = len(active_workers)

        if total_workers == 0:
            return {
                "total_workers": 0,
                "paid_workers": 0,
                "unpaid_workers": 0,
                "all_paid": True,
            }

        # Count how many have been PAID for this month/year
        # Join SalaryPayment with Worker to ensure we only count active workers
        paid_count = (
            db.session.query(SalaryPayment)
            .join(Worker)
            .filter(
                Worker.status == "active",
                SalaryPayment.month == month,
                SalaryPayment.year == year,
                SalaryPayment.paid == True,
            )
            .count()
        )

        return {
            "total_workers": total_workers,
            "paid_workers": paid_count,
            "unpaid_workers": total_workers - paid_count,
            "all_paid": (total_workers - paid_count) == 0,
        }

    @staticmethod
    def get_advances_sum_map(start_date, end_date):
        """
        Returns a dictionary mapping worker_id to total advance amount for the given period.
        """
        sums = (
            db.session.query(Advance.worker_id, func.sum(Advance.amount))
            .filter(Advance.date >= start_date, Advance.date <= end_date)
            .group_by(Advance.worker_id)
            .all()
        )
        return {s[0]: (s[1] or 0.0) for s in sums}

    # ATTENDANCE MANAGEMENT
    @staticmethod
    def record_attendance(worker_id, status, check_in=None, check_out=None):
        # Check if exists for today
        today = date.today()
        existing = Attendance.query.filter_by(worker_id=worker_id, date=today).first()

        if existing:
            existing.status = status
            if check_in:
                existing.check_in = check_in
            if check_out:
                existing.check_out = check_out
            entry = existing
        else:
            entry = Attendance(
                worker_id=worker_id,
                date=today,
                status=status,
                check_in=check_in,
                check_out=check_out,
            )
            db.session.add(entry)

        db.session.commit()
        return entry

    @staticmethod
    def bulk_mark_present(worker_ids):
        today = date.today()
        count = 0
        for wid in worker_ids:
            # Check if already marked
            exists = Attendance.query.filter_by(worker_id=wid, date=today).first()
            if not exists:
                entry = Attendance(worker_id=wid, date=today, status="Present")
                db.session.add(entry)
                count += 1
        db.session.commit()
        return count

    @staticmethod
    def check_todays_attendance_status():
        """
        Check if attendance has been marked for ANY worker today.
        Returns: True if at least one record exists today, False otherwise.
        """
        today = date.today()
        count = Attendance.query.filter_by(date=today).count()
        return count > 0

    @staticmethod
    def get_today_attendance():
        today = date.today()
        # Return dict: worker_id -> status
        records = Attendance.query.filter_by(date=today).all()
        return {r.worker_id: r.status for r in records}

    @staticmethod
    def get_attendance_history(worker_id):
        return (
            Attendance.query.filter_by(worker_id=worker_id).order_by(Attendance.date.desc()).all()
        )
