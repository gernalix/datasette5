import sqlite3
from typing import Set

def quote_ident(name: str) -> str:
    """Quote an identifier for SQLite."""
    if name is None:
        raise ValueError("Identifier cannot be None")
    return '"' + str(name).replace('"', '""') + '"'

def table_columns(conn: sqlite3.Connection, table: str) -> Set[str]:
    """Return the set of column names for a given table."""
    cur = conn.execute(f"PRAGMA table_info({quote_ident(table)})")
    return {row[1] for row in cur.fetchall()}

def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    """Check if a table exists in the current database."""
    cur = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,)
    )
    return cur.fetchone() is not None

def ensure_table_basic(conn: sqlite3.Connection, table: str, tempo_col: str = "tempo") -> None:
    """
    Create the table with a minimal schema if it doesn't exist yet.
    Minimal schema includes:
      - id INTEGER PRIMARY KEY AUTOINCREMENT
      - ext_id TEXT UNIQUE (external/import source id)
      - <tempo_col> TEXT (timestamp or datestamp string as ingested)
      - raw TEXT (the raw JSON payload as string)
    Additional columns will be added later by the import pipeline.
    """
    if table_exists(conn, table):
        return

    q = f"""CREATE TABLE {quote_ident(table)} (
id INTEGER PRIMARY KEY AUTOINCREMENT,
ext_id TEXT UNIQUE,
{quote_ident(tempo_col)} TEXT,
raw TEXT
)"""
    conn.execute(q)
    conn.commit()

def ensure_ext_col_migrated(conn: sqlite3.Connection, table: str) -> str:
    """
    Ensure that an 'ext_id' column exists on the target table.
    If missing, add it and create a UNIQUE index when appropriate.
    Returns the column name ('ext_id').
    """
    cols = table_columns(conn, table)
    if 'ext_id' not in cols:
        conn.execute(f"ALTER TABLE {quote_ident(table)} ADD COLUMN ext_id TEXT")
        try:
            idx = f"{table}_ext_id_unique"
            conn.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS {quote_ident(idx)} ON {quote_ident(table)} (ext_id)')
        except sqlite3.OperationalError:
            pass
        conn.commit()
    return 'ext_id'
