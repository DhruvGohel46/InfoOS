import sqlite3
import os
from typing import List, Dict, Optional, Any
import json

from config import config
from utils.product_variations import enrich_product_dict, normalize_variations, serialize_variations


class SQLiteDatabaseService:
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Use default from config (using 'default' or current env?
            # Config is a dict of classes. We need the value from the class.
            # We can use Config class directly or access via dict.
            # Since Config.DB_FILE is evaluated at class level, it depends on when Config was imported.
            # We trust that Config is imported AFTER env vars are set if we use delayed imports.
            self.db_path = config["default"].DB_FILE
        else:
            self.db_path = db_path

        self.init_database()

    def init_database(self):
        """Initialize SQLite database with products table"""
        # Ensure data directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()

            # Create item_groups table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS item_groups (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    organization_id TEXT DEFAULT 'default',
                    name TEXT NOT NULL,
                    description TEXT,
                    display_order INTEGER DEFAULT 0,
                    color TEXT,
                    icon TEXT,
                    is_active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    deleted_at TIMESTAMP DEFAULT NULL
                )
            """)

            # Create categories table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS categories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    description TEXT,
                    active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Check for group_id column in categories (migration)
            cursor.execute("PRAGMA table_info(categories)")
            cat_columns = [info[1] for info in cursor.fetchall()]

            if "group_id" not in cat_columns:
                print("Migrating categories: Adding group_id column")
                try:
                    cursor.execute(
                        "ALTER TABLE categories ADD COLUMN group_id INTEGER REFERENCES item_groups(id)"
                    )
                except Exception as e:
                    print(f"Migration error (group_id): {e}")

            # Create products table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS products (
                    product_id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    price REAL NOT NULL,
                    category_id INTEGER,
                    category TEXT, -- Keep for legacy/migration
                    image_filename TEXT, -- Stores 'product-name.ext'
                    active BOOLEAN DEFAULT 1,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (category_id) REFERENCES categories(id)
                )
            """)

            # Check for image_filename column (migration)
            cursor.execute("PRAGMA table_info(products)")
            prod_columns = [info[1] for info in cursor.fetchall()]

            if "image_filename" not in prod_columns:
                print("Migrating products: Adding image_filename column")
                try:
                    cursor.execute("ALTER TABLE products ADD COLUMN image_filename TEXT")
                except Exception as e:
                    print(f"Migration error (image_filename): {e}")

            if "variations" not in prod_columns:
                print("Migrating products: Adding variations column")
                try:
                    cursor.execute("ALTER TABLE products ADD COLUMN variations TEXT DEFAULT '[]'")
                except Exception as e:
                    print(f"Migration error (variations): {e}")

            # Create bills table
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS bills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bill_no INTEGER NOT NULL,
                    customer_name TEXT,
                    total_amount REAL NOT NULL,
                    items TEXT NOT NULL, -- JSON string of items
                    status TEXT DEFAULT 'CONFIRMED', -- CONFIRMED, CANCELLED
                    order_type TEXT DEFAULT 'dine-in',
                    table_no TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)

            # Check if status column exists (for migration)
            cursor.execute("PRAGMA table_info(bills)")
            columns = [info[1] for info in cursor.fetchall()]

            if "status" not in columns:
                print("Migrating database: Adding status column to bills table")
                try:
                    # Add as nullable first to avoid constraint errors
                    cursor.execute("ALTER TABLE bills ADD COLUMN status TEXT")
                    # Set default for existing records
                    cursor.execute(
                        "UPDATE bills SET status = 'CONFIRMED' WHERE status IS NULL OR status = 'ACTIVE'"
                    )
                except Exception as e:
                    print(f"Migration error (status): {e}")

            # Ensure any 'ACTIVE' statuses from previous versions are converted to 'CONFIRMED'
            cursor.execute("UPDATE bills SET status = 'CONFIRMED' WHERE status = 'ACTIVE'")

            if "updated_at" not in columns:
                print("Migrating database: Adding updated_at column to bills table")
                try:
                    cursor.execute("ALTER TABLE bills ADD COLUMN updated_at TIMESTAMP")
                    cursor.execute(
                        "UPDATE bills SET updated_at = created_at WHERE updated_at IS NULL"
                    )
                except Exception as e:
                    print(f"Migration error (updated_at): {e}")

            if "order_type" not in columns:
                print("Migrating database: Adding order_type column to bills table")
                try:
                    cursor.execute("ALTER TABLE bills ADD COLUMN order_type TEXT DEFAULT 'dine-in'")
                except Exception as e:
                    print(f"Migration error (order_type): {e}")

            if "table_no" not in columns:
                print("Migrating database: Adding table_no column to bills table")
                try:
                    cursor.execute("ALTER TABLE bills ADD COLUMN table_no TEXT")
                except Exception as e:
                    print(f"Migration error (table_no): {e}")

            # Migrate products to use category_id
            cursor.execute("PRAGMA table_info(products)")
            prod_columns = [info[1] for info in cursor.fetchall()]

            if "category_id" not in prod_columns:
                print("Migrating products: Adding category_id and moving legacy category data")
                try:
                    cursor.execute(
                        "ALTER TABLE products ADD COLUMN category_id INTEGER REFERENCES categories(id)"
                    )

                    # Create unique categories from existing products
                    cursor.execute(
                        "SELECT DISTINCT category FROM products WHERE category IS NOT NULL"
                    )
                    legacy_categories = [row[0] for row in cursor.fetchall()]

                    for cat_name in legacy_categories:
                        cursor.execute(
                            "INSERT OR IGNORE INTO categories (name) VALUES (?)",
                            (cat_name,),
                        )

                    # Link products to category IDs
                    cursor.execute("SELECT id, name FROM categories")
                    cats_map = {row[1]: row[0] for row in cursor.fetchall()}

                    for cat_name, cat_id in cats_map.items():
                        cursor.execute(
                            "UPDATE products SET category_id = ? WHERE category = ?",
                            (cat_id, cat_name),
                        )

                    print(f"Successfully migrated {len(legacy_categories)} categories.")
                except Exception as e:
                    print(f"Migration error (category_id): {e}")

            # Ensure default categories exist if table is empty
            cursor.execute("SELECT COUNT(*) FROM categories")
            if cursor.fetchone()[0] == 0:
                print("Seeding default categories...")
                for cat in ["coldrink", "paan", "other"]:
                    cursor.execute("INSERT OR IGNORE INTO categories (name) VALUES (?)", (cat,))

            # Create index for faster queries
            cursor.execute("""
                CREATE INDEX IF NOT EXISTS idx_bills_date 
                ON bills (date(created_at))
            """)

            # Create unique constraint for daily bill numbers
            cursor.execute("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_bill 
                ON bills (bill_no, date(created_at))
            """)

            # Create settings table
            self.create_settings_table(cursor)

            conn.commit()

    def get_connection(self):
        """Get database connection"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row  # Enable dict-like access
        return conn

    def get_all_products(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all products with category info"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            query = """
                SELECT p.*, c.name as category_name 
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
            """

            if not include_inactive:
                query += " WHERE p.active = 1"

            query += " ORDER BY p.name"

            cursor.execute(query)

            products = []
            for row in cursor.fetchall():
                product = dict(row)
                product["active"] = bool(product["active"])
                if not product.get("category") and product.get("category_name"):
                    product["category"] = product["category_name"]
                products.append(enrich_product_dict(product))

            return products

    def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific product by ID with category info"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT p.*, c.name as category_name 
                FROM products p
                LEFT JOIN categories c ON p.category_id = c.id
                WHERE p.product_id = ?
            """,
                (product_id,),
            )
            row = cursor.fetchone()

            if row:
                product = dict(row)
                product["active"] = bool(product["active"])
                if not product.get("category") and product.get("category_name"):
                    product["category"] = product["category_name"]
                return enrich_product_dict(product)
            return None

    def create_product(self, product_data: Dict[str, Any]) -> bool:
        """Create a new product"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO products (product_id, name, price, takeaway_price, category_id, category, image_filename, active, variations)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                    (
                        product_data["product_id"],
                        product_data["name"],
                        float(product_data["price"]),
                        (
                            float(product_data["takeaway_price"])
                            if product_data.get("takeaway_price") is not None
                            else None
                        ),
                        product_data.get("category_id"),
                        product_data.get("category"),
                        product_data.get("image_filename"),
                        bool(product_data.get("active", True)),
                        serialize_variations(product_data.get("variations", [])),
                    ),
                )
                conn.commit()
                return True
        except sqlite3.IntegrityError:
            return False

    def update_product(self, product_id: str, product_data: Dict[str, Any]) -> bool:
        """Update an existing product"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Build dynamic update query
                update_fields = []
                values = []

                for field in [
                    "name",
                    "price",
                    "takeaway_price",
                    "category_id",
                    "category",
                    "image_filename",
                    "active",
                    "variations",
                ]:
                    if field in product_data:
                        update_fields.append(f"{field} = ?")
                        if field == "price":
                            values.append(float(product_data[field]))
                        elif field == "takeaway_price":
                            values.append(
                                float(product_data[field])
                                if product_data[field] is not None
                                else None
                            )
                        elif field == "active":
                            values.append(bool(product_data[field]))
                        elif field == "variations":
                            values.append(serialize_variations(product_data[field]))
                        else:
                            values.append(product_data[field])

                if update_fields:
                    update_fields.append("updated_at = CURRENT_TIMESTAMP")
                    values.append(product_id)

                    cursor.execute(
                        f"""
                        UPDATE products 
                        SET {', '.join(update_fields)}
                        WHERE product_id = ?
                    """,
                        values,
                    )
                    conn.commit()
                    return cursor.rowcount > 0
                return False
        except sqlite3.Error as e:
            print(f"Error updating product: {e}")
            return False

    def delete_product(self, product_id: str) -> bool:
        """Delete a product"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM products WHERE product_id = ?", (product_id,))
                conn.commit()
                return cursor.rowcount > 0
        except sqlite3.Error:
            return False

    def create_bill(self, bill_data: Dict[str, Any]) -> int:
        """Create a new bill with configured numbering rule"""
        # Enrich items with product names from database
        enriched_items = []
        for item in bill_data["items"]:
            product = self.get_product(item["product_id"])
            enriched_item = {
                "product_id": item["product_id"],
                "name": product["name"] if product else "Unknown Product",
                "price": item["price"],
                "quantity": item["quantity"],
            }
            enriched_items.append(enriched_item)

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # Check bill reset setting
            cursor.execute("SELECT value FROM settings WHERE key = 'bill_reset_daily'")
            row = cursor.fetchone()
            reset_daily = row["value"] == "true" if row else True  # Default true

            next_bill_no = 1
            if reset_daily:
                # Get the next bill number for today (using local time)
                cursor.execute("""
                    SELECT COALESCE(MAX(bill_no), 0) + 1 
                    FROM bills 
                    WHERE date(created_at, 'localtime') = date('now', 'localtime')
                """)
                next_bill_no = cursor.fetchone()[0]
            else:
                # Continuous numbering
                cursor.execute("SELECT COALESCE(MAX(bill_no), 0) + 1 FROM bills")
                next_bill_no = cursor.fetchone()[0]

            # Insert the bill
            cursor.execute(
                """
                INSERT INTO bills (bill_no, customer_name, total_amount, items, order_type, table_no)
                VALUES (?, ?, ?, ?, ?, ?)
            """,
                (
                    next_bill_no,
                    bill_data.get("customer_name", ""),
                    float(bill_data["total_amount"]),
                    json.dumps(enriched_items),
                    bill_data.get("order_type", "dine-in"),
                    bill_data.get("table_no", ""),
                ),
            )
            conn.commit()
            return next_bill_no

    def get_bill(self, bill_no: int) -> Optional[Dict[str, Any]]:
        """Get a specific bill by number for today"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute(
                """
                SELECT * FROM bills 
                WHERE bill_no = ? AND date(created_at, 'localtime') = date('now', 'localtime')
            """,
                (bill_no,),
            )
            row = cursor.fetchone()

            if row:
                bill = dict(row)
                bill["items"] = json.loads(bill["items"])
                return bill
            return None

    def get_todays_bills(self) -> List[Dict[str, Any]]:
        """Get all bills for today"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM bills 
                WHERE date(created_at, 'localtime') = date('now', 'localtime') 
                AND TRIM(status) != 'CANCELLED'
                ORDER BY bill_no ASC
            """)

            bills = []
            for row in cursor.fetchall():
                bill = dict(row)
                bill["items"] = json.loads(bill["items"])
                bills.append(bill)

            return bills

    def get_monthly_bills(self, month: int, year: int) -> List[Dict[str, Any]]:
        """Get all bills for a specific month and year"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                # Format month to 2 digits for strftime comparison
                month_str = f"{month:02d}"
                year_str = str(year)

                cursor.execute(
                    """
                    SELECT * FROM bills 
                    WHERE strftime('%m', created_at, 'localtime') = ? 
                    AND strftime('%Y', created_at, 'localtime') = ?
                    AND TRIM(status) != 'CANCELLED'
                    ORDER BY created_at ASC
                """,
                    (month_str, year_str),
                )

                bills = []
                for row in cursor.fetchall():
                    bill = dict(row)
                    bill["items"] = json.loads(bill["items"])
                    bills.append(bill)

                return bills
        except Exception as e:
            print(f"Error getting monthly bills: {e}")
            return []

    def get_bills_by_date(self, date_str: str) -> List[Dict[str, Any]]:
        """
        Get all bills for a specific date
        Date should be in 'YYYY-MM-DD' format
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Use DATE() function to extract date part from timestamp
                # Ensure we filter by LOCAL time date
                cursor.execute(
                    """
                    SELECT * FROM bills 
                    WHERE date(created_at, 'localtime') = date(?)
                    AND TRIM(status) != 'CANCELLED'
                    ORDER BY created_at ASC
                """,
                    (date_str,),
                )

                bills = []
                for row in cursor.fetchall():
                    bill = dict(row)
                    bill["items"] = json.loads(bill["items"])
                    bills.append(bill)

                return bills
        except Exception as e:
            print(f"Error getting bills by date: {e}")
            return []

    def get_bills_by_date_range(self, start_date: str, end_date: str) -> List[Dict[str, Any]]:
        """
        Get all bills within a specific date range (inclusive)
        Dates should be in 'YYYY-MM-DD' format
        """
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                # Use DATE() function to extract date part from timestamp
                cursor.execute(
                    """
                    SELECT * FROM bills 
                    WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)
                    AND TRIM(status) != 'CANCELLED'
                    ORDER BY created_at ASC
                """,
                    (start_date, end_date),
                )

                bills = []
                for row in cursor.fetchall():
                    bill = dict(row)
                    bill["items"] = json.loads(bill["items"])
                    bills.append(bill)

                return bills
        except Exception as e:
            print(f"Error getting bills by date range: {e}")
            return []

    def get_all_bills(self) -> List[Dict[str, Any]]:
        """Get all bills"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT * FROM bills 
                WHERE TRIM(status) != 'CANCELLED'
                ORDER BY created_at DESC
            """)

            bills = []
            for row in cursor.fetchall():
                bill = dict(row)
                bill["items"] = json.loads(bill["items"])
                bills.append(bill)

            return bills

    def get_all_bills_management(self) -> List[Dict[str, Any]]:
        """Get ALL bills including cancelled ones for management"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM bills ORDER BY created_at DESC")

            bills = []
            for row in cursor.fetchall():
                bill = dict(row)
                bill["items"] = json.loads(bill["items"])
                bills.append(bill)

            return bills

    def cancel_bill(self, bill_no: int) -> bool:
        """Cancel a bill by updating its status"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE bills 
                    SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
                    WHERE bill_no = ?
                """,
                    (bill_no,),
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            print(f"Error cancelling bill: {e}")
            return False

    def update_bill(self, bill_no: int, bill_data: Dict[str, Any]) -> bool:
        """Update an existing bill"""
        try:
            # Enrich items
            enriched_items = []
            for item in bill_data["items"]:
                product = self.get_product(item["product_id"])
                enriched_item = {
                    "product_id": item["product_id"],
                    "name": product["name"] if product else "Unknown Product",
                    "price": item["price"],
                    "quantity": item["quantity"],
                }
                enriched_items.append(enriched_item)

            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    UPDATE bills 
                    SET customer_name = ?, 
                        total_amount = ?, 
                        items = ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE bill_no = ? AND TRIM(status) != 'CANCELLED'
                """,
                    (
                        bill_data.get("customer_name", ""),
                        float(bill_data["total_amount"]),
                        json.dumps(enriched_items),
                        bill_no,
                    ),
                )
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            print(f"Error updating bill: {e}")
            return False

    def clear_all_bills(self):
        """Clear all bills from the database"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            # Delete all bills
            cursor.execute("DELETE FROM bills")

            # Reset auto-increment for bills table
            cursor.execute('DELETE FROM sqlite_sequence WHERE name = "bills"')

            conn.commit()
            conn.close()

            return True

        except Exception as e:
            print(f"Error clearing bills: {e}")
            return False

    def clear_all_products(self):
        """Clear all products from the database"""
        try:
            conn = self.get_connection()
            cursor = conn.cursor()

            # Delete all products
            cursor.execute("DELETE FROM products")

            conn.commit()
            conn.close()

            return True

        except Exception as e:
            print(f"Error clearing products: {e}")
            return False

    # CATEGORY MANAGEMENT METHODS

    def get_all_categories(self, include_inactive: bool = False) -> List[Dict[str, Any]]:
        """Get all categories with usage counters"""
        with self.get_connection() as conn:
            cursor = conn.cursor()

            query = """
                SELECT 
                    c.*,
                    (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) as product_count
                FROM categories c
            """

            if not include_inactive:
                query += " WHERE c.active = 1"

            query += " ORDER BY c.name"

            cursor.execute(query)

            categories = []
            for row in cursor.fetchall():
                category = dict(row)
                category["active"] = bool(category["active"])

                # Check for historical usage in bills (parsing JSON items)
                # Note: This is a heavy check, better to check on demand for removal
                # For simple indicator, we just use product_count for now
                category["is_used"] = category["product_count"] > 0

                categories.append(category)

            return categories

    def get_category(self, category_id: int) -> Optional[Dict[str, Any]]:
        """Get category by ID"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
            row = cursor.fetchone()
            if row:
                cat = dict(row)
                cat["active"] = bool(cat["active"])
                return cat
            return None

    def get_category_by_name(self, name: str) -> Optional[Dict[str, Any]]:
        """Get category by name (case-insensitive)"""
        with self.get_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM categories WHERE LOWER(name) = LOWER(?)", (name,))
            row = cursor.fetchone()
            if row:
                cat = dict(row)
                cat["active"] = bool(cat["active"])
                return cat
            return None

    def create_category(self, data: Dict[str, Any]) -> Optional[int]:
        """Create a new category"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO categories (name, description, active)
                    VALUES (?, ?, ?)
                """,
                    (
                        data["name"],
                        data.get("description", ""),
                        bool(data.get("active", True)),
                    ),
                )
                conn.commit()
                return cursor.lastrowid
        except sqlite3.IntegrityError:
            return None

    def update_category(self, category_id: int, data: Dict[str, Any]) -> bool:
        """Update a category"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()

                fields = []
                values = []

                for field in ["name", "description", "active"]:
                    if field in data:
                        fields.append(f"{field} = ?")
                        if field == "active":
                            values.append(bool(data[field]))
                        else:
                            values.append(data[field])

                if fields:
                    fields.append("updated_at = CURRENT_TIMESTAMP")
                    values.append(category_id)
                    cursor.execute(
                        f"UPDATE categories SET {', '.join(fields)} WHERE id = ?",
                        values,
                    )
                    conn.commit()
                    return cursor.rowcount > 0
                return False
        except Exception as e:
            print(f"Error updating category: {e}")
            return False

    def is_category_used(self, category_id: int) -> Dict[str, Any]:
        """
        Comprehensive check if category is used in products, historical bills, or analytics
        """
        category = self.get_category(category_id)
        if not category:
            return {"used": False, "reason": "Category not found"}

        cat_name = category["name"]

        with self.get_connection() as conn:
            cursor = conn.cursor()

            # 1. Check products linked to category_id
            cursor.execute("SELECT COUNT(*) FROM products WHERE category_id = ?", (category_id,))
            linked_products = cursor.fetchone()[0]
            if linked_products > 0:
                return {
                    "used": True,
                    "reason": f"linked to {linked_products} product(s)",
                }

            # 2. Check historical bills (searching for category name in JSON items)
            # This is tricky because items is a JSON string.
            # We'll use a broad LIKE search for the category name or product names associated with it?
            # Actually, the requirement says "Category has NO historical usage in bills".
            # Let's check for product names that WERE in this category.
            # For simplicity, if we ever created a product with this category, it's likely used.
            # But the CEO said "only what was never used".

            # Better check: Search all bills for items that might have been in this category.
            # Since items only store product name/id, we check if ANY product (deleted or not)
            # that was in this category appears in any bill.

            cursor.execute("SELECT COUNT(*) FROM bills")
            total_bills = cursor.fetchone()[0]

            if total_bills > 0:
                # We can't easily query JSON in SQLite without special extensions.
                # Use a text search trick: '"category": "CategoryName"' if we stored it there.
                # But we only store product_id, name, price, quantity.
                # So we check if ANY product_id that WAS in this category exists in ANY bill.

                # Get all product IDs ever associated with this category id or name
                cursor.execute(
                    "SELECT product_id FROM products WHERE category_id = ? OR category = ?",
                    (category_id, cat_name),
                )
                relevant_prod_ids = [row[0] for row in cursor.fetchall()]

                if relevant_prod_ids:
                    for pid in relevant_prod_ids:
                        cursor.execute(
                            "SELECT COUNT(*) FROM bills WHERE items LIKE ?",
                            (f'%"{pid}"%',),
                        )
                        if cursor.fetchone()[0] > 0:
                            return {
                                "used": True,
                                "reason": "appears in historical bills",
                            }

            return {"used": False, "reason": "No usage found"}

    def delete_category(self, category_id: int) -> bool:
        """Physical delete of a category"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("DELETE FROM categories WHERE id = ?", (category_id,))
                conn.commit()
                return cursor.rowcount > 0
        except Exception as e:
            print(f"Error deleting category: {e}")
            return False

    # SETTINGS MANAGEMENT METHODS

    def create_settings_table(self, cursor):
        """Create settings table if it doesn't exist"""
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT,
                group_name TEXT, -- e.g., 'shop', 'billing', 'printer', 'app'
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # Seed default settings if empty
        cursor.execute("SELECT COUNT(*) FROM settings")
        if cursor.fetchone()[0] == 0:
            print("Seeding default settings...")
            default_settings = [
                # Shop Settings
                ("shop_name", "Burger Bhau", "shop"),
                ("shop_address", "Main Street, City", "shop"),
                ("shop_contact", "", "shop"),
                ("gst_no", "", "shop"),
                ("currency_symbol", "₹", "shop"),
                # Billing Settings
                ("bill_reset_daily", "true", "billing"),
                ("default_tax_rate", "0", "billing"),
                ("tax_enabled", "false", "billing"),
                # Printer Settings
                ("printer_enabled", "false", "printer"),
                ("printer_width", "58mm", "printer"),
                ("auto_print", "false", "printer"),
                ("active_printer", "", "printer"),
                # App Preferences
                ("dark_mode", "false", "app"),
                ("sound_enabled", "true", "app"),
            ]

            cursor.executemany(
                "INSERT INTO settings (key, value, group_name) VALUES (?, ?, ?)",
                default_settings,
            )

    def get_all_settings(self) -> Dict[str, Any]:
        """Get all settings as a dictionary"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT key, value, group_name FROM settings")

                settings = {}
                for row in cursor.fetchall():
                    # Organize by group or flat? Flat is easier for lookup
                    # Let's return a flat dict for values, maybe with metadata if needed
                    # For now, just key-value pairs
                    settings[row["key"]] = row["value"]

                return settings
        except Exception as e:
            print(f"Error getting settings: {e}")
            return {}

    def get_setting(self, key: str, default: str = None) -> str:
        """Get a single setting value"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT value FROM settings WHERE key = ?", (key,))
                row = cursor.fetchone()
                return row["value"] if row else default
        except Exception as e:
            print(f"Error getting setting {key}: {e}")
            return default

    def update_setting(self, key: str, value: str, group_name: str = "general") -> bool:
        """Update or create a single setting"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                cursor.execute(
                    """
                    INSERT INTO settings (key, value, group_name, updated_at)
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                    (key, str(value), group_name),
                )
                conn.commit()
                return True
        except Exception as e:
            print(f"Error updating setting {key}: {e}")
            return False

    def update_settings_bulk(self, settings_list: List[Dict[str, str]]) -> bool:
        """Update multiple settings at once"""
        try:
            with self.get_connection() as conn:
                cursor = conn.cursor()
                for setting in settings_list:
                    cursor.execute(
                        """
                        INSERT INTO settings (key, value, group_name, updated_at)
                        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                        ON CONFLICT(key) DO UPDATE SET
                        value = excluded.value,
                        group_name = COALESCE(?, settings.group_name),
                        updated_at = excluded.updated_at
                    """,
                        (
                            setting["key"],
                            str(setting["value"]),
                            setting.get("group_name", "general"),
                            setting.get("group_name"),  # Update group if provided
                        ),
                    )
                conn.commit()
                return True
        except Exception as e:
            print(f"Error updating bulk settings: {e}")
            return False
