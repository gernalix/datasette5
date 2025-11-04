# -*- coding: utf-8 -*-
"""
crea_tabelle.py — alternativa 2 (DEFAULT logseq)
------------------------------------------------
- Usa DEFAULT (hex(randomblob(5))) per la colonna logseq
- NON crea il trigger set_logseq_random; se presente nei template, lo rimuove
- Applica solo i trigger di audit (insert/update/delete) letti da triggers.sql
- Mostra errori in console e attende Invio prima di chiudere (doppio clic-friendly)
"""

import sys
import sqlite3
from pathlib import Path
import re
from typing import List, Tuple

HERE = Path(__file__).resolve().parent
DB_PATH = HERE / "noutput.db"
TRIGGERS_PATH = HERE / "triggers.sql"

# --------------------------- Utilità console ---------------------------

def pause(msg: str = "\nPremi Invio per uscire..."):
    try:
        input(msg)
    except EOFError:
        pass

def print_header(title: str):
    line = "=" * 64
    print(f"\n{line}\n{title}\n{line}")

# --------------------------- DB helpers ---------------------------

def connect_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA recursive_triggers = ON;")
    return conn

def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?;",
        (table,)
    ).fetchone()
    return row is not None

def get_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    rows = conn.execute(f"PRAGMA table_info('{table}')").fetchall()
    return [r["name"] for r in rows]

def drop_trigger_if_exists(conn: sqlite3.Connection, name: str):
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?;",
        (name,)
    ).fetchone()
    if row:
        conn.execute(f'DROP TRIGGER "{name}"')

def alias_column(col: str) -> str:
    return col

def build_json_pairs(cols: List[str], prefix: str) -> str:
    pairs = []
    for c in cols:
        pairs.append(f"'{alias_column(c)}'")
        pairs.append(f'{prefix}."{c}"')
    return ", ".join(pairs)

def render_triggers_sql(template: str, table: str, cols: List[str], logseq_col: str = "logseq") -> str:
    """
    Alternativa 2: rimuove sempre il blocco set_logseq_random,
    usa DEFAULT su logseq; genera i 3 trigger di audit.
    """
    json_new_pairs = build_json_pairs(cols, "NEW")
    json_old_pairs = build_json_pairs(cols, "OLD")

    ctx = {
        "table": table,
        "trigger_name_insert": f'audit__{table}__insert',
        "trigger_name_update": f'audit__{table}__update',
        "trigger_name_delete": f'audit__{table}__delete',
        "trigger_name_logseq": f'set_logseq_random__{table}',  # compat
        "json_new_pairs": json_new_pairs,
        "json_old_pairs": json_old_pairs,
        "logseq_col": logseq_col,
    }

    sql = template.format(**ctx)

    # Rimuovi SEMPRE un eventuale trigger set_logseq_random
    pattern_hdr = r"-- === SET LOGSEQ RANDOM ================================.*?(?=(\n-- ===|$))"
    sql = re.sub(pattern_hdr, "", sql, flags=re.DOTALL)

    trig_name = ctx["trigger_name_logseq"]
    pattern_trig = rf"CREATE\s+TRIGGER\s+{re.escape(trig_name)}.*?END;"
    sql = re.sub(pattern_trig, "", sql, flags=re.DOTALL | re.IGNORECASE)

    return sql.strip()

# --------------------------- Parsing input colonne ---------------------------

TYPE_MAP = {"i": "INTEGER", "r": "REAL", "t": "TEXT"}

def parse_columns_spec(spec: str) -> List[Tuple[str, str, bool]]:
    out: List[Tuple[str, str, bool]] = []
    if not spec.strip():
        return out
    import re as _re
    parts = [p.strip() for p in spec.split(",")]
    for p in parts:
        if not p:
            continue
        m = _re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s+([irtIRT])([zZ])?$', p)
        if not m:
            raise ValueError(f"Formato colonna non valido: '{p}'. Usa es: 'nome t' oppure 'esempio iz'")
        name = m.group(1)
        tcode = m.group(2).lower()
        has_z = bool(m.group(3))
        sql_type = TYPE_MAP[tcode]
        default_zero = has_z and (sql_type in ("INTEGER", "REAL"))
        out.append((name, sql_type, default_zero))
    return out

# --------------------------- Creazione tabelle ---------------------------

def create_base_table(conn: sqlite3.Connection, table: str):
    """
    Tabella minimale: id PK + logseq con DEFAULT random
    """
    if table_exists(conn, table):
        return
    ddl = f"""
    CREATE TABLE "{table}" (
        "id" INTEGER PRIMARY KEY AUTOINCREMENT,
        "logseq" TEXT DEFAULT (hex(randomblob(5)))
    );"""
    conn.execute(ddl)
    conn.commit()

def create_table_with_columns(conn: sqlite3.Connection, table: str, cols_spec: List[Tuple[str, str, bool]], fks: List[Tuple[str, str, str]]):
    if table_exists(conn, table):
        raise RuntimeError(f"La tabella '{table}' esiste già.")

    col_defs = [
        '"id" INTEGER PRIMARY KEY AUTOINCREMENT',
        '"logseq" TEXT DEFAULT (hex(randomblob(5)))'
    ]

    for name, sql_type, default_zero in cols_spec:
        if default_zero:
            col_defs.append(f'"{name}" {sql_type} DEFAULT 0')
        else:
            col_defs.append(f'"{name}" {sql_type}')

    fk_defs = [f'FOREIGN KEY ("{col}") REFERENCES "{ref_table}"("{ref_col}")' for col, ref_table, ref_col in fks]
    all_defs = col_defs + fk_defs
    ddl = f'CREATE TABLE "{table}" (\n  ' + ",\n  ".join(all_defs) + "\n);"
    conn.execute(ddl)
    conn.commit()

# --------------------------- FK utilities ---------------------------

def detect_foreign_keys(cols_spec: List[Tuple[str, str, bool]]) -> List[Tuple[str, str, str]]:
    fks: List[Tuple[str, str, str]] = []
    for name, sql_type, default_zero in cols_spec:
        if name.endswith("_id") and len(name) > 3:
            ref_table = name[:-3]
            fks.append((name, ref_table, "id"))
    return fks

def ensure_fk_tables(conn: sqlite3.Connection, fk_list: List[Tuple[str, str, str]]):
    for (_col, ref_table, _ref_col) in fk_list:
        if not table_exists(conn, ref_table):
            print(f"[INFO] Creo tabella referenziata '{ref_table}' (schema base) ...")
            create_base_table(conn, ref_table)
            apply_triggers_to_table(conn, ref_table)

# --------------------------- Trigger application ---------------------------

def read_triggers_template() -> str:
    if not TRIGGERS_PATH.exists():
        raise FileNotFoundError(f"File triggers.sql non trovato: {TRIGGERS_PATH}")
    return TRIGGERS_PATH.read_text(encoding="utf-8")

def apply_triggers_to_table(conn: sqlite3.Connection, table: str):
    cols = get_columns(conn, table)
    template = read_triggers_template()
    sql = render_triggers_sql(template, table, cols, logseq_col="logseq")

    # Drop vecchi trigger e quelli logseq se esistono
    trig_names = [
        f'audit__{table}__insert',
        f'audit__{table}__update',
        f'audit__{table}__delete',
        f'set_logseq_random__{table}'  # solo DROP per cleanup
    ]

    with conn:
        for tn in trig_names:
            drop_trigger_if_exists(conn, tn)
        conn.executescript(sql)

    print(f"[OK] Trigger applicati per tabella '{table}'.")

# --------------------------- Menu & workflow ---------------------------


def menu_aggiungi_tabella():
    print_header("MENU — Aggiungi tabella")

    # Loop fino a nome valido
    while True:
        table = input("Nome tabella principale (<main>): ").strip()
        if table:
            break
        print("Nome tabella non valido. Riprova.")

    # Loop fino a specifica colonne valida
    while True:
        prompt = """Specifica colonne: "nome tipo" con comma,
dove tipo in {i|r|t} + opzionale 'z' per default 0
(es. 'inizio t, fine t, esempio iz'):
> """
        raw_cols = input(prompt).strip()
        try:
            cols_spec = parse_columns_spec(raw_cols)
            break
        except Exception as e:
            print(f"[ERRORE] {e}")
            print("Riprova l'inserimento delle colonne.\n")

    # Rileva FK da *_id e garantisce tabelle di riferimento
    fks = detect_foreign_keys(cols_spec)

    with connect_db() as conn:
        try:
            ensure_fk_tables(conn, fks)
            print(f"[INFO] Creo tabella '{table}' ...")
            create_table_with_columns(conn, table, cols_spec, fks)
            apply_triggers_to_table(conn, table)
            print(f"[FATTO] Tabella '{table}' creata con successo.")
        except Exception as e:
            print(f"[ERRORE] Durante la creazione di '{table}': {e}")



def main():

    print_header("CREA TABELLE + TRIGGER (noutput.db) — alternativa 2")
    print(f"Percorso DB: {DB_PATH}")
    print(f"Template trigger: {TRIGGERS_PATH}\n")

    # Avviso versione SQLite per DEFAULT expressions
    try:
        ver = tuple(int(x) for x in sqlite3.sqlite_version.split("."))
        if ver < (3, 31, 0):
            print("[ATTENZIONE] SQLite =", sqlite3.sqlite_version,
                  "— per usare DEFAULT (hex(randomblob(5))) serve >= 3.31.0. "
                  "Altrimenti riattiva il trigger set_logseq_random nel template.")
    except Exception:
        pass

    print("Seleziona un'azione:")
    print("  1) Aggiungi tabella")
    print("  0) Esci")

    choice = input("> ").strip()
    if choice == "1":
        menu_aggiungi_tabella()
    elif choice == "0":
        print("Uscita.")
    else:
        print("Scelta non valida.")

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("\n=== ERRORE NON GESTITO ===")
        print(f"{type(exc).__name__}: {exc}")
        import traceback
        traceback.print_exc()
        pause("\nPremi Invio per chiudere...")
        sys.exit(1)
    finally:
        pause()
