#!/usr/bin/env python3
"""
Simple database initialization script for SQLite
"""

from services.sqlite_db_service import SQLiteDatabaseService


def init_database():
    """Initialize SQLite database with sample data"""
    print("🔄 Initializing SQLite database...")

    # Initialize database
    db = SQLiteDatabaseService()

    # Create sample products
    sample_products = [
        {
            "product_id": "COLD001",
            "name": "Coca Cola",
            "price": 25.0,
            "category": "coldrink",
            "active": True,
        },
        {
            "product_id": "COLD002",
            "name": "Pepsi",
            "price": 25.0,
            "category": "coldrink",
            "active": True,
        },
        {
            "product_id": "PAAN001",
            "name": "Meetha Paan",
            "price": 15.0,
            "category": "paan",
            "active": True,
        },
        {
            "product_id": "OTHE001",
            "name": "Samosa",
            "price": 20.0,
            "category": "other",
            "active": True,
        },
    ]

    created_count = 0
    for product in sample_products:
        if db.create_product(product):
            created_count += 1
            print(f"✅ Created: {product['product_id']} - {product['name']}")
        else:
            print(f"⚠️  Skipped: {product['product_id']} (already exists)")

    print(f"\n🎉 Database initialization complete!")
    print(f"✅ Created {created_count} sample products")
    print(f"📁 Database: data/products.db")


if __name__ == "__main__":
    init_database()
