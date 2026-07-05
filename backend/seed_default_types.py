from app import create_app
from models import db, WorkerType, ExpenseType

app = create_app("development")
with app.app_context():
    # Clear existing types
    WorkerType.query.delete()
    ExpenseType.query.delete()
    db.session.commit()

    # Default worker types
    default_worker_types = [
        {
            "name": "Chef",
            "description": "Kitchen staff responsible for food preparation",
            "is_active": True,
        },
        {
            "name": "Waiter",
            "description": "Front-of-house staff serving customers",
            "is_active": True,
        },
        {
            "name": "Manager",
            "description": "Supervisory staff managing operations",
            "is_active": True,
        },
        {
            "name": "Cleaner",
            "description": "Staff responsible for cleaning and maintenance",
            "is_active": True,
        },
        {"name": "Delivery", "description": "Staff handling food delivery", "is_active": True},
    ]

    # Default expense types
    default_expense_types = [
        {"name": "Utilities", "description": "Electricity, water, gas bills", "is_active": True},
        {"name": "Rent", "description": "Monthly rent or lease payments", "is_active": True},
        {"name": "Supplies", "description": "Food ingredients and consumables", "is_active": True},
        {"name": "Equipment", "description": "Kitchen equipment and tools", "is_active": True},
        {"name": "Maintenance", "description": "Repair and maintenance costs", "is_active": True},
        {
            "name": "Marketing",
            "description": "Advertising and promotional expenses",
            "is_active": True,
        },
        {"name": "Insurance", "description": "Business insurance premiums", "is_active": True},
        {"name": "Transportation", "description": "Vehicle and fuel costs", "is_active": True},
    ]

    # Add worker types
    for wt in default_worker_types:
        db.session.add(WorkerType(**wt))

    # Add expense types
    for et in default_expense_types:
        db.session.add(ExpenseType(**et))

    db.session.commit()

    print(
        f"Added {len(default_worker_types)} worker types and {len(default_expense_types)} expense types"
    )
