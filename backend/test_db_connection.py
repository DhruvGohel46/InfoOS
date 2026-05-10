import psycopg2
from psycopg2 import OperationalError


def test_connection(dbname, user, password, host, port):
    try:
        conn = psycopg2.connect(dbname=dbname, user=user, password=password, host=host, port=port)
        print(f"SUCCESS: Connected to {dbname} as {user}")
        conn.close()
        return True
    except OperationalError as e:
        print(f"FAILED: Could not connect to {dbname} as {user}")
        print(e)
        return False


if __name__ == "__main__":
    print("Testing connection to 'rebill_db'...")
    if not test_connection("rebill_db", "postgres", "dharmik", "localhost", "5432"):
        print("\nTesting connection to 'postgres' (default DB)...")
        if test_connection("postgres", "postgres", "dharmik", "localhost", "5432"):
            print("\nAuth successful! 'rebill_db' might not exist.")
            # Try creating it?
            try:
                conn = psycopg2.connect(
                    dbname="postgres",
                    user="postgres",
                    password="dharmik",
                    host="localhost",
                    port="5432",
                )
                conn.autocommit = True
                cursor = conn.cursor()
                cursor.execute("CREATE DATABASE rebill_db")
                print("Created 'rebill_db' successfully.")
                conn.close()
            except Exception as e:
                print(f"Failed to create 'rebill_db': {e}")
