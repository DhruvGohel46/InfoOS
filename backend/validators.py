"""
=============================================================================
 REQUEST VALIDATORS — validators.py
=============================================================================

 Marshmallow schemas for validating all POST/PUT request payloads.

 Each schema is used at the entry point of its corresponding route handler
 via `schema.load(data)`.  If validation fails, marshmallow raises a
 `MarshmallowValidationError` which is caught by the @safe_route decorator
 and converted into a 400 response.

 Design decisions:
   - Using marshmallow (not pydantic) because it's the Flask ecosystem
     standard and integrates naturally with SQLAlchemy.
   - Schemas are intentionally permissive on optional fields to avoid
     breaking existing frontend behaviour.
=============================================================================
"""

from marshmallow import (
    Schema,
    fields,
    validate,
    ValidationError as MarshmallowValidationError,
    EXCLUDE,
)

# Re-export for convenience
MarshmallowValidationError = MarshmallowValidationError


# ---------------------------------------------------------------------------
# BILLING
# ---------------------------------------------------------------------------


class BillItemSchema(Schema):
    """Schema for a single item within a bill."""

    product_id = fields.String(required=True)
    quantity = fields.Integer(required=True, validate=validate.Range(min=1))
    name = fields.String(load_default=None)
    price = fields.Float(load_default=None)

    class Meta:
        unknown = EXCLUDE


class BillCreateSchema(Schema):
    """Schema for POST /api/bill/create."""

    products = fields.List(
        fields.Nested(BillItemSchema), required=True, validate=validate.Length(min=1)
    )
    customer_name = fields.String(load_default="")
    payment_method = fields.String(load_default="CASH")
    print = fields.Boolean(load_default=False)

    class Meta:
        unknown = EXCLUDE


class BillUpdateSchema(Schema):
    """Schema for PUT /api/bill/<bill_no>/update."""

    products = fields.List(fields.Nested(BillItemSchema), load_default=[])
    customer_name = fields.String(load_default="")
    total_amount = fields.Float(load_default=0)

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# PRODUCTS
# ---------------------------------------------------------------------------


class ProductCreateSchema(Schema):
    """Schema for POST /api/products."""

    product_id = fields.String(required=True)
    name = fields.String(required=True, validate=validate.Length(min=1))
    price = fields.Float(required=True, validate=validate.Range(min=0))
    category = fields.String(required=True)
    category_id = fields.Integer(load_default=None)
    active = fields.Boolean(load_default=True)

    class Meta:
        unknown = EXCLUDE


class ProductUpdateSchema(Schema):
    """Schema for PUT /api/products/<id>.

    Partial update — at least one field should be present (enforced in route).
    """

    name = fields.String(validate=validate.Length(min=1))
    price = fields.Float(validate=validate.Range(min=0, min_inclusive=False))
    category = fields.String()
    category_id = fields.Integer()
    active = fields.Boolean()
    favorite = fields.Boolean()

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# WORKERS
# ---------------------------------------------------------------------------


class WorkerCreateSchema(Schema):
    """Schema for POST /api/workers."""

    name = fields.String(required=True, validate=validate.Length(min=1))
    phone = fields.String(load_default=None)
    email = fields.String(load_default=None)
    role = fields.String(load_default=None)
    salary = fields.Float(load_default=0.0, validate=validate.Range(min=0))
    join_date = fields.String(load_default=None)
    status = fields.String(load_default="active")
    photo = fields.String(load_default=None)

    class Meta:
        unknown = EXCLUDE


class WorkerUpdateSchema(Schema):
    """Schema for PUT /api/workers/<id>."""

    name = fields.String(validate=validate.Length(min=1))
    phone = fields.String()
    email = fields.String()
    role = fields.String()
    salary = fields.Float(validate=validate.Range(min=0))
    join_date = fields.String()
    status = fields.String()
    photo = fields.String()

    class Meta:
        unknown = EXCLUDE


class AdvanceCreateSchema(Schema):
    """Schema for POST /api/workers/<id>/advance."""

    amount = fields.Float(required=True, validate=validate.Range(min=0, min_inclusive=False))
    reason = fields.String(load_default="")

    class Meta:
        unknown = EXCLUDE


class AttendanceSchema(Schema):
    """Schema for POST /api/workers/<id>/attendance."""

    status = fields.String(
        load_default="Present",
        validate=validate.OneOf(["Present", "Absent", "Half-day"]),
    )
    check_in = fields.String(load_default=None)
    check_out = fields.String(load_default=None)

    class Meta:
        unknown = EXCLUDE


class SalaryGenerateSchema(Schema):
    """Schema for POST /api/workers/<id>/generate-salary."""

    month = fields.Integer(validate=validate.Range(min=1, max=12))
    year = fields.Integer(validate=validate.Range(min=2020, max=2099))

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# INVENTORY
# ---------------------------------------------------------------------------


class InventoryCreateSchema(Schema):
    """Schema for POST /api/inventory/create."""

    name = fields.String(required=True, validate=validate.Length(min=1))
    type = fields.String(required=True, validate=validate.OneOf(["DIRECT_SALE", "RAW_MATERIAL"]))
    unit = fields.String(
        required=True,
        validate=validate.OneOf(["piece", "packet", "kg", "liter", "gram", "ml", "box", "bottle"]),
    )
    stock = fields.Float(load_default=0.0)
    unit_price = fields.Float(load_default=0.0)
    alert_threshold = fields.Float(load_default=0.0)
    product_id = fields.String(load_default=None)

    class Meta:
        unknown = EXCLUDE


class InventoryUpdateSchema(Schema):
    """Schema for PUT /api/inventory/<id>."""

    name = fields.String()
    type = fields.String(validate=validate.OneOf(["DIRECT_SALE", "RAW_MATERIAL"]))
    unit = fields.String()
    stock = fields.Float()
    unit_price = fields.Float()
    alert_threshold = fields.Float()
    product_id = fields.String()

    class Meta:
        unknown = EXCLUDE


class StockAdjustSchema(Schema):
    """Schema for POST /api/inventory/adjust."""

    id = fields.Integer(required=True)
    adjustment = fields.Float(required=True)

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# EXPENSES
# ---------------------------------------------------------------------------


class ExpenseItemSchema(Schema):
    """Schema for an individual expense line item."""

    product_id = fields.String(load_default=None)
    name = fields.String(load_default=None)
    quantity = fields.Raw(load_default="1")  # Can be string like "2 kg"
    purchase_price = fields.Float(load_default=0)
    subtotal = fields.Float(load_default=0)

    class Meta:
        unknown = EXCLUDE


class ExpenseCreateSchema(Schema):
    """Schema for POST /api/expenses."""

    title = fields.String(required=True, validate=validate.Length(min=1))
    category = fields.String(required=True, validate=validate.Length(min=1))
    amount = fields.Float(required=True, validate=validate.Range(min=0, min_inclusive=False))
    payment_method = fields.String(load_default="Cash")
    worker_id = fields.String(load_default=None)
    date = fields.Date(load_default=None)  # Automatically parses ISO date strings
    notes = fields.String(load_default="")
    items = fields.List(fields.Nested(ExpenseItemSchema), load_default=[])

    class Meta:
        unknown = EXCLUDE


class ExpenseUpdateSchema(Schema):
    """Schema for PUT /api/expenses/<id>."""

    title = fields.String()
    category = fields.String()
    amount = fields.Float(validate=validate.Range(min=0, min_inclusive=False))
    payment_method = fields.String()
    worker_id = fields.String(allow_none=True)
    date = fields.Date()
    notes = fields.String()
    items = fields.List(fields.Nested(ExpenseItemSchema), load_default=[])

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# CATEGORIES
# ---------------------------------------------------------------------------


class CategoryCreateSchema(Schema):
    """Schema for POST /api/categories."""

    name = fields.String(required=True, validate=validate.Length(min=1))
    description = fields.String(load_default="")
    active = fields.Boolean(load_default=True)

    class Meta:
        unknown = EXCLUDE


class CategoryUpdateSchema(Schema):
    """Schema for PUT /api/categories/<id>."""

    name = fields.String(validate=validate.Length(min=1))
    description = fields.String()
    active = fields.Boolean()

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# REMINDERS
# ---------------------------------------------------------------------------


class ReminderCreateSchema(Schema):
    """Schema for POST /api/reminders."""

    title = fields.String(required=True, validate=validate.Length(min=1))
    description = fields.String(load_default=None)
    reminder_time = fields.String(required=True)
    repeat_type = fields.String(
        load_default="once",
        validate=validate.OneOf(["once", "daily", "weekly", "monthly", "none"]),
    )
    user_id = fields.String(load_default="admin")

    class Meta:
        unknown = EXCLUDE


# ---------------------------------------------------------------------------
# SETTINGS
# ---------------------------------------------------------------------------


class SettingItemSchema(Schema):
    """Schema for a single setting entry in bulk update."""

    key = fields.String(required=True)
    value = fields.Raw(required=True)
    group_name = fields.String(load_default=None)

    class Meta:
        unknown = EXCLUDE
