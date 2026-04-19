from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from sqlalchemy.sql import func, extract
import json
import uuid

db = SQLAlchemy()

class Settings(db.Model):
    __tablename__ = 'settings'
    key = db.Column(db.String(255), primary_key=True)
    value = db.Column(db.Text)
    group_name = db.Column(db.String(50))
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

class Category(db.Model):
    __tablename__ = 'categories'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), unique=True, nullable=False)
    description = db.Column(db.Text)
    active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

class Product(db.Model):
    __tablename__ = 'products'
    product_id = db.Column(db.String(50), primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    price = db.Column(db.Float, nullable=False)
    category_id = db.Column(db.Integer, db.ForeignKey('categories.id'))
    category = db.Column(db.String(255)) # Legacy field support
    image_filename = db.Column(db.String(255))
    active = db.Column(db.Boolean, default=True)
    favorite = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        db.Index('idx_products_category_id', 'category_id'),
        db.Index('idx_products_active', 'active'),
    )

    category_rel = db.relationship('Category', backref='products')

class Inventory(db.Model):
    __tablename__ = 'inventory'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(255), nullable=False)
    type = db.Column(db.String(50), nullable=False) # 'DIRECT_SALE' or 'RAW_MATERIAL'
    unit = db.Column(db.String(20), nullable=False) # 'piece', 'packet', 'kg', 'liter'
    stock = db.Column(db.Float, default=0.0)
    unit_price = db.Column(db.Float, default=0.0) # Cost per unit for raw materials
    alert_threshold = db.Column(db.Float, default=0.0)
    max_stock_history = db.Column(db.Float, default=10.0) # Track highest stock level
    product_id = db.Column(db.String(50), db.ForeignKey('products.product_id'), nullable=True)
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    product = db.relationship('Product', backref=db.backref('inventory', uselist=False))

class Bill(db.Model):
    __tablename__ = 'bills'
    id = db.Column(db.Integer, primary_key=True)
    bill_no = db.Column(db.Integer, nullable=False)
    customer_name = db.Column(db.String(255))
    total_amount = db.Column(db.Float, nullable=False)
    today_token = db.Column(db.Integer, default=0) # For daily token number if needed
    payment_method = db.Column(db.String(50), default='CASH')
    items = db.Column(db.Text, nullable=False) # Stored as JSON string to maintain compatibility
    status = db.Column(db.String(50), default='CONFIRMED')
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())


    __table_args__ = (
        db.UniqueConstraint('bill_no', 'created_at', name='idx_daily_bill_unique'),
        db.Index('idx_bills_created_at_no', 'created_at', 'bill_no'),
        db.Index('idx_bills_status', 'status'),
    )

# ==========================================
# BUSINESS EXPENSE MODELS
# ==========================================

class Expense(db.Model):
    __tablename__ = 'expenses'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    title = db.Column(db.String(255), nullable=False)
    category = db.Column(db.String(100), nullable=False) # 'Salary', 'Utilities', etc.
    amount = db.Column(db.Float, nullable=False)
    payment_method = db.Column(db.String(50), default='Cash')
    worker_id = db.Column(db.String(36), db.ForeignKey('worker.workers.worker_id'), nullable=True)
    date = db.Column(db.DateTime, default=func.now())
    notes = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        db.Index('idx_expenses_date', 'date'),
    )
    
    # Relationship
    worker = db.relationship('Worker', backref=db.backref('expenses', lazy=True))
    items = db.relationship('ExpenseItem', backref='expense', lazy=True, cascade="all, delete-orphan")

    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'category': self.category,
            'amount': self.amount,
            'payment_method': self.payment_method,
            'worker_id': self.worker_id,
            'worker_name': self.worker.name if self.worker else None,
            'date': self.date.isoformat() if hasattr(self.date, 'isoformat') else self.date,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'items': [item.to_dict() for item in self.items]
        }

class ExpenseItem(db.Model):
    __tablename__ = 'expense_items'
    
    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    expense_id = db.Column(db.String(36), db.ForeignKey('expenses.id'), nullable=False)
    product_id = db.Column(db.String(50), nullable=True) # Linked to inventory/product
    quantity = db.Column(db.String(100), nullable=False, default='1')
    purchase_price = db.Column(db.Float, nullable=False)
    subtotal = db.Column(db.Float, nullable=False)
    created_at = db.Column(db.DateTime, default=func.now())

    def to_dict(self):
        return {
            'id': self.id,
            'expense_id': self.expense_id,
            'product_id': self.product_id,
            'quantity': self.quantity,
            'purchase_price': self.purchase_price,
            'subtotal': self.subtotal
        }

# ==========================================
# WORKER MANAGEMENT SYSTEM MODELS
# Schema: worker
# ==========================================

class Worker(db.Model):
    __tablename__ = 'workers'
    __table_args__ = {'schema': 'worker'}

    worker_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = db.Column(db.String(255), nullable=False)
    phone = db.Column(db.String(15))
    email = db.Column(db.String(255))
    role = db.Column(db.String(100)) # e.g., 'Chef', 'Waiter', 'Manager'
    salary = db.Column(db.Float, default=0.0)
    join_date = db.Column(db.Date)
    status = db.Column(db.String(20), default='active') # 'active', 'inactive'
    photo = db.Column(db.Text) # Base64 string or URL
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    # Relationships
    advances = db.relationship('Advance', backref='worker', lazy=True)
    salary_payments = db.relationship('SalaryPayment', backref='worker', lazy=True)
    attendance_records = db.relationship('Attendance', backref='worker', lazy=True)

class Advance(db.Model):
    __tablename__ = 'advances'
    __table_args__ = {'schema': 'worker'}

    advance_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('worker.workers.worker_id'), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    reason = db.Column(db.Text)
    date = db.Column(db.Date, default=func.current_date())
    created_at = db.Column(db.DateTime, default=func.now())

class SalaryPayment(db.Model):
    __tablename__ = 'salary_payments'
    __table_args__ = {'schema': 'worker'}

    payment_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('worker.workers.worker_id'), nullable=False)
    month = db.Column(db.Integer, nullable=False)
    year = db.Column(db.Integer, nullable=False)
    base_salary = db.Column(db.Float, default=0.0)
    advance_deduction = db.Column(db.Float, default=0.0)
    final_salary = db.Column(db.Float, nullable=False)
    paid = db.Column(db.Boolean, default=False)
    paid_date = db.Column(db.Date)
    created_at = db.Column(db.DateTime, default=func.now())

class Attendance(db.Model):
    __tablename__ = 'attendance'
    __table_args__ = (
        db.Index('idx_attendance_worker_date', 'worker_id', 'date'),
        {'schema': 'worker'}
    )

    attendance_id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    worker_id = db.Column(db.String(36), db.ForeignKey('worker.workers.worker_id'), nullable=False)
    date = db.Column(db.Date, default=func.current_date())
    status = db.Column(db.String(20), nullable=False) # 'Present', 'Absent', 'Half-day'
    check_in = db.Column(db.Time, nullable=True)
    check_out = db.Column(db.Time, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())

# ==========================================
# REMINDER SYSTEM MODELS
# ==========================================

class Reminder(db.Model):
    __tablename__ = 'reminders'

    id = db.Column(db.String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = db.Column(db.String(50), nullable=False, default="admin")
    title = db.Column(db.String(255), nullable=False)
    description = db.Column(db.Text, nullable=True)
    reminder_time = db.Column(db.DateTime, nullable=False)
    status = db.Column(db.String(20), default='pending')  # 'pending', 'triggered', 'completed'
    repeat_type = db.Column(db.String(20), default='once')  # 'once', 'daily', 'weekly', 'monthly'
    is_active = db.Column(db.Boolean, default=True)
    is_dismissed = db.Column(db.Boolean, default=False)
    triggered_at = db.Column(db.DateTime, nullable=True)
    last_triggered_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=func.now())
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        db.Index('idx_reminder_status_time', 'status', 'reminder_time'),
        db.Index('idx_user_id', 'user_id'),
    )

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "title": self.title,
            "description": self.description,
            "reminder_time": self.reminder_time.isoformat() if self.reminder_time else None,
            "status": self.status,
            "repeat_type": self.repeat_type,
            "is_active": self.is_active,
            "is_dismissed": self.is_dismissed,
            "triggered_at": self.triggered_at.isoformat() if self.triggered_at else None,
            "last_triggered_at": self.last_triggered_at.isoformat() if self.last_triggered_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }

    @classmethod
    def from_dict(cls, data):
        """Create a Reminder instance from a dictionary"""
        reminder = cls()
        for key, value in data.items():
            if hasattr(reminder, key):
                setattr(reminder, key, value)
        return reminder

# ==========================================
# PRE-AGGREGATED ANALYTICS
# ==========================================

class DailySalesSummary(db.Model):
    """Pre-aggregated daily sales summary for fast analytics queries.
    
    Instead of scanning millions of bill rows, analytics reads from this
    small summary table.  Updated in real-time after every bill/expense
    and reconciled nightly by dashboard_refresher.
    """
    __tablename__ = 'daily_sales_summary'

    date = db.Column(db.Date, primary_key=True)
    total_sales = db.Column(db.Float, default=0.0)
    total_orders = db.Column(db.Integer, default=0)
    total_expenses = db.Column(db.Float, default=0.0)
    net_profit = db.Column(db.Float, default=0.0)
    average_bill_value = db.Column(db.Float, default=0.0)
    top_products_json = db.Column(db.Text, default='[]')  # JSON of top 10 products
    updated_at = db.Column(db.DateTime, default=func.now(), onupdate=func.now())

    __table_args__ = (
        db.Index('idx_daily_summary_date', 'date'),
    )

    def to_dict(self):
        import json as _json
        return {
            'date': self.date.isoformat() if self.date else None,
            'total_sales': self.total_sales,
            'total_orders': self.total_orders,
            'total_expenses': self.total_expenses,
            'net_profit': self.net_profit,
            'average_bill_value': self.average_bill_value,
            'top_products': _json.loads(self.top_products_json) if self.top_products_json else [],
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
