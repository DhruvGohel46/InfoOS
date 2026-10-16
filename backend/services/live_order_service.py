"""
=============================================================================
 LIVE ORDER SERVICE — services/live_order_service.py
=============================================================================

 Business logic for the Live Order Board:
   - Fetching open/pending bills and merge groups for the board
   - Merging bills into groups (create or extend)
   - Settling merge groups (applying payments)
   - Splitting (un-merging) groups
   - Version-hash polling for multi-terminal sync

 All methods are pure business logic — no Flask request/response handling.
 Called by routes/billing.py endpoints.
=============================================================================
"""

import json
import hashlib
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Optional

from models import db, Bill, MergeGroup
from sqlalchemy import func
from error_handler import ValidationError, NotFoundError

logger = logging.getLogger(__name__)

_EXCLUDED_STATUSES = {"CANCELLED", "VOIDED"}


def get_live_orders() -> Dict[str, Any]:
    """
    Return all "live" orders for the board:
      - Today's non-cancelled bills that are pending/partial, OR
      - Today's paid bills that belong to an open merge group
      - All open merge groups

    Also returns a version_hash for change-detection polling.
    """
    from services.business_day_service import BusinessDayService

    w_start, w_end = BusinessDayService.get_business_day_window()

    # All today's non-cancelled bills that are either:
    #   1) payment_status in ('pending', 'partial'), OR
    #   2) part of an open merge group (merge_group_id is not null and group status='open')
    bills_query = Bill.query.filter(
        Bill.created_at >= w_start,
        Bill.created_at < w_end,
        ~func.upper(func.trim(Bill.status)).in_(_EXCLUDED_STATUSES),
    ).order_by(Bill.bill_no.asc())

    all_today_bills = bills_query.all()

    # Open merge groups (may span multiple days theoretically, but typically today)
    open_groups = MergeGroup.query.filter(
        MergeGroup.status == "open",
    ).all()

    # Build set of bill IDs in open groups for fast lookup
    grouped_bill_ids = set()
    for group in open_groups:
        try:
            member_ids = json.loads(group.member_bill_ids) if group.member_bill_ids else []
            grouped_bill_ids.update(member_ids)
        except (json.JSONDecodeError, TypeError):
            pass

    # Filter bills for the board: pending/partial OR in an open group
    live_bills = []
    for bill in all_today_bills:
        ps = getattr(bill, "payment_status", "paid")
        if ps in ("pending", "partial"):
            live_bills.append(bill)
        elif bill.id in grouped_bill_ids:
            live_bills.append(bill)
        elif getattr(bill, "merge_group_id", None) and bill.id in grouped_bill_ids:
            live_bills.append(bill)

    # Serialize
    bills_data = [_bill_to_live_dict(b) for b in live_bills]
    groups_data = [g.to_dict() for g in open_groups]

    # Version hash for polling
    version_hash = _compute_version_hash(live_bills, open_groups)

    return {
        "bills": bills_data,
        "merge_groups": groups_data,
        "version_hash": version_hash,
    }


def merge_bills(bill_ids: List[int], actor: str = "admin") -> Dict[str, Any]:
    """
    Merge 2+ bills into a single merge group.

    Rules:
      - If any bill is already in an open group, all bills join THAT group
        (no nested groups, no duplicate groups).
      - If multiple bills are in DIFFERENT open groups, all groups collapse
        into one.
      - Bills must be today's, non-cancelled.
      - Cannot merge a bill that's in a settled/reverted group.
    """
    if len(bill_ids) < 2:
        raise ValidationError("At least 2 bills required to merge", code="MERGE_MIN_BILLS")

    today = date.today()
    bills = Bill.query.filter(
        Bill.id.in_(bill_ids),
    ).all()

    if len(bills) != len(bill_ids):
        found_ids = {b.id for b in bills}
        missing = [bid for bid in bill_ids if bid not in found_ids]
        raise NotFoundError(f"Bills not found: {missing}", code="BILLS_NOT_FOUND")

    # Validate all are today's and non-cancelled
    for bill in bills:
        if bill.created_at and bill.created_at.date() != today:
            raise ValidationError(f"Bill #{bill.bill_no} is not from today", code="BILL_NOT_TODAY")
        if bill.status and bill.status.strip().upper() in _EXCLUDED_STATUSES:
            raise ValidationError(
                f"Bill #{bill.bill_no} is {bill.status} and cannot be merged",
                code="BILL_CANCELLED",
            )

    # Find existing open groups that any of these bills belong to
    existing_group_ids = set()
    for bill in bills:
        gid = getattr(bill, "merge_group_id", None)
        if gid:
            existing_group_ids.add(gid)

    # Validate none are in settled/reverted groups
    if existing_group_ids:
        existing_groups = MergeGroup.query.filter(MergeGroup.id.in_(existing_group_ids)).all()
        for g in existing_groups:
            if g.status != "open":
                raise ValidationError(
                    f"Cannot merge: bill is part of a {g.status} merge group ({g.id})",
                    code="GROUP_NOT_OPEN",
                )

    # Determine target group: use existing open group if one exists, else create new
    target_group = None
    groups_to_absorb = []

    if existing_group_ids:
        existing_groups = MergeGroup.query.filter(
            MergeGroup.id.in_(existing_group_ids),
            MergeGroup.status == "open",
        ).all()

        if existing_groups:
            target_group = existing_groups[0]
            groups_to_absorb = existing_groups[1:]  # Collapse multiple groups

    if target_group is None:
        target_group = MergeGroup(
            created_by=actor,
            member_bill_ids="[]",
            total_amount=0.0,
            amount_paid=0.0,
            amount_pending=0.0,
            status="open",
        )
        db.session.add(target_group)
        db.session.flush()  # Get the ID

    # Collect all member bill IDs (existing members + new + absorbed groups' members)
    all_member_ids = set()

    # Existing members of target group
    try:
        existing_members = json.loads(target_group.member_bill_ids or "[]")
        all_member_ids.update(existing_members)
    except (json.JSONDecodeError, TypeError):
        pass

    # Members from absorbed groups
    for g in groups_to_absorb:
        try:
            g_members = json.loads(g.member_bill_ids or "[]")
            all_member_ids.update(g_members)
        except (json.JSONDecodeError, TypeError):
            pass
        # Mark absorbed group as reverted
        g.status = "reverted"

    # Add the new bill IDs
    all_member_ids.update(bill_ids)

    # Load ALL member bills to compute totals
    all_member_bills = Bill.query.filter(Bill.id.in_(all_member_ids)).all()

    # Update all member bills to point to target group
    for bill in all_member_bills:
        bill.merge_group_id = target_group.id

    # Recompute group totals from member bills
    target_group.member_bill_ids = json.dumps(sorted(all_member_ids))
    target_group.total_amount = sum(b.total_amount for b in all_member_bills)
    target_group.amount_paid = sum(getattr(b, "amount_paid", 0.0) or 0.0 for b in all_member_bills)
    target_group.amount_pending = sum(
        getattr(b, "amount_pending", 0.0) or 0.0 for b in all_member_bills
    )

    db.session.commit()

    logger.info(
        "Merged %d bills into group %s (total=%.2f, paid=%.2f, pending=%.2f) by %s",
        len(all_member_ids),
        target_group.id,
        target_group.total_amount,
        target_group.amount_paid,
        target_group.amount_pending,
        actor,
    )

    return target_group.to_dict()


def settle_group(
    group_id: str,
    payments: List[Dict[str, Any]],
    actor: str = "admin",
) -> Dict[str, Any]:
    """
    Settle a merge group by applying payments to the pending amount.

    Flat allocation: once the group is fully settled, all member bills
    are marked as 'paid' with amount_paid = total_amount, amount_pending = 0.

    payments: [{"method": "CASH", "amount": 220.0}, ...]
    """
    group = MergeGroup.query.get(group_id)
    if not group:
        raise NotFoundError(f"Merge group {group_id} not found", code="GROUP_NOT_FOUND")

    if group.status != "open":
        raise ValidationError(
            f"Merge group is already {group.status}",
            code="GROUP_NOT_OPEN",
        )

    total_payment = sum(p.get("amount", 0) for p in payments)
    if total_payment < group.amount_pending - 0.01:  # Allow tiny float rounding
        raise ValidationError(
            f"Payment total (₹{total_payment:.2f}) is less than pending amount (₹{group.amount_pending:.2f})",
            code="INSUFFICIENT_PAYMENT",
        )

    # Update group
    group.amount_paid = group.total_amount
    group.amount_pending = 0.0
    group.status = "settled"
    group.settled_at = datetime.now()

    # Flat allocation: mark all member bills as paid
    member_ids = json.loads(group.member_bill_ids or "[]")
    member_bills = Bill.query.filter(Bill.id.in_(member_ids)).all()
    for bill in member_bills:
        bill.payment_status = "paid"
        bill.amount_paid = bill.total_amount
        bill.amount_pending = 0.0

    db.session.commit()

    # Re-aggregate daily summary since revenue status changed
    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception as e:
        logger.warning("Aggregation update after settle: %s", e)

    logger.info(
        "Settled merge group %s: ₹%.2f collected (%d payments) by %s",
        group_id,
        total_payment,
        len(payments),
        actor,
    )

    return group.to_dict()


def settle_bill(
    bill_id: int,
    payments: List[Dict[str, Any]],
    actor: str = "admin",
) -> Dict[str, Any]:
    """
    Settle a standalone pending bill by marking it as paid.
    Supports lookup by either primary key id or bill_no.
    """
    bill = Bill.query.get(bill_id)
    if not bill:
        from services.business_day_service import BusinessDayService

        w_start, w_end = BusinessDayService.get_business_day_window()
        bill = (
            Bill.query.filter(
                Bill.bill_no == bill_id,
                Bill.created_at >= w_start,
                Bill.created_at < w_end,
            )
            .order_by(Bill.id.desc())
            .first()
        )

    if not bill:
        raise NotFoundError(f"Bill #{bill_id} not found", code="BILL_NOT_FOUND")

    total_payment = sum(p.get("amount", 0) for p in payments)
    pending = getattr(bill, "amount_pending", 0.0) or bill.total_amount
    if total_payment < pending - 0.01:
        raise ValidationError(
            f"Payment total (₹{total_payment:.2f}) is less than pending amount (₹{pending:.2f})",
            code="INSUFFICIENT_PAYMENT",
        )

    bill.payment_status = "paid"
    bill.amount_paid = bill.total_amount
    bill.amount_pending = 0.0
    if payments and len(payments) == 1:
        bill.payment_method = payments[0].get("method", bill.payment_method)

    db.session.commit()

    try:
        from services.aggregation_service import update_daily_summary

        update_daily_summary()
    except Exception as e:
        logger.warning("Aggregation update after settle bill: %s", e)

    logger.info(
        "Settled standalone bill #%d: ₹%.2f collected by %s",
        bill.bill_no,
        total_payment,
        actor,
    )

    return _bill_to_live_dict(bill)


def split_group(group_id: str, actor: str = "admin") -> Dict[str, Any]:
    """
    Un-merge a merge group. Admin-only. Only allowed when status='open'.

    Clears merge_group_id on all member bills. Marks group as 'reverted'
    (permanent audit trail rather than deletion).
    """
    group = MergeGroup.query.get(group_id)
    if not group:
        raise NotFoundError(f"Merge group {group_id} not found", code="GROUP_NOT_FOUND")

    if group.status != "open":
        raise ValidationError(
            f"Cannot split: merge group is {group.status}. Only open groups can be split.",
            code="GROUP_NOT_OPEN",
        )

    # Clear merge_group_id on all member bills
    member_ids = json.loads(group.member_bill_ids or "[]")
    if member_ids:
        Bill.query.filter(Bill.id.in_(member_ids)).update(
            {"merge_group_id": None}, synchronize_session="fetch"
        )

    group.status = "reverted"
    db.session.commit()

    logger.info("Split (reverted) merge group %s by %s", group_id, actor)

    return group.to_dict()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _bill_to_live_dict(bill: Bill) -> Dict[str, Any]:
    """Serialize a Bill for the live order board."""
    try:
        items = json.loads(bill.items) if isinstance(bill.items, str) else bill.items
    except (json.JSONDecodeError, TypeError):
        items = []

    return {
        "id": bill.id,
        "bill_no": bill.bill_no,
        "today_token": bill.today_token,
        "customer_name": bill.customer_name,
        "order_type": bill.order_type,
        "table_no": bill.table_no,
        "total_amount": bill.total_amount,
        "payment_status": getattr(bill, "payment_status", "paid"),
        "amount_paid": getattr(bill, "amount_paid", bill.total_amount),
        "amount_pending": getattr(bill, "amount_pending", 0.0),
        "merge_group_id": getattr(bill, "merge_group_id", None),
        "payment_method": bill.payment_method,
        "item_count": len(items),
        "items": items,
        "status": bill.status,
        "created_at": str(bill.created_at),
    }


def _compute_version_hash(bills: list, groups: list) -> str:
    """
    Compute a hash representing the current state of live orders.
    If this hash changes, the board needs to refresh.
    """
    parts = []
    for b in bills:
        parts.append(f"{b.id}:{b.updated_at}")
    for g in groups:
        parts.append(f"g:{g.id}:{g.status}:{g.settled_at}")

    raw = "|".join(parts) if parts else "empty"
    return hashlib.md5(raw.encode()).hexdigest()[:12]
