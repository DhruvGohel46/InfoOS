import sqlite3
import os

db_path = r"c:\Users\admin\Documents\GitHub\Product_Sales_Mangment\backend\data\shop.db"
if not os.path.exists(db_path):
    print("DB not found")
else:
    try:
        conn = sqlite3.connect(db_path, timeout=5.0)
        conn.execute("UPDATE settings SET value='80mm' WHERE key='printer_width'")
        conn.commit()
        print("Updated setting to 80mm successfully.")
        res = conn.execute("SELECT * FROM settings WHERE key='printer_width'").fetchall()
        print(f"Current setting: {res}")
    except Exception as e:
        print(f"Error: {e}")
