#!/usr/bin/env python3
import sys, sqlite3, json, re, traceback

def log(msg):
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        print(msg.encode("utf-8", errors="replace").decode("cp1252", errors="replace"), flush=True)


def parse_args(argv):
    db = argv[1] if len(argv) > 1 else "output.db"
    lst = argv[2] if len(argv) > 2 else "static/custom/calendar_columns.txt"
    base = "/output"
    for i, a in enumerate(argv):
        if a == "--base-path" and i + 1 < len(argv):
            base = argv[i + 1]
    return db, lst, base

DB_PATH, LIST_PATH, BASE = parse_args(sys.argv)
log(f"[INIT] Avvio build_calendar.py\n  DB: {DB_PATH}\n  LISTA COLONNE: {LIST_PATH}\n  BASE PATH: {BASE}")

# ------------------ Connessione ------------------
try:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()
    log("✔ Connessione al database OK")
except Exception as e:
    log(f"❌ ERRORE connessione: {e}"); traceback.print_exc(); sys.exit(1)

def q(sql, params=()):
    try:
        c.execute(sql, params)
        return c.fetchall()
    except Exception as e:
        log(f"❌ ERRORE SQL query:\n{sql}\n→ {e}"); traceback.print_exc(); return []

def execsql(sql, params=()):
    try:
        c.execute(sql, params)
    except Exception as e:
        log(f"❌ ERRORE SQL exec:\n{sql}\n→ {e}"); traceback.print_exc(); raise

def read_list(path):
    cols=[]
    with open(path,"r",encoding="utf-8") as f:
        for line in f:
            s=line.strip()
            if not s or s.startswith("#") or "." not in s: 
                continue
            t,col=s.split(".",1)
            cols.append((t.strip(),col.strip()))
    log(f"✔ Letto file colonne: {len(cols)} righe valide")
    return cols

def detect_pk_cols(table):
    info=q(f'pragma table_info("{table}")')
    pks=[r["name"] for r in info if r["pk"]]
    if not pks:
        try: 
            q(f'select rowid from "{table}" limit 1')
            pks=["rowid"]
        except Exception: 
            pks=[]
    return pks

def table_has_column(table, col):
    info=q(f'pragma table_info("{table}")')
    return any(r["name"]==col for r in info)

def day_from(ts):
    if ts is None: 
        return None
    s=str(ts)
    m=re.match(r"^(\d{4}-\d{2}-\d{2})",s)
    if m: 
        return m.group(1)
    m=re.match(r"^(\d{2})-(\d{2})-(\d{2})",s)
    if m: 
        return f"20{m.group(3)}-{m.group(2)}-{m.group(1)}"
    try:
        r=q("select date(?) d",(s,))
        return r[0]["d"]
    except Exception:
        return None

# ------------------ calendar ------------------
try:
    log("[STEP] Ricreazione tabella calendar...")
    execsql("drop table if exists calendar")
    execsql("""
        create table calendar(
            inizio text not null,
            tab text not null,
            col text not null,
            link text not null,
            pk integer
        )
    """)

    cols = read_list(LIST_PATH)

    total=0
    for table, col in cols:
        # controlla che la tabella esista e che la colonna esista
        t_exists = q("select name from sqlite_master where type='table' and name=?", (table,))
        if not t_exists:
            log(f"• Skipping '{table}.{col}' perché la tabella non esiste")
            continue

        info=q(f'pragma table_info("{table}")')
        if not any(r["name"]==col for r in info):
            log(f"• Skipping '{table}.{col}' perché la colonna non esiste")
            continue

        pk_cols=detect_pk_cols(table)
        if not pk_cols:
            log(f"• Skipping '{table}.{col}' perché non trovo una PK")
            continue

        rows=q(f'select * from "{table}" where "{col}" is not null')
        for row in rows:
            ts=row[col]
            d=day_from(ts)
            if not d: 
                continue

            pk_val=None
            if len(pk_cols)==1 and isinstance(row[pk_cols[0]], int):
                try:
                    pk_val=int(row[pk_cols[0]])
                except Exception:
                    pk_val=None

            if pk_val is not None:
                link=f"{BASE}/{table}/{pk_val}"
            else:
                parts=[f"{k}={row[k]}" for k in pk_cols]
                link=f"{BASE}/{table}?"+"&".join(parts)

            execsql(
                "insert into calendar (inizio, tab, col, link, pk) values (?,?,?,?,?)",
                (d, table, col, link, pk_val)
            )
            total+=1

    conn.commit()
    log(f"✔ Inseriti {total} record in calendar")

except Exception:
    log("❌ ERRORE durante la creazione/popolo di calendar:"); traceback.print_exc(); sys.exit(1)

# ------------------ calendar_range ------------------
try:
    log("[STEP] Ricreazione view calendar_range...")
    execsql("drop view if exists calendar_range")

    # Costruisci dinamicamente il mapping tab->(pk, luogo_id) solo per tabelle esistenti
    candidate_tabs = sorted(set(t for t,_ in cols))
    union_parts = []
    for t in candidate_tabs:
        # Richiede la presenza della colonna luogo_id
        if not q("select name from sqlite_master where type='table' and name=?", (t,)):
            continue
        if not table_has_column(t, "luogo_id"):
            log(f"• Niente join mappa per '{t}' (colonna 'luogo_id' assente)")
            continue
        pk_cols = detect_pk_cols(t)
        if len(pk_cols)!=1:
            log(f"• Niente join mappa per '{t}' (PK multipla o assente)")
            continue
        pk = pk_cols[0]
        union_parts.append(f"SELECT '{t}' AS tab, {pk} AS pk, luogo_id FROM {t}")

    # Se non c'è alcuna tabella con luogo_id, crea comunque la view senza join al luogo
    if union_parts:
        mapping_sql = " \n      UNION ALL\n      ".join(union_parts)
        view_sql = f"""
        CREATE VIEW calendar_range AS
        SELECT
          c.inizio,
          c.tab,
          c.col,
          CASE
            WHEN c.link LIKE 'http%' THEN c.link
            ELSE 'https://daniele.tail6b4058.ts.net:8001' || c.link
          END AS link,
          m.luogo_id AS luogo_id
        FROM calendar c
        LEFT JOIN (
          {mapping_sql}
        ) m ON c.tab = m.tab AND c.pk = m.pk
        LEFT JOIN luogo l ON m.luogo_id = l.id
        """
    else:
        view_sql = """
        CREATE VIEW calendar_range AS
        SELECT
          c.inizio,
          c.tab,
          c.col,
          CASE
            WHEN c.link LIKE 'http%' THEN c.link
            ELSE 'https://daniele.tail6b4058.ts.net:8001' || c.link
          END AS link,
          NULL AS luogo_id
        FROM calendar c
        """

    execsql(view_sql)
    conn.commit()
    log("✔ View calendar_range creata correttamente")

except Exception:
    log("❌ ERRORE durante la creazione di calendar_range:"); traceback.print_exc(); sys.exit(1)

log("[FINE] Script completato con successo ✅")
conn.close()
