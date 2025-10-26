#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
build_calendar.py
-----------------
Genera la tabella 'calendar' e la vista 'calendar_range' a partire dal DB.
- 'calendar' contiene: giorno, ts, tab, col, pk_json, link
- 'calendar_range' aggiunge: link assoluto e indirizzo (join su luogo) con ', Copenhagen'
"""

import sys
import sqlite3
import json
import re
from typing import List, Tuple


# ---------- Parsing argomenti ----------
def parse_args(argv: List[str]) -> Tuple[str, str, str]:
    """
    Uso:
      python scripts/build_calendar.py output.db static/custom/calendar_columns.txt --base-path /output
    """
    db = argv[1] if len(argv) > 1 else "output.db"
    lst = argv[2] if len(argv) > 2 else "static/custom/calendar_columns.txt"
    base = "/output"
    for i, a in enumerate(argv):
        if a == "--base-path" and i + 1 < len(argv):
            base = argv[i + 1]
    return db, lst, base


DB_PATH, LIST_PATH, BASE = parse_args(sys.argv)

# ---------- Connessione ----------
conn = sqlite3.connect(DB_PATH)
conn.row_factory = sqlite3.Row
c = conn.cursor()

def q(sql: str, params: tuple = ()):
    c.execute(sql, params)
    return c.fetchall()

def execsql(sql: str, params: tuple = ()):
    c.execute(sql, params)


# ---------- Utilità ----------
def read_list(path: str) -> List[Tuple[str, str]]:
    """
    Legge il file lista colonne (es. static/custom/calendar_columns.txt).
    Formato: una riga per colonna, tipo "sex.inizio"
    Commenti con '#', righe vuote ignorate.
    """
    cols: List[Tuple[str, str]] = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            s = line.strip()
            if not s or s.startswith("#") or "." not in s:
                continue
            t, col = s.split(".", 1)
            cols.append((t.strip(), col.strip()))
    return cols


def detect_pk_cols(table: str) -> List[str]:
    """
    Rileva le colonne PK della tabella. Se non ci sono PK esplicite,
    usa 'rowid' se possibile.
    """
    info = q(f'PRAGMA table_info("{table}")')
    pks = [r["name"] for r in info if r["pk"]]
    if not pks:
        # Prova a vedere se la tabella ha rowid
        try:
            q(f'SELECT rowid FROM "{table}" LIMIT 1')
            pks = ["rowid"]
        except Exception:
            pks = []
    return pks


def day_from(ts) -> str:
    """
    Estrarre la data (YYYY-MM-DD) da un timestamp in vari formati.
    Prova formati comuni, altrimenti usa la funzione date() di SQLite.
    Ritorna None se non riconosciuto.
    """
    if ts is None:
        return None
    s = str(ts)

    # Già ISO YYYY-MM-DD...
    m = re.match(r"^(\d{4}-\d{2}-\d{2})", s)
    if m:
        return m.group(1)

    # Formato dd-mm-yy/ddd
    m = re.match(r"^(\d{2})-(\d{2})-(\d{2})", s)
    if m:
        # Heuristica: '20' + yy
        return f"20{m.group(3)}-{m.group(2)}-{m.group(1)}"

    # Tenta con SQLite
    try:
        r = q("SELECT date(?) AS d", (s,))
        return r[0]["d"]
    except Exception:
        return None


# ---------- Creazione 'calendar' ----------
def rebuild_calendar():
    print("[calendar] Ricostruzione tabella...")

    execsql("DROP TABLE IF EXISTS calendar")
    execsql("""
    CREATE TABLE calendar (
      giorno  TEXT NOT NULL,
      ts      TEXT NOT NULL,
      tab     TEXT NOT NULL,
      col     TEXT NOT NULL,
      pk_json TEXT NOT NULL,
      link    TEXT NOT NULL
    )
    """)

    total = 0
    for table, col in read_list(LIST_PATH):
        # Verifica esistenza colonna
        names = [r["name"] for r in q(f'PRAGMA table_info("{table}")')]
        if col not in names:
            print(f"[skip] {table}.{col} non esiste")
            continue

        pk_cols = detect_pk_cols(table)
        if not pk_cols:
            print(f"[skip] {table}: nessuna PK (nemmeno rowid)")
            continue

        # Scorri righe
        rows = q(f'SELECT * FROM "{table}"')
        for row in rows:
            ts = row[col]
            d = day_from(ts)
            if not d:
                continue

            # Costruisci pk_json (in base a PK rilevate)
            pk_vals = {k: row[k] for k in pk_cols}
            # Link "semplice" quando c'è una sola PK intera
            if len(pk_cols) == 1 and isinstance(row[pk_cols[0]], int):
                link = f"{BASE}/{table}/{row[pk_cols[0]]}"
            else:
                parts = [f"{k}={row[k]}" for k in pk_cols]
                link = f"{BASE}/{table}?" + "&".join(parts)

            execsql(
                "INSERT INTO calendar (giorno, ts, tab, col, pk_json, link) VALUES (?,?,?,?,?,?)",
                (d, str(ts), table, col, json.dumps(pk_vals, ensure_ascii=False), link),
            )
            total += 1

    conn.commit()
    print(f"[calendar] Creati {total} record da {DB_PATH} usando {LIST_PATH}")


# ---------- Creazione 'calendar_range' ----------
def rebuild_calendar_range():
    """
    Crea/ricrea la view 'calendar_range' con:
      - link assoluto
      - indirizzo = luogo.indirizzo || ', Copenhagen'
        via join su tabelle figlie (sex, ex_super, ex_negozi) → luogo
    """
    print("[calendar_range] Ricreazione view con indirizzo...")

    execsql("DROP VIEW IF EXISTS calendar_range")
    execsql("""
    CREATE VIEW calendar_range AS
    SELECT
      c.giorno,
      c.ts,
      c.tab,
      c.col,
      c.pk_json,
      CASE
        WHEN c.link LIKE 'http%' THEN c.link
        ELSE 'https://daniele.tail6b4058.ts.net:8001' || c.link
      END AS link,
      l.indirizzo || ', Copenhagen' AS indirizzo
    FROM calendar c
    LEFT JOIN (
      SELECT 'sex' AS tab, s.id AS pk, s.luogo_id
        FROM sex s
      UNION ALL
      SELECT 'ex_super', e.id, e.luogo_id
        FROM ex_super e
      UNION ALL
      SELECT 'ex_negozi', n.id, n.luogo_id
        FROM ex_negozi n
    ) m
      ON c.tab = m.tab
     AND json_extract(c.pk_json, '$.id') = m.pk
    LEFT JOIN luogo l
      ON m.luogo_id = l.id
    """)

    conn.commit()
    print("[calendar_range] View aggiornata con indirizzo ✓")


# ---------- Main ----------
if __name__ == "__main__":
    try:
        rebuild_calendar()
        rebuild_calendar_range()
        print("[OK] Completato.")
    except Exception as e:
        print("[ERRORE]", e)
        raise
    finally:
        conn.close()
