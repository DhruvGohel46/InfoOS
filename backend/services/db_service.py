import json
from datetime import datetime, date
from typing import List, Dict, Optional, Any
from sqlalchemy import func, or_
from models import db, Product, Bill, Category, Settings, Inventory, AuditEvent, ItemGroup
from config import config
from utils.product_variations import enrich_product_dict, normalize_variations, serialize_variations


class DatabaseService:
    def __init__(self):
        # No specific initialization needed for SQLAlchemy service
        # as db session is handled by Flask-SQLAlchemy
        pass

    # ---------------------------------------------------------
    # AUDIT LOGGING
    # ---------------------------------------------------------

    def add_audit_event(
        self,
        action: str,
        success: bool = True,
        actor_sub: str | None = None,
        reason_code: str | None = None,
        meta: dict | None = None,
        ip: str | None = None,
        user_agent: str | None = None,
        request_id: str | None = None,
    ) -> bool:
        try:
            ev = AuditEvent(
                action=action,
                success=success,
                actor_sub=actor_sub,
                reason_code=reason_code,
                ip=ip,
                user_agent=user_agent,
                request_id=request_id,
                meta_json=(json.dumps(meta) if meta is not None else None),
            )
            db.session.add(ev)
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # PRODUCT MANAGEMENT
    # ---------------------------------------------------------

    def _product_to_dict(
        self, p: Product, extra: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        p_dict = {
            "product_id": p.product_id,
            "name": p.name,
            "price": p.price,
            "takeaway_price": p.takeaway_price,
            "category_id": p.category_id,
            "category": p.category,
            "category_name": p.category_rel.name if p.category_rel else None,
            "image_filename": p.image_filename,
            "active": p.active,
            "favorite": p.favorite,
            "display_order": getattr(p, "display_order", 0),
            "variations": normalize_variations(getattr(p, "variations", None)),
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at),
        }
        if extra:
            p_dict.update(extra)
        if not p_dict.get("category") and p_dict.get("category_name"):
            p_dict["category"] = p_dict["category_name"]
        return enrich_product_dict(p_dict)

    def get_all_products(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all products with category info"""
        query = Product.query

        if not include_inactive:
            query = query.filter(Product.active == True)

        products = query.order_by(Product.display_order, Product.name).all()

        result = []
        for p in products:
            result.append(self._product_to_dict(p))

        return result

    def get_all_products_with_stock(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all products with current stock info"""
        # Join Product with Inventory
        query = db.session.query(Product, Inventory).outerjoin(
            Inventory, Product.product_id == Inventory.product_id
        )

        if not include_inactive:
            query = query.filter(Product.active == True)

        results = query.order_by(Product.display_order, Product.name).all()

        products = []
        for p, inv in results:
            extra = {
                "stock": inv.stock if inv else 0,
                "stock_status": "In Stock",
            }

            if inv:
                if inv.stock <= 0:
                    extra["stock_status"] = "Out of Stock"
                elif inv.stock <= inv.alert_threshold:
                    extra["stock_status"] = "Low Stock"
            else:
                extra["stock_status"] = "N/A"

            products.append(self._product_to_dict(p, extra))
        return products

    def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific product by ID"""
        p = Product.query.get(product_id)
        if not p:
            return None

        return self._product_to_dict(p)

    def create_product(self, product_data: Dict[str, Any]) -> bool:
        """Create a new product"""
        try:
            if Product.query.get(product_data["product_id"]):
                return False

            new_product = Product(
                product_id=product_data["product_id"],
                name=product_data["name"],
                price=float(product_data["price"]),
                takeaway_price=(
                    float(product_data["takeaway_price"])
                    if product_data.get("takeaway_price") is not None
                    else None
                ),
                category_id=product_data.get("category_id"),
                category=product_data.get("category"),
                image_filename=product_data.get("image_filename"),
                active=bool(product_data.get("active", True)),
                variations=serialize_variations(product_data.get("variations", [])),
            )
            db.session.add(new_product)
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error creating product: {e}")
            db.session.rollback()
            return False

    def update_product(self, product_id: str, product_data: Dict[str, Any]) -> bool:
        """Update an existing product"""
        try:
            p = Product.query.get(product_id)
            if not p:
                return False

            if "name" in product_data:
                p.name = product_data["name"]
            if "price" in product_data:
                p.price = float(product_data["price"])
            if "takeaway_price" in product_data:
                p.takeaway_price = (
                    float(product_data["takeaway_price"])
                    if product_data["takeaway_price"] is not None
                    else None
                )
            if "category_id" in product_data:
                p.category_id = product_data["category_id"]
            if "category" in product_data:
                p.category = product_data["category"]
            if "image_filename" in product_data:
                p.image_filename = product_data["image_filename"]
            if "active" in product_data:
                p.active = bool(product_data["active"])
            if "favorite" in product_data:
                p.favorite = bool(product_data["favorite"])
            if "variations" in product_data:
                p.variations = serialize_variations(product_data["variations"])

            p.updated_at = datetime.now()
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating product: {e}")
            db.session.rollback()
            return False

    def delete_product(self, product_id: str) -> bool:
        """Soft-delete a product by deactivating it"""
        try:
            p = Product.query.get(product_id)
            if p:
                p.active = False
                p.updated_at = datetime.now()
                db.session.commit()
                return True
            return False
        except Exception as e:
            print(f"Error deleting product: {e}")
            db.session.rollback()
            return False

    def permanently_delete_product(self, product_id: str) -> bool:
        """Permanently delete a product (Hard Delete)"""
        try:
            p = Product.query.get(product_id)
            if p:
                db.session.delete(p)
                db.session.commit()
                return True
            return False
        except Exception as e:
            print(f"Error permanently deleting product: {e}")
            db.session.rollback()
            return False

    def clear_all_products(self):
        """Clear all products"""
        try:
            Product.query.delete()
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error clearing products: {e}")
            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # BILL MANAGEMENT
    # ---------------------------------------------------------

    def create_bill(self, bill_data: Dict[str, Any]) -> int:
        """Create a new bill"""
        try:
            # Check bill reset setting
            # In SQLAlchemy, we query the Settings model
            setting = Settings.query.get("bill_reset_daily")
            reset_daily = (setting.value == "true") if setting else True

            next_bill_no = 1
            if reset_daily:
                # Get max bill_no for today
                # Postgres 'date' function on timestamp works, but func.date() is safer
                today = date.today()
                max_bill = (
                    db.session.query(func.max(Bill.bill_no))
                    .filter(func.date(Bill.created_at) == today)
                    .scalar()
                )
                if max_bill:
                    next_bill_no = max_bill + 1
            else:
                max_bill = db.session.query(func.max(Bill.bill_no)).scalar()
                if max_bill:
                    next_bill_no = max_bill + 1

            # Create Items JSON
            # Enrich items logic mirrored from sqlite_db_service
            enriched_items = []
            for item in bill_data["items"]:
                # Optimizable: Bulk fetch products?
                # For compatibility, keeping loop or doing single query
                p = Product.query.get(item["product_id"])
                enriched_item = {
                    "product_id": item["product_id"],
                    "name": p.name if p else "Unknown Product",
                    "price": item["price"],
                    "quantity": item["quantity"],
                }
                enriched_items.append(enriched_item)

                # Inventory Deduction Integration
                # Find linked inventory item and deduct stock
                inv_item = Inventory.query.filter_by(product_id=item["product_id"]).first()
                if inv_item:
                    # Deduct stock
                    inv_item.stock -= item["quantity"]
                    # inv_item.updated_at = func.now() # SqlAlchemy handles onupdate usually, but explicit is fine if func imported

            new_bill = Bill(
                bill_no=next_bill_no,
                customer_name=bill_data.get("customer_name", ""),
                total_amount=float(bill_data["total_amount"]),
                payment_method=bill_data.get("payment_method", "CASH"),
                items=json.dumps(enriched_items),
                status="CONFIRMED",
                order_type=bill_data.get("order_type", "dine-in"),
                table_no=bill_data.get("table_no", ""),
                created_at=datetime.now(),
            )

            db.session.add(new_bill)
            db.session.commit()
            return next_bill_no

        except Exception as e:
            print(f"Error creating bill: {e}")
            db.session.rollback()
            return 0  # Error indicator

    def get_bill(self, bill_no: int) -> Optional[Dict[str, Any]]:
        """Get a specific bill by number for today"""
        try:
            today = date.today()
            # Assuming 'bill_no' is only unique per day if reset_daily is true.
            # So strict get_bill(bill_no) implies getting TODAY's bill with that number.
            bill = Bill.query.filter(
                Bill.bill_no == bill_no, func.date(Bill.created_at) == today
            ).first()

            if bill:
                return self._bill_to_dict(bill)
            return None
        except Exception as e:
            print(f"Error getting bill: {e}")
            return None

    def get_todays_bills(self, limit: int = None, offset: int = None) -> List[Dict[str, Any]]:
        """Get all bills for today with optional pagination"""
        try:
            today = date.today()
            query = Bill.query.filter(
                func.date(Bill.created_at) == today,
                func.trim(Bill.status) != "CANCELLED",
            ).order_by(Bill.bill_no.asc())

            if limit is not None:
                query = query.limit(limit)
            if offset is not None:
                query = query.offset(offset)

            bills = query.all()
            return [self._bill_to_dict(b) for b in bills]
        except Exception as e:
            print(f"Error getting today's bills: {e}")
            return []

    def get_todays_bills_count(self) -> int:
        """Get total count of bills for today"""
        try:
            today = date.today()
            return Bill.query.filter(
                func.date(Bill.created_at) == today,
                func.trim(Bill.status) != "CANCELLED",
            ).count()
        except Exception:
            return 0

    def get_monthly_bills(self, month: int, year: int) -> List[Dict[str, Any]]:
        """Get all bills for a specific month and year"""
        try:
            # Extract month/year from created_at in Postgres
            bills = (
                Bill.query.filter(
                    func.extract("month", Bill.created_at) == month,
                    func.extract("year", Bill.created_at) == year,
                    func.trim(Bill.status) != "CANCELLED",
                )
                .order_by(Bill.created_at.asc())
                .all()
            )

            return [self._bill_to_dict(b) for b in bills]
        except Exception as e:
            print(f"Error getting monthly bills: {e}")
            return []

    def get_bills_by_date(self, date_str: str) -> List[Dict[str, Any]]:
        """Get all bills for a specific date (YYYY-MM-DD) including cancelled"""
        try:
            # date_str is expected YYYY-MM-DD
            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            bills = (
                Bill.query.filter(
                    func.date(Bill.created_at) == target_date,
                )
                .order_by(Bill.created_at.asc())
                .all()
            )

            return [self._bill_to_dict(b) for b in bills]
        except Exception as e:
            print(f"Error getting bills by date: {e}")
            return []

    def get_bills_by_date_range(self, start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """Get bills in date range including cancelled"""
        try:
            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()

            bills = (
                Bill.query.filter(
                    func.date(Bill.created_at) >= s_date,
                    func.date(Bill.created_at) <= e_date,
                )
                .order_by(Bill.created_at.asc())
                .all()
            )

            return [self._bill_to_dict(b) for b in bills]
        except Exception as e:
            print(f"Error getting bills range: {e}")
            return []

    def get_all_bills(self) -> List[Dict[str, Any]]:
        """Get all bills"""
        try:
            bills = (
                Bill.query.filter(func.trim(Bill.status) != "CANCELLED")
                .order_by(Bill.created_at.desc())
                .all()
            )
            return [self._bill_to_dict(b) for b in bills]
        except Exception as e:
            return []

    def get_all_bills_management(
        self, limit: int = None, offset: int = None
    ) -> List[Dict[str, Any]]:
        """Get ALL bills including cancelled with optional pagination"""
        try:
            query = Bill.query.order_by(Bill.created_at.desc())

            if limit is not None:
                query = query.limit(limit)
            if offset is not None:
                query = query.offset(offset)

            bills = query.all()
            return [self._bill_to_dict(b) for b in bills]
        except Exception:
            return []

    def get_all_bills_management_count(self) -> int:
        """Get count of ALL bills for management"""
        try:
            return Bill.query.count()
        except Exception:
            return 0

    def cancel_bill(self, bill_no: int) -> bool:
        """Cancel a bill"""
        try:
            # Find the bill (latest one with this no? or today's?)
            # Assuming user cancels recent bills usually.
            # Ideally should pass ID, but sticking to bill_no interface.
            # We search for the bill with this number created TODAY.
            today = date.today()
            bill = Bill.query.filter(
                Bill.bill_no == bill_no, func.date(Bill.created_at) == today
            ).first()

            if bill:
                bill.status = "CANCELLED"
                bill.updated_at = datetime.now()

                # Restore inventory stock
                try:
                    items = json.loads(bill.items)
                    for item in items:
                        inv_item = Inventory.query.filter_by(product_id=item["product_id"]).first()
                        if inv_item:
                            inv_item.stock += item["quantity"]
                except Exception as eval_err:
                    print(f"Error restoring inventory for cancelled bill: {eval_err}")

                db.session.commit()
                return True
            return False
        except Exception as e:
            print(f"Error cancelling bill: {e}")
            db.session.rollback()
            return False

    def update_bill(self, bill_no: int, bill_data: Dict[str, Any]) -> bool:
        """Update bill"""
        try:
            today = date.today()
            bill = Bill.query.filter(
                Bill.bill_no == bill_no,
                func.date(Bill.created_at) == today,
                func.trim(Bill.status) != "CANCELLED",
            ).first()

            if not bill:
                return False

            # Enrich items again
            enriched_items = []
            for item in bill_data["items"]:
                p = Product.query.get(item["product_id"])
                enriched_item = {
                    "product_id": item["product_id"],
                    "name": p.name if p else "Unknown Product",
                    "price": item["price"],
                    "quantity": item["quantity"],
                }
                enriched_items.append(enriched_item)

            # Adjust inventory stock
            try:
                # 1. Restore stock from old items
                old_items = json.loads(bill.items)
                for old_item in old_items:
                    inv_item = Inventory.query.filter_by(product_id=old_item["product_id"]).first()
                    if inv_item:
                        inv_item.stock += old_item["quantity"]

                # 2. Deduct stock for new items
                for new_item in bill_data["items"]:
                    inv_item = Inventory.query.filter_by(product_id=new_item["product_id"]).first()
                    if inv_item:
                        inv_item.stock -= new_item["quantity"]
            except Exception as eval_err:
                print(f"Error adjusting inventory for updated bill: {eval_err}")

            bill.customer_name = bill_data.get("customer_name", "")
            bill.total_amount = float(bill_data["total_amount"])
            bill.items = json.dumps(enriched_items)
            bill.order_type = bill_data.get("order_type", bill.order_type)
            bill.table_no = bill_data.get("table_no", bill.table_no)
            bill.updated_at = datetime.now()

            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating bill: {e}")
            db.session.rollback()
            return False

    def clear_all_bills(self):
        """Clear all bills"""
        try:
            Bill.query.delete()
            db.session.commit()
            return True
        except Exception as e:
            db.session.rollback()
            return False

    def _bill_to_dict(self, bill: Bill) -> Dict[str, Any]:
        """Helper to convert Bill model to dict"""
        return {
            "id": bill.id,
            "bill_no": bill.bill_no,
            "customer_name": bill.customer_name,
            "total_amount": bill.total_amount,
            "today_token": bill.today_token,
            "payment_method": bill.payment_method,
            "items": json.loads(bill.items),  # Deserialize JSON
            "status": bill.status,
            "order_type": bill.order_type,
            "table_no": bill.table_no,
            "created_at": str(bill.created_at),
            "updated_at": str(bill.updated_at),
        }

    # ---------------------------------------------------------
    # CATEGORY MANAGEMENT
    # ---------------------------------------------------------

    def get_all_categories(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        query = Category.query
        if not include_inactive:
            query = query.filter(Category.active == True)

        cats = query.order_by(Category.display_order, Category.name).all()

        result = []
        for c in cats:
            # Count products
            count = len(c.products)
            c_dict = {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "active": c.active,
                "display_order": getattr(c, "display_order", 0),
                "created_at": str(c.created_at),
                "updated_at": str(c.updated_at),
                "product_count": count,
                "is_used": count > 0,  # Simple check
                "group_id": c.group_id,
                "group_name": c.group.name if c.group else None,
            }
            result.append(c_dict)
        return result

    def get_category(self, category_id: int) -> Optional[Dict[str, Any]]:
        c = Category.query.get(category_id)
        if c:
            return {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "active": c.active,
                "group_id": c.group_id,
                "group_name": c.group.name if c.group else None,
            }
        return None

    def get_category_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        c = Category.query.filter(func.lower(Category.name) == func.lower(name)).first()
        if c:
            return {
                "id": c.id,
                "name": c.name,
                "description": c.description,
                "active": c.active,
                "group_id": c.group_id,
                "group_name": c.group.name if c.group else None,
            }
        return None

    def create_category(self, data: Dict[str, Any]) -> Optional[int]:
        try:
            new_cat = Category(
                name=data["name"],
                description=data.get("description", ""),
                active=bool(data.get("active", True)),
                group_id=data.get("group_id"),
            )
            db.session.add(new_cat)
            db.session.commit()
            return new_cat.id
        except Exception:
            db.session.rollback()
            return None

    def update_category(self, category_id: int, data: Dict[str, Any]) -> bool:
        try:
            c = Category.query.get(category_id)
            if not c:
                return False

            if "name" in data:
                c.name = data["name"]
            if "description" in data:
                c.description = data["description"]
            if "active" in data:
                c.active = bool(data["active"])
            if "group_id" in data:
                c.group_id = data["group_id"]

            c.updated_at = datetime.now()
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # ITEM GROUP MANAGEMENT
    # ---------------------------------------------------------

    def get_all_groups(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        query = ItemGroup.query.filter(ItemGroup.deleted_at == None)
        if not include_inactive:
            query = query.filter(ItemGroup.is_active == True)

        groups = query.order_by(ItemGroup.display_order, ItemGroup.name).all()
        result = []
        for g in groups:
            # Count categories linked to this group
            categories_count = Category.query.filter(Category.group_id == g.id).count()
            result.append(
                {
                    "id": g.id,
                    "organization_id": g.organization_id,
                    "name": g.name,
                    "description": g.description,
                    "display_order": g.display_order,
                    "color": g.color,
                    "icon": g.icon,
                    "is_active": g.is_active,
                    "created_at": str(g.created_at),
                    "updated_at": str(g.updated_at),
                    "categories_count": categories_count,
                }
            )
        return result

    def get_group(self, group_id: int) -> Optional[Dict[str, Any]]:
        g = ItemGroup.query.filter(ItemGroup.id == group_id, ItemGroup.deleted_at == None).first()
        if g:
            categories_count = Category.query.filter(Category.group_id == g.id).count()
            return {
                "id": g.id,
                "organization_id": g.organization_id,
                "name": g.name,
                "description": g.description,
                "display_order": g.display_order,
                "color": g.color,
                "icon": g.icon,
                "is_active": g.is_active,
                "created_at": str(g.created_at),
                "updated_at": str(g.updated_at),
                "categories_count": categories_count,
            }
        return None

    def get_group_by_name(
        self, name: str, organization_id: str = "default"
    ) -> Optional[Dict[str, Any]]:
        g = ItemGroup.query.filter(
            func.lower(ItemGroup.name) == func.lower(name),
            ItemGroup.organization_id == organization_id,
            ItemGroup.deleted_at == None,
        ).first()
        if g:
            return {
                "id": g.id,
                "name": g.name,
                "organization_id": g.organization_id,
            }
        return None

    def create_group(self, data: Dict[str, Any]) -> Optional[int]:
        try:
            new_group = ItemGroup(
                organization_id=data.get("organization_id", "default"),
                name=data["name"],
                description=data.get("description", ""),
                display_order=data.get("display_order", 0),
                color=data.get("color", ""),
                icon=data.get("icon", ""),
                is_active=bool(data.get("is_active", True)),
            )
            db.session.add(new_group)
            db.session.commit()
            return new_group.id
        except Exception:
            db.session.rollback()
            return None

    def update_group(self, group_id: int, data: Dict[str, Any]) -> bool:
        try:
            g = ItemGroup.query.filter(
                ItemGroup.id == group_id, ItemGroup.deleted_at == None
            ).first()
            if not g:
                return False

            if "name" in data:
                g.name = data["name"]
            if "description" in data:
                g.description = data["description"]
            if "display_order" in data:
                g.display_order = data["display_order"]
            if "color" in data:
                g.color = data["color"]
            if "icon" in data:
                g.icon = data["icon"]
            if "is_active" in data:
                g.is_active = bool(data["is_active"])

            g.updated_at = datetime.now()
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            return False

    def delete_group(self, group_id: int) -> bool:
        try:
            g = ItemGroup.query.filter(
                ItemGroup.id == group_id, ItemGroup.deleted_at == None
            ).first()
            if g:
                g.deleted_at = datetime.now()
                g.is_active = False
                db.session.commit()
                return True
            return False
        except Exception:
            db.session.rollback()
            return False

    def move_categories(self, source_group_id: int, target_group_id: int) -> bool:
        try:
            categories = Category.query.filter(Category.group_id == source_group_id).all()
            for c in categories:
                c.group_id = target_group_id
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            return False

    def remove_group_assignment(self, group_id: int) -> bool:
        try:
            categories = Category.query.filter(Category.group_id == group_id).all()
            for c in categories:
                c.group_id = None
            db.session.commit()
            return True
        except Exception:
            db.session.rollback()
            return False

    def is_category_used(self, category_id: int) -> Dict[str, Any]:
        """Check usage"""
        c = Category.query.get(category_id)
        if not c:
            return {"used": False, "reason": "Category not found"}

        # Check products
        if c.products:
            return {"used": True, "reason": f"linked to {len(c.products)} product(s)"}

        # Check bills? (Complex text search on JSON)
        # Mirroring logic: check products in this category, then check bills containing those products
        # For Postgres, we can do JSONB or text search, but 'items' is Text.
        # We can implement if strictly needed, but for now assuming product link is sufficient
        # or relying on same logic as SQLite service if we want full parity.
        return {"used": False, "reason": "No usage found"}

    def delete_category(self, category_id: int) -> bool:
        try:
            c = Category.query.get(category_id)
            if c:
                db.session.delete(c)
                db.session.commit()
                return True
            return False
        except Exception:
            db.session.rollback()
            return False

            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # INVENTORY MANAGEMENT
    # ---------------------------------------------------------

    def get_all_inventory(self) -> List[Dict[str, Any]]:
        """Get all inventory items with status"""
        items = Inventory.query.order_by(Inventory.name).all()
        result = []
        for i in items:
            status = "In Stock"
            if i.stock <= 0:
                status = "Out of Stock"
            elif i.stock <= i.alert_threshold:
                status = "Low Stock"

            # Ensure max_stock_history is at least 10 or current stock
            max_hist = i.max_stock_history if i.max_stock_history else 10.0
            if i.stock > max_hist:
                max_hist = i.stock

            product_active = True
            if i.product:
                product_active = bool(i.product.active)

            is_locked = bool(i.type == "DIRECT_SALE" and i.product_id and not product_active)

            result.append(
                {
                    "id": i.id,
                    "name": i.name,
                    "type": i.type,
                    "unit": i.unit,
                    "stock": i.stock,
                    "unit_price": i.unit_price,
                    "alert_threshold": i.alert_threshold,
                    "max_stock_history": max_hist,
                    "product_id": i.product_id,
                    "product_name": i.product.name if i.product else None,
                    "status": status,
                    "product_status": "inactive" if not product_active else "active",
                    "product_active": product_active,
                    "is_locked": is_locked,
                    "updated_at": str(i.updated_at),
                }
            )
        return result

    def get_low_stock_products(self) -> List[Dict[str, Any]]:
        """Get only low stock or out of stock items"""
        # Filter where stock <= alert_threshold
        items = Inventory.query.filter(Inventory.stock <= Inventory.alert_threshold).all()
        result = []
        for i in items:
            # Skip inactive products
            if i.type == "DIRECT_SALE" and i.product and not i.product.active:
                continue

            status = "Low Stock"
            if i.stock <= 0:
                status = "Out of Stock"

            result.append(
                {
                    "id": i.id,
                    "name": i.name,
                    "type": i.type,
                    "stock": i.stock,
                    "alert_threshold": i.alert_threshold,
                    "unit": i.unit,
                    "status": status,
                    "product_id": i.product_id,
                }
            )
        return result

    def get_inventory_item(self, item_id: int) -> Optional[Dict[str, Any]]:
        i = Inventory.query.get(item_id)
        if i:
            max_hist = i.max_stock_history if i.max_stock_history else 10.0
            if i.stock > max_hist:
                max_hist = i.stock

            product_active = True
            if i.product:
                product_active = bool(i.product.active)

            is_locked = bool(i.type == "DIRECT_SALE" and i.product_id and not product_active)

            return {
                "id": i.id,
                "name": i.name,
                "type": i.type,
                "unit": i.unit,
                "stock": i.stock,
                "unit_price": i.unit_price,
                "alert_threshold": i.alert_threshold,
                "max_stock_history": max_hist,
                "product_id": i.product_id,
                "product_status": "inactive" if not product_active else "active",
                "product_active": product_active,
                "is_locked": is_locked,
                "updated_at": str(i.updated_at),
            }
        return None

    def create_inventory_item(self, data: Dict[str, Any]) -> Optional[int]:
        try:
            # Check if product is already linked?
            if data.get("product_id"):
                existing = Inventory.query.filter_by(product_id=data["product_id"]).first()
                if existing:
                    return None  # Product already linked

            item_name = data["name"]
            if data.get("product_id"):
                product = Product.query.get(data["product_id"])
                if product:
                    if not product.active:
                        return None
                    item_name = product.name

            initial_stock = float(data.get("stock", 0))

            new_item = Inventory(
                name=item_name,
                type=data["type"],
                unit=data["unit"],
                stock=initial_stock,
                unit_price=float(data.get("unit_price", 0.0)),
                alert_threshold=float(data.get("alert_threshold", 0)),
                product_id=data.get("product_id"),
                max_stock_history=max(initial_stock, 10.0),
            )
            db.session.add(new_item)
            db.session.commit()
            return new_item.id
        except Exception as e:
            print(f"Error creating inventory: {e}")
            db.session.rollback()
            return None

    def update_inventory(self, item_id: int, data: Dict[str, Any]) -> bool:
        try:
            i = Inventory.query.get(item_id)
            if not i:
                return False
            if i.type == "DIRECT_SALE" and i.product_id and i.product and not i.product.active:
                return False

            if "name" in data:
                i.name = data["name"]
            if "type" in data:
                i.type = data["type"]
            if "unit" in data:
                i.unit = data["unit"]

            if "stock" in data:
                new_stock = float(data["stock"])
                i.stock = new_stock
                # Update history
                if new_stock > i.max_stock_history:
                    i.max_stock_history = new_stock

            if "unit_price" in data:
                i.unit_price = float(data["unit_price"])

            if "alert_threshold" in data:
                i.alert_threshold = float(data["alert_threshold"])
            if "product_id" in data:
                i.product_id = data["product_id"]

            i.updated_at = datetime.now()
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating inventory: {e}")
            db.session.rollback()
            return False

    def adjust_inventory_stock(self, item_id: int, adjustment: float) -> bool:
        try:
            i = Inventory.query.get(item_id)
            if not i:
                return False
            if i.type == "DIRECT_SALE" and i.product_id and i.product and not i.product.active:
                return False

            i.stock += adjustment

            # Update history
            cur_max = i.max_stock_history if i.max_stock_history else 10.0
            if i.stock > cur_max:
                i.max_stock_history = i.stock

            i.updated_at = datetime.now()
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error adjusting stock: {e}")
            db.session.rollback()
            return False

    def delete_inventory_item(self, item_id: int) -> bool:
        try:
            i = Inventory.query.get(item_id)
            if i:
                db.session.delete(i)
                db.session.commit()
                return True
            return False
        except Exception:
            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # SETTINGS MANAGEMENT
    # ---------------------------------------------------------

    def get_all_settings(self) -> Dict[str, Any]:
        """Get all settings"""
        settings = Settings.query.all()
        # Return flat dict as per interface
        # But SQLite service code snippet for get_all_settings was cut off.
        # Assuming it returns a dict of {key: value}
        return {s.key: s.value for s in settings}

    def update_settings_bulk(self, settings_list: List[Dict[str, Any]]) -> bool:
        """Update multiple settings"""
        try:
            # Check for favorites toggle logic transition
            show_all_toggle = next(
                (item for item in settings_list if item.get("key") == "show_all_as_favorite"), None
            )
            if show_all_toggle:
                new_val = str(show_all_toggle.get("value", "false")).lower()
                curr_setting = Settings.query.get("show_all_as_favorite")
                curr_val = str(curr_setting.value).lower() if curr_setting else "false"

                if new_val != curr_val:
                    if new_val == "true":
                        # Transition false -> true: backup favorites, make all items favorite
                        fav_products = Product.query.filter_by(favorite=True).all()
                        fav_ids = ",".join([p.product_id for p in fav_products])

                        prev_setting = Settings.query.get("previous_favorites")
                        if prev_setting:
                            prev_setting.value = fav_ids
                            prev_setting.updated_at = datetime.now()
                        else:
                            new_prev = Settings(
                                key="previous_favorites", value=fav_ids, group_name="app"
                            )
                            db.session.add(new_prev)

                        active_products = Product.query.filter_by(active=True).all()
                        for p in active_products:
                            p.favorite = True
                    else:
                        # Transition true -> false: restore favorites from backup
                        prev_setting = Settings.query.get("previous_favorites")
                        prev_fav_ids = (
                            prev_setting.value.split(",")
                            if (prev_setting and prev_setting.value)
                            else []
                        )

                        all_products = Product.query.all()
                        for p in all_products:
                            p.favorite = p.product_id in prev_fav_ids

            for item in settings_list:
                key = item.get("key")
                value = item.get("value")
                group_name = item.get("group_name")

                if key:
                    setting = Settings.query.get(key)
                    if setting:
                        setting.value = str(value)
                        if group_name:
                            setting.group_name = group_name
                        setting.updated_at = datetime.now()
                    else:
                        # Create if not exists
                        new_setting = Settings(
                            key=key, value=str(value), group_name=group_name or "app"
                        )
                        db.session.add(new_setting)

            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating settings: {e}")
            db.session.rollback()
            return False

    # ---------------------------------------------------------
    # EXPENSES MANAGEMENT
    # ---------------------------------------------------------

    def get_todays_expenses(self) -> List[Dict[str, Any]]:
        """Get all expenses for today"""
        try:
            from models import Expense

            today = date.today()
            expenses = (
                Expense.query.filter(func.date(Expense.date) == today)
                .order_by(Expense.created_at.desc())
                .all()
            )
            return [expense.to_dict() for expense in expenses]
        except Exception as e:
            print(f"Error getting today's expenses: {e}")
            return []

    def get_expenses_by_date(self, date_str: str) -> List[Dict[str, Any]]:
        """Get all expenses for a specific date (YYYY-MM-DD)"""
        try:
            from models import Expense

            target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
            expenses = (
                Expense.query.filter(func.date(Expense.date) == target_date)
                .order_by(Expense.created_at.desc())
                .all()
            )
            return [expense.to_dict() for expense in expenses]
        except Exception as e:
            print(f"Error getting expenses by date: {e}")
            return []

    def get_expenses_by_range(self, start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """Get expenses in date range (YYYY-MM-DD inclusive)"""
        try:
            from models import Expense

            s_date = datetime.strptime(start_date, "%Y-%m-%d").date()
            e_date = datetime.strptime(end_date, "%Y-%m-%d").date()
            expenses = (
                Expense.query.filter(
                    func.date(Expense.date) >= s_date, func.date(Expense.date) <= e_date
                )
                .order_by(Expense.date.asc())
                .all()
            )
            return [expense.to_dict() for expense in expenses]
        except Exception as e:
            print(f"Error getting expenses range: {e}")
            return []

    def update_categories_display_order(self, orders: List[Dict[str, Any]]) -> bool:
        """Bulk update categories display order."""
        try:
            for item in orders:
                cat_id = item.get("id")
                display_order = item.get("display_order", 0)
                cat = Category.query.get(cat_id)
                if cat:
                    cat.display_order = display_order
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating categories display order: {e}")
            db.session.rollback()
            return False

    def update_products_display_order(self, orders: List[Dict[str, Any]]) -> bool:
        """Bulk update products display order."""
        try:
            for item in orders:
                product_id = item.get("product_id")
                display_order = item.get("display_order", 0)
                product = Product.query.get(product_id)
                if product:
                    product.display_order = display_order
            db.session.commit()
            return True
        except Exception as e:
            print(f"Error updating products display order: {e}")
            db.session.rollback()
            return False
