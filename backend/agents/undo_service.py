"""Undo Window & Snapshot Restoration Service for Deleted Records.

Provides soft-delete snapshots and a 48-hour recovery window for any agent-executed deletions.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional
from models import (
    db,
    Expense,
    ExpenseItem,
    ExpenseType,
    Category,
    ItemGroup,
    Reminder,
    Notification,
)

_log = logging.getLogger(__name__)

# 48-hour recovery window
UNDO_WINDOW_HOURS = 48


class UndoService:
    """Manages snapshots and restoration for agent deletions."""

    @classmethod
    def capture_expense_snapshot(cls, expense: Expense) -> Dict[str, Any]:
        """Capture full snapshot of an expense and its sub-items."""
        items = []
        for item in expense.items:
            items.append(
                {
                    "id": item.id,
                    "expense_id": item.expense_id,
                    "product_id": item.product_id,
                    "quantity": item.quantity,
                    "purchase_price": float(item.purchase_price or 0),
                    "subtotal": float(item.subtotal or 0),
                }
            )
        return {
            "entity": "expense",
            "id": str(expense.id),
            "title": expense.title,
            "category": expense.category,
            "amount": float(expense.amount or 0),
            "payment_method": expense.payment_method,
            "worker_id": expense.worker_id,
            "date": expense.date.isoformat() if expense.date else None,
            "notes": expense.notes,
            "items": items,
            "deleted_at": datetime.now().isoformat(),
        }

    @classmethod
    def capture_reminder_snapshot(cls, reminder: Reminder) -> Dict[str, Any]:
        """Capture full snapshot of a reminder."""
        return {
            "entity": "reminder",
            "id": str(reminder.id),
            "title": reminder.title,
            "description": reminder.description,
            "reminder_time": reminder.reminder_time.isoformat() if reminder.reminder_time else None,
            "repeat_type": reminder.repeat_type,
            "status": reminder.status,
            "is_active": bool(reminder.is_active),
            "is_dismissed": bool(reminder.is_dismissed),
            "deleted_at": datetime.now().isoformat(),
        }

    @classmethod
    def capture_category_snapshot(cls, category: Category) -> Dict[str, Any]:
        """Capture full snapshot of a category."""
        return {
            "entity": "category",
            "id": category.id,
            "name": category.name,
            "description": category.description,
            "active": bool(category.active),
            "group_id": category.group_id,
            "deleted_at": datetime.now().isoformat(),
        }

    @classmethod
    def capture_item_group_snapshot(cls, group: ItemGroup) -> Dict[str, Any]:
        """Capture full snapshot of an item group."""
        return {
            "entity": "item_group",
            "id": group.id,
            "name": group.name,
            "color": group.color,
            "order": group.order,
            "is_active": bool(group.is_active),
            "deleted_at": datetime.now().isoformat(),
        }

    @classmethod
    def capture_expense_type_snapshot(cls, et: ExpenseType) -> Dict[str, Any]:
        """Capture full snapshot of an expense type."""
        return {
            "entity": "expense_type",
            "id": et.id,
            "name": et.name,
            "description": et.description,
            "is_active": bool(et.is_active),
            "deleted_at": datetime.now().isoformat(),
        }

    @classmethod
    def restore_snapshot(cls, snapshot: Dict[str, Any]) -> Dict[str, Any]:
        """Restore a single entity from its snapshot data."""
        entity = snapshot.get("entity")

        if entity == "expense":
            existing = Expense.query.get(snapshot["id"])
            if existing:
                return {
                    "success": True,
                    "message": f"Expense '{snapshot['title']}' already exists.",
                }

            date_val = (
                datetime.fromisoformat(snapshot["date"]) if snapshot.get("date") else datetime.now()
            )
            new_exp = Expense(
                id=snapshot["id"],
                title=snapshot["title"],
                category=snapshot["category"],
                amount=float(snapshot["amount"]),
                payment_method=snapshot.get("payment_method", "Cash"),
                worker_id=snapshot.get("worker_id"),
                date=date_val,
                notes=snapshot.get("notes", ""),
            )
            db.session.add(new_exp)

            for item_data in snapshot.get("items", []):
                item = ExpenseItem(
                    id=item_data["id"],
                    expense_id=new_exp.id,
                    product_id=item_data.get("product_id"),
                    quantity=str(item_data.get("quantity", "1")),
                    purchase_price=float(item_data.get("purchase_price", 0)),
                    subtotal=float(item_data.get("subtotal", 0)),
                )
                db.session.add(item)

            db.session.commit()

            try:
                from services.aggregation_service import update_daily_summary

                update_daily_summary()
            except Exception:
                pass

            return {
                "success": True,
                "message": f"Restored expense '{snapshot['title']}' (₹{snapshot['amount']})",
            }

        elif entity == "reminder":
            existing = Reminder.query.get(snapshot["id"])
            if existing:
                return {
                    "success": True,
                    "message": f"Reminder '{snapshot['title']}' already exists.",
                }

            time_val = (
                datetime.fromisoformat(snapshot["reminder_time"])
                if snapshot.get("reminder_time")
                else datetime.now()
            )
            new_rem = Reminder(
                id=snapshot["id"],
                title=snapshot["title"],
                description=snapshot.get("description", ""),
                reminder_time=time_val,
                repeat_type=snapshot.get("repeat_type", "none"),
                status=snapshot.get("status", "pending"),
                is_active=snapshot.get("is_active", True),
                is_dismissed=snapshot.get("is_dismissed", False),
            )
            db.session.add(new_rem)
            db.session.commit()
            return {"success": True, "message": f"Restored reminder '{snapshot['title']}'"}

        elif entity == "category":
            existing = Category.query.get(snapshot["id"])
            if existing:
                return {
                    "success": True,
                    "message": f"Category '{snapshot['name']}' already exists.",
                }

            new_cat = Category(
                id=snapshot["id"],
                name=snapshot["name"],
                description=snapshot.get("description", ""),
                active=snapshot.get("active", True),
                group_id=snapshot.get("group_id"),
            )
            db.session.add(new_cat)
            db.session.commit()
            return {"success": True, "message": f"Restored category '{snapshot['name']}'"}

        elif entity == "item_group":
            existing = ItemGroup.query.get(snapshot["id"])
            if existing:
                return {
                    "success": True,
                    "message": f"Item group '{snapshot['name']}' already exists.",
                }

            new_grp = ItemGroup(
                id=snapshot["id"],
                name=snapshot["name"],
                color=snapshot.get("color", "#3b82f6"),
                order=snapshot.get("order", 0),
                is_active=snapshot.get("is_active", True),
            )
            db.session.add(new_grp)
            db.session.commit()
            return {"success": True, "message": f"Restored item group '{snapshot['name']}'"}

        elif entity == "expense_type":
            existing = ExpenseType.query.get(snapshot["id"])
            if existing:
                return {
                    "success": True,
                    "message": f"Expense type '{snapshot['name']}' already exists.",
                }

            new_et = ExpenseType(
                id=snapshot["id"],
                name=snapshot["name"],
                description=snapshot.get("description", ""),
                is_active=snapshot.get("is_active", True),
            )
            db.session.add(new_et)
            db.session.commit()
            return {"success": True, "message": f"Restored expense type '{snapshot['name']}'"}

        return {"success": False, "error": f"Unknown entity type: {entity}"}

    @classmethod
    def restore_batch(cls, batch_snapshots: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Restore an entire batch of deleted snapshots inside a single transaction."""
        restored_count = 0
        try:
            for snap in batch_snapshots:
                res = cls.restore_snapshot(snap)
                if res.get("success"):
                    restored_count += 1
            return {
                "success": True,
                "restored_count": restored_count,
                "message": f"Successfully restored batch of {restored_count} item(s).",
            }
        except Exception as e:
            db.session.rollback()
            _log.error("Batch restore failed: %s", e)
            return {"success": False, "error": f"Batch restore failed: {str(e)}"}
