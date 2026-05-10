from services.sqlite_db_service import SQLiteDatabaseService

db = SQLiteDatabaseService()
products = db.get_all_products(include_inactive=True)

print(f"{'ID':<15} | {'Name':<30} | {'Active'}")
print("-" * 60)
for p in products:
    print(f"{p['product_id']:<15} | {p['name']:<30} | {p['active']}")
