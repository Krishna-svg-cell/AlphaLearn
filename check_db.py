import sqlite3
import os

db_path = os.path.join('instance', 'alphalearn.sqlite')
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
else:
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA table_info(user)")
    columns = cursor.fetchall()
    print("User table columns:")
    for col in columns:
        print(col)
        
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = cursor.fetchall()
    print("\nAll tables:")
    for t in tables:
        print(t)
    conn.close()
