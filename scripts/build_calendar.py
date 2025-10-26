#!/usr/bin/env python3
import sys, sqlite3, json, re

def parse_args(argv):
    db = argv[1] if len(argv)>1 else "output.db"
    lst = argv[2] if len(argv)>2 else "static/custom/calendar_columns.txt"
    base = "/output"
    for i,a in enumerate(argv):
        if a == "--base-path" and i+1 < len(argv): base = argv[i+1]
    return db, lst, base

DB_PATH, LIST_PATH, BASE = parse_args(sys.argv)
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

def q(sql, params=()): c.execute(sql, params); return c.fetchall()
def execsql(sql, params=()): c.execute(sql, params)

def read_list(path):
    cols = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or "." not in s: continue
            t, col = s.split(".", 1)
            cols.append((t.strip(), col.strip()))
    return cols

def detect_pk_cols(table):
    info = q(f'pragma table_info("{table}")')
    pks = [r["name"] for r in info if r["pk"]]
    if not pks:
        try:
            q(f'select rowid from "{table}" limit 1')
            pks = ["rowid"]
        except Exception:
            pks = []
    return pks

def day_from(ts):
    if ts is None: return None
    s = str(ts)
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m: return m.group(1)
    m = re.match(r"^(\d{2})-(\d{2})-(\d{2})", s)
    if m: return f"20{m.group(3)}-{m.group(2)}-{m.group(1)}"
    try:
        r = q("select date(?) d", (s,))
        return r[0]["d"]
    except Exception:
        return None

execsql("drop table if exists calendar")
execsql(\"\"\"create table calendar (
  giorno  text not null,
  ts      text not null,
  tab     text not null,
  col     text not null,
  pk_json text not null,
  link    text not null
)\"\"\")

total = 0
for table, col in read_list(LIST_PATH):
    names = [r["name"] for r in q(f'pragma table_info("{table}")')]
    if col not in names:
        print(f"[skip] {table}.{col} non esiste"); continue
    pk_cols = detect_pk_cols(table)
    if not pk_cols:
        print(f"[skip] {table}: nessuna PK"); continue
    rows = q(f'select * from "{table}"')
    for row in rows:
        ts = row[col]
        d = day_from(ts)
        if not d: continue
        pk_vals = {k: row[k] for k in pk_cols}
        if len(pk_cols) == 1 and isinstance(row[pk_cols[0]], int):
            link = f"{BASE}/{table}/{row[pk_cols[0]]}"
        else:
            parts = [f"{k}={row[k]}" for k in pk_cols]
            link = f"{BASE}/{table}?" + "&".join(parts)
        execsql("insert into calendar (giorno, ts, tab, col, pk_json, link) values (?,?,?,?,?,?)",
                (d, str(ts), table, col, json.dumps(pk_vals, ensure_ascii=False), link))
        total += 1

conn.commit()
print(f"[calendar] creati {total} record da {DB_PATH} usando {LIST_PATH}")
