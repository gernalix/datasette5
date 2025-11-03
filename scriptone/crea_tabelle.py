# -*- coding: utf-8 -*-
"""
crea_tabelle.py
----------------
Script avviabile da doppio clic (Windows/macOS/Linux) che:
- lavora su "noutput.db" e "triggers.sql" nella stessa cartella dello script
- implementa un MENU "Aggiungi tabella" secondo le istruzioni del file .md
- crea automaticamente eventuali tabelle referenziate da colonne *_id con schema base
- applica i trigger letti da triggers.sql, templati per ogni tabella/colonne
- stampa eventuali errori in console senza chiudersi (attende Invio prima di uscire)

Requisiti: Python 3.10+ (nessuna dipendenza esterna)
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
    # Attivo FK e (eventualmente) trigger ricorsivi
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
    # SQLite non supporta IF EXISTS nella sintassi DROP TRIGGER standard in tutte le versioni,
    # quindi controlliamo prima.
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='trigger' AND name=?;",
        (name,)
    ).fetchone()
    if row:
        conn.execute(f'DROP TRIGGER "{name}"')

def alias_column(col: str) -> str:
    """Nel JSON usiamo il nome così com'è. Se vuoi alias personalizzati, modifica qui."""
    return col

def build_json_pairs(cols: List[str], prefix: str) -> str:
    """
    Costruisce la stringa per json_object:
    'col1', NEW."col1", 'col2', NEW."col2", ...
    prefix: 'NEW' o 'OLD'
    """
    pairs = []
    for c in cols:
        pairs.append(f"'{alias_column(c)}'")
        pairs.append(f'{prefix}."{c}"')
    return ", ".join(pairs)

def render_triggers_sql(template: str, table: str, cols: List[str], logseq_col: str = "logseq") -> str:
    """
    Compila il template di triggers.sql con i placeholder richiesti.
    Genera nomi trigger stabili per tabella:
      audit__{table}__insert / update / delete
      set_logseq_random__{table}
    Se la tabella non ha logseq_col, la sezione set_logseq viene rimossa.
    """
    # Prepara json pairs per NEW/OLD
    json_new_pairs = build_json_pairs(cols, "NEW")
    json_old_pairs = build_json_pairs(cols, "OLD")

    ctx = {
        "table": table,
        "trigger_name_insert": f'audit__{table}__insert',
        "trigger_name_update": f'audit__{table}__update',
        "trigger_name_delete": f'audit__{table}__delete',
        "trigger_name_logseq": f'set_logseq_random__{table}',
        "json_new_pairs": json_new_pairs,
        "json_old_pairs": json_old_pairs,
        "logseq_col": logseq_col,
    }

    sql = template.format(**ctx)

    # Se la tabella non ha logseq_col, rimuovi il blocco "SET LOGSEQ RANDOM"
    if logseq_col not in cols:
        # Rimuove il blocco tra i commenti/sezione del trigger logseq.
        # Identifica in modo permissivo il blocco a partire da "SET LOGSEQ RANDOM" fino a prima del prossimo blocco/EOF
        pattern = r"-- === SET LOGSEQ RANDOM ================================.*?(?=(\n-- ===|$))"
        sql = re.sub(pattern, "", sql, flags=re.DOTALL)

    return sql.strip()

# --------------------------- Parsing input colonne ---------------------------

TYPE_MAP = {
    "i": "INTEGER",
    "r": "REAL",
    "t": "TEXT",
}

def parse_columns_spec(spec: str) -> List[Tuple[str, str, bool]]:
    """
    Converte l'input utente in una lista di tuple (nome_colonna, tipo_sqlite, default_zero)
    Esempio input: "inizio t, fine t, esempio iz, esempio2 iz, esempio3 i"
    - 'i' -> INTEGER, 'r' -> REAL, 't' -> TEXT
    - suffisso 'z' = default 0 (applicato solo a tipi numerici INTEGER/REAL)
    """
    out: List[Tuple[str, str, bool]] = []
    if not spec.strip():
        return out

    parts = [p.strip() for p in spec.split(",")]
    for p in parts:
        if not p:
            continue
        # atteso: "<nome> <sigla>"
        # dove sigla è 'i', 'r', 't' con opzionale 'z' es: 'iz', 'rz', 'tz'
        m = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)\s+([irtIRT])([zZ])?$', p)
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
    Crea una tabella minimale con:
      id INTEGER PRIMARY KEY,
      logseq TEXT
    Non crea altre colonne.
    """
    if table_exists(conn, table):
        return
    ddl = f"""
    CREATE TABLE "{table}" (
        "id" INTEGER PRIMARY KEY,
        "logseq" TEXT
    );"""
    conn.execute(ddl)
    conn.commit()

def create_table_with_columns(conn: sqlite3.Connection, table: str, cols_spec: List[Tuple[str, str, bool]], fks: List[Tuple[str, str, str]]):
    """
    Crea tabella con colonne di default + specificate + FK.
      Colonne di default (fisse, in ordine): id, logseq
      Poi, in ordine dato, le colonne utente.
    fks: lista di tuple (colonna, ref_table, ref_col) — le FK saranno su (colonna) REFERENCES ref_table(ref_col)
    """
    if table_exists(conn, table):
        raise RuntimeError(f"La tabella '{table}' esiste già.")

    col_defs = [
        '"id" INTEGER PRIMARY KEY',
        '"logseq" TEXT'
    ]

    for name, sql_type, default_zero in cols_spec:
        if default_zero:
            col_defs.append(f'"{name}" {sql_type} DEFAULT 0')
        else:
            col_defs.append(f'"{name}" {sql_type}')

    fk_defs = []
    for col, ref_table, ref_col in fks:
        fk_defs.append(f'FOREIGN KEY ("{col}") REFERENCES "{ref_table}"("{ref_col}")')

    all_defs = col_defs + fk_defs
    ddl = f'CREATE TABLE "{table}" (\n  ' + ",\n  ".join(all_defs) + "\n);"
    conn.execute(ddl)
    conn.commit()

# --------------------------- FK utilities ---------------------------

def detect_foreign_keys(cols_spec: List[Tuple[str, str, bool]]) -> List[Tuple[str, str, str]]:
    """
    Cerca colonne che terminano con _id e costruisce la lista FK:
      <main>.<fk>_id -> <fk>.id
    Ritorna: [(colonna, tabella_rif, col_rif)]
    """
    fks: List[Tuple[str, str, str]] = []
    for name, sql_type, default_zero in cols_spec:
        if name.endswith("_id") and len(name) > 3:
            ref_table = name[:-3]  # rimuove "_id"
            fks.append((name, ref_table, "id"))
    return fks

def ensure_fk_tables(conn: sqlite3.Connection, fk_list: List[Tuple[str, str, str]]):
    """
    Per ogni FK rilevata, crea la tabella di riferimento se non esiste,
    applicando lo schema base (id PK + logseq) e i trigger.
    """
    for (_col, ref_table, ref_col) in fk_list:
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
    """
    Applica i trigger dal template, adattandoli alle colonne della tabella.
    Effettua prima DROP dei trigger previgenti con gli stessi nomi per idempotenza.
    """
    cols = get_columns(conn, table)
    template = read_triggers_template()
    sql = render_triggers_sql(template, table, cols, logseq_col="logseq")

    # Calcola i nomi trigger che andremo a (ri)creare per dropparli prima
    trig_names = [
        f'audit__{table}__insert',
        f'audit__{table}__update',
        f'audit__{table}__delete',
        f'set_logseq_random__{table}'
    ]

    with conn:
        for tn in trig_names:
            drop_trigger_if_exists(conn, tn)
        conn.executescript(sql)

    print(f"[OK] Trigger applicati per tabella '{table}'.")

# --------------------------- Menu & workflow ---------------------------

def menu_aggiungi_tabella():
    print_header("MENU — Aggiungi tabella")
    table = input("Nome tabella principale (<main>): ").strip()
    if not table:
        print("Nome tabella non valido.")
        return

    # Input esempio: "inizio t, fine t, esempio iz, esempio2 iz, esempio3 i"
    raw_cols = input(
        "Specifica colonne: \"nome tipo\" con comma, dove tipo in {i|r|t} + opzionale 'z' per default 0 (es. 'inizio t, fine t, esempio iz'):\n> "
    ).strip()

    try:
        cols_spec = parse_columns_spec(raw_cols)
    except Exception as e:
        print(f"[ERRORE] {e}")
        return

    # Rileva FK da *_id e garantisce tabelle di riferimento
    fks = detect_foreign_keys(cols_spec)

    with connect_db() as conn:
        try:
            # Crea prima eventuali tabelle referenziate
            ensure_fk_tables(conn, fks)

            # Crea tabella principale
            print(f"[INFO] Creo tabella '{table}' ...")
            create_table_with_columns(conn, table, cols_spec, fks)

            # Applica trigger alla tabella principale
            apply_triggers_to_table(conn, table)

            print(f"[FATTO] Tabella '{table}' creata con successo.")
        except Exception as e:
            print(f"[ERRORE] Durante la creazione di '{table}': {e}")

def main():
    print_header("CREA TABELLE + TRIGGER (noutput.db)")
    print(f"Percorso DB: {DB_PATH}")
    print(f"Template trigger: {TRIGGERS_PATH}\n")

    if not DB_PATH.exists():
        print("[INFO] Il database 'noutput.db' non esiste: verrà creato al primo utilizzo.")

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
        # stampa stack facoltativa
        import traceback
        traceback.print_exc()
        pause("\nPremi Invio per chiudere...")
        sys.exit(1)
    finally:
        # Mantiene la finestra aperta anche in esecuzione da doppio clic
        pause()
