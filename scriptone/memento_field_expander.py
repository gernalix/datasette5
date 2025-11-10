
# memento_field_expander.py
# Expands JSON fields from table.raw -> real columns (e.g., 'umore', 'note')
# Safe to run after each import. Creates TEXT columns if missing and fills values.
#
# Usage:
#   python memento_field_expander.py noutput.db umore
#   # or from Python:
#   # from memento_field_expander import expand_fields
#   # expand_fields("noutput.db", "umore")
#
# Notes:
# - Only affects rows whose JSON has $.fields[] with objects {name, value, ...}.
# - Columns are created as TEXT (universal, simple). You can cast in views later.
# - Skips if a column already exists and a row already has a non-empty value.
# - Designed to be idempotent: safe to re-run.
#
from __future__ import annotations

import sqlite3
import sys
from typing import List, Tuple

def _log(s: str) -> None:
    print(s, flush=True)

def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,)
    ).fetchone()
    return bool(row)

def _has_raw_column(conn: sqlite3.Connection, table: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1].lower() == "raw" for r in rows)

def _list_current_columns(conn: sqlite3.Connection, table: str) -> List[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]

def _discover_field_names(conn: sqlite3.Connection, table: str) -> List[str]:
    sql = f"""
    SELECT DISTINCT json_extract(j.value,'$.name') AS field_name
    FROM {table} u,
         json_each(json_extract(u.raw,'$.fields')) AS j
    WHERE json_type(u.raw,'$.fields')='array'
      AND json_type(j.value,'$.name') IS NOT NULL
    """
    return [r[0] for r in conn.execute(sql) if r[0]]

def _ensure_text_columns(conn: sqlite3.Connection, table: str, names: List[str]) -> List[str]:
    existing = set(_list_current_columns(conn, table))
    created = []
    for name in names:
        if name in existing:
            continue
        # Quote the column name
        col = '"' + name.replace('"', '""') + '"'
        conn.execute(f'ALTER TABLE {table} ADD COLUMN {col} TEXT')
        created.append(name)
    if created:
        conn.commit()
    return created

def _fill_column_from_fields(conn: sqlite3.Connection, table: str, field: str) -> Tuple[int,int]:
    """
    Writes values into column = field name from raw->fields[].value.
    Returns (updated_rows, already_filled_rows)
    """
    col = '"' + field.replace('"','""') + '"'
    # Prefer to not overwrite non-empty values
    # empty means NULL or ''.
    # Use a CTE to pick the first matching field by name, if multiple.
    sql_update = f"""
    WITH v AS (
      SELECT
        u.rowid AS rid,
        (SELECT json_extract(j.value, '$.value')
         FROM json_each(json_extract(u.raw,'$.fields')) AS j
         WHERE json_extract(j.value,'$.name') = ?
         LIMIT 1) AS val
      FROM {table} u
      WHERE ( {col} IS NULL OR {col} = '' )
    )
    UPDATE {table}
    SET {col} = v.val
    FROM v
    WHERE {table}.rowid = v.rid
      AND v.val IS NOT NULL
      AND v.val <> '';
    """
    cur = conn.cursor()
    cur.execute(sql_update, (field,))
    updated = cur.rowcount if cur.rowcount is not None else 0

    # Count already-filled rows for info
    sql_filled = f"SELECT COUNT(*) FROM {table} WHERE {col} IS NOT NULL AND {col} <> ''"
    already = conn.execute(sql_filled).fetchone()[0]
    conn.commit()
    return updated, already

def expand_fields(db_path: str, table: str) -> None:
    conn = sqlite3.connect(db_path)
    try:
        if not _table_exists(conn, table):
            _log(f"[expander] Tabella '{table}' inesistente, skip.")
            return
        if not _has_raw_column(conn, table):
            _log(f"[expander] Tabella '{table}' non ha colonna 'raw', skip.")
            return

        _log(f"[expander] Analisi tabella '{table}'...")
        names = _discover_field_names(conn, table)
        if not names:
            _log(f"[expander] Nessun field trovato in {table}.")
            return

        created = _ensure_text_columns(conn, table, names)
        if created:
            _log(f"[expander] Create colonne: {', '.join(created)}")
        else:
            _log(f"[expander] Nessuna nuova colonna: schema già allineato.")

        total_updated = 0
        for nm in names:
            updated, already = _fill_column_from_fields(conn, table, nm)
            total_updated += updated
            _log(f"[expander] Colonna '{nm}': aggiornati {updated}, già pieni {already}")

        _log(f"[expander] Completato: {table} → righe aggiornate totali {total_updated}.")
    finally:
        conn.close()

def main(argv: List[str]) -> int:
    if len(argv) < 2:
        print("Uso: python memento_field_expander.py <db_path> <table>", flush=True)
        return 2
    db_path = argv[0]
    table = argv[1]
    expand_fields(db_path, table)
    return 0

if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
