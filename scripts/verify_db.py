import sqlite3, sys, os, json
db = os.environ.get("DB", "output.db")
print("[CHECK] Opening", db)
con = sqlite3.connect(db)
con.row_factory = sqlite3.Row
cur = con.cursor()
print("[CHECK] PRAGMA integrity_check:", cur.execute("PRAGMA integrity_check").fetchone()[0])
print("[CHECK] Databases:", [r["name"] for r in cur.execute("PRAGMA database_list")])
print("[CHECK] Tables:", [r["name"] for r in cur.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY 1")])
try:
    cur.execute("SELECT * FROM calendar LIMIT 1")
    print("[CHECK] calendar: OK")
except Exception as e:
    print("[CHECK] calendar: MISSING or error:", e)
try:
    cur.execute("SELECT * FROM calendar_range LIMIT 1")
    print("[CHECK] calendar_range: OK")
except Exception as e:
    print("[CHECK] calendar_range: MISSING or error:", e)
