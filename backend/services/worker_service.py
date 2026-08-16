from models import db, Worker, Advance, SalaryPayment, Attendance, Expense, WorkerType
from datetime import datetime, date
import uuid
from sqlalchemy import func, extract, and_


class WorkerService:
    @staticmethod
    def create_worker(data):
        # Generate sequential worker ID: W001, W002...
        max_num = 0
        try:
            # Query all worker IDs
            all_ids = db.session.query(Worker.worker_id).all()
            for (w_id,) in all_ids:
                if w_id and w_id.startswith("W"):
                    try:
                        num = int(w_id[1:])
                        if num > max_num:
                            max_num = num
                    except ValueError:
                        pass
        except Exception as e:
            print(f"Error generating sequential worker ID: {e}")

        new_id = f"W{max_num + 1:03d}"

        worker_type_id = data.get("worker_type_id")
        role = data.get("role")
        if worker_type_id and not role:
            wt = WorkerType.query.get(worker_type_id)
            if wt:
                role = wt.name

        salary_day = data.get("salary_day")
        if salary_day not in (None, ""):
            try:
                salary_day = int(salary_day)
            except (ValueError, TypeError):
                salary_day = None
        else:
            salary_day = None

        join_date_val = data.get("join_date")
        parsed_join_date = date.today()
        if join_date_val:
            try:
                if isinstance(join_date_val, str):
                    parsed_join_date = datetime.strptime(
                        join_date_val.split("T")[0], "%Y-%m-%d"
                    ).date()
                elif isinstance(join_date_val, (datetime, date)):
                    parsed_join_date = (
                        join_date_val.date()
                        if isinstance(join_date_val, datetime)
                        else join_date_val
                    )
            except (ValueError, TypeError):
                parsed_join_date = date.today()

        new_worker = Worker(
            worker_id=new_id,
            name=data.get("name"),
            phone=data.get("phone"),
            email=data.get("email"),
            role=role,
            worker_type_id=worker_type_id,
            salary=(float(data.get("salary")) if data.get("salary") not in (None, "") else 0.0),
            salary_day=salary_day,
            join_date=parsed_join_date,
            status=data.get("status", "active"),
            description=data.get("description"),
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
        if "description" in data:
            worker.description = data["description"]
        if "phone" in data:
            worker.phone = data["phone"]
        if "email" in data:
            worker.email = data["email"]
        if "role" in data:
            worker.role = data["role"]
        if "worker_type_id" in data:
            worker.worker_type_id = data["worker_type_id"]
            if worker.worker_type_id:
                wt = WorkerType.query.get(worker.worker_type_id)
                if wt:
                    worker.role = wt.name
        if "salary" in data:
            val = data.get("salary")
            worker.salary = float(val) if val not in (None, "") else 0.0
        if "salary_day" in data:
            s_val = data.get("salary_day")
            if s_val not in (None, ""):
                try:
                    worker.salary_day = int(s_val)
                except (ValueError, TypeError):
                    pass
            else:
                worker.salary_day = None
        if "join_date" in data:
            j_val = data.get("join_date")
            if j_val:
                try:
                    if isinstance(j_val, str):
                        worker.join_date = datetime.strptime(j_val.split("T")[0], "%Y-%m-%d").date()
                    elif isinstance(j_val, (datetime, date)):
                        worker.join_date = j_val.date() if isinstance(j_val, datetime) else j_val
                except (ValueError, TypeError):
                    pass
            else:
                worker.join_date = None
        if "status" in data:
            worker.status = data["status"]
        if "photo" in data:
            worker.photo = data["photo"]

        db.session.commit()
        return worker

    @staticmethod
    def get_all_workers(status="active"):
        if status == "all":
            return Worker.query.order_by(Worker.name).all()
        elif status:
            return Worker.query.filter_by(status=status).order_by(Worker.name).all()
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
            category="Salary",
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
    def get_effective_salary_day(worker=None):
        """
        Determine effective salary day (1-31) for a worker:
        - If salary_date_mode is 'WORKER':
            1. Use worker.salary_day if set (1-31)
            2. Else fallback to worker's Start Date (join_date.day)
            3. Else fallback to global salary_day setting (default 10)
        - If salary_date_mode is 'GLOBAL':
            1. Use global_salary_day or salary_day setting (default 10)
        """
        from models import Settings, Worker

        mode_setting = Settings.query.filter_by(key="salary_date_mode").first()
        mode = mode_setting.value.upper() if (mode_setting and mode_setting.value) else "GLOBAL"

        if mode == "WORKER" and worker:
            w_obj = Worker.query.get(worker) if isinstance(worker, str) else worker
            if w_obj:
                if w_obj.salary_day and 1 <= w_obj.salary_day <= 31:
                    return w_obj.salary_day
                if w_obj.join_date:
                    return w_obj.join_date.day

        global_day_setting = Settings.query.filter_by(key="global_salary_day").first()
        if not global_day_setting or not global_day_setting.value:
            global_day_setting = Settings.query.filter_by(key="salary_day").first()
        try:
            val = (
                int(global_day_setting.value)
                if (global_day_setting and global_day_setting.value)
                else 10
            )
            return max(1, min(31, val))
        except (ValueError, TypeError):
            return 10

    @staticmethod
    def _get_finance_cycle_dates(worker=None, ref_date=None):
        """
        Helper to get current cycle start/end dates based on settings and worker.
        Cycle for day D ending in month M, year Y:
        - Ends on date(Y, M, min(D, max_days_M))
        - Starts on prev_end_date + 1 day
        """
        import calendar
        from datetime import timedelta

        salary_day = WorkerService.get_effective_salary_day(worker)
        today = ref_date or date.today()

        max_days = calendar.monthrange(today.year, today.month)[1]
        effective_day = min(salary_day, max_days)

        if today.day <= effective_day:
            cycle_month = today.month
            cycle_year = today.year
        else:
            cycle_month = today.month + 1 if today.month < 12 else 1
            cycle_year = today.year if today.month < 12 else today.year + 1

        cycle_max_days = calendar.monthrange(cycle_year, cycle_month)[1]
        end_date = date(cycle_year, cycle_month, min(salary_day, cycle_max_days))

        prev_month = cycle_month - 1 if cycle_month > 1 else 12
        prev_year = cycle_year if cycle_month > 1 else cycle_year - 1
        prev_max_days = calendar.monthrange(prev_year, prev_month)[1]
        prev_end_date = date(prev_year, prev_month, min(salary_day, prev_max_days))

        start_date = prev_end_date + timedelta(days=1)
        return start_date, end_date

    # SALARY MANAGEMENT
    @staticmethod
    def generate_salary(worker_id, month=None, year=None):
        worker = Worker.query.get(worker_id)
        if not worker:
            return None

        import calendar
        from datetime import timedelta

        salary_day = WorkerService.get_effective_salary_day(worker)

        # If month/year not provided, use current cycle
        if not month or not year:
            start_date, end_date = WorkerService._get_finance_cycle_dates(worker=worker)
            month = end_date.month
            year = end_date.year
        else:
            month = int(month)
            year = int(year)
            end_max_days = calendar.monthrange(year, month)[1]
            end_date = date(year, month, min(salary_day, end_max_days))

            prev_m = month - 1 if month > 1 else 12
            prev_y = year if month > 1 else year - 1
            prev_max_days = calendar.monthrange(prev_y, prev_m)[1]
            prev_end_date = date(prev_y, prev_m, min(salary_day, prev_max_days))
            start_date = prev_end_date + timedelta(days=1)

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
            # If not yet paid, re-evaluate and update with latest calculation
            if not existing.paid:
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
