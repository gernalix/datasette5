
import os, json, sqlite3, re
from datetime import datetime, timezone
from typing import Any, Dict, Optional, List, Tuple

# import sdk relative to same folder
from memento_sdk import fetch_all_entries_full as _fetch_full

FALLBACK_TIME_KEYS = ["tempo", "time", "timestamp", "createdTime", "created_at", "modifiedTime", "modified_at", "date"]

def _pick_time_field(e: Dict[str, Any], tempo_col: str) -> Any:
    # Prefer the configured tempo_col
    if tempo_col and tempo_col in e:
        return e.get(tempo_col)
    # else fallbacks
    for k in FALLBACK_TIME_KEYS:
        if k in e:
            return e.get(k)
    # look for something that smells like time
    for k, v in e.items():
        if isinstance(k, str) and re.search(r"time|date|timestamp", k, re.I):
            return v
    return None

def _to_iso(value: Any) -> Optional[str]:
    """Coerce various time formats to ISO8601 TEXT for SQLite."""
    if value is None:
        return None
    # unwrap common containers
    if isinstance(value, list):
        if not value:
            return None
        value = value[0]
    if isinstance(value, dict):
        # try common keys
        for k in ("iso", "text", "value", "date", "start", "end"):
            if k in value:
                v = value[k]
                if isinstance(v, (str, int, float)):
                    value = v
                    break
        # if still dict, stringify
        if isinstance(value, dict):
            return json.dumps(value, ensure_ascii=False)

    # strings
    if isinstance(value, str):
        s = value.strip()
        # numeric string?
        if re.fullmatch(r"-?\d+", s):
            try:
                n = int(s)
                # guess ms vs s
                if n > 10_000_000_000:  # ms
                    dt = datetime.fromtimestamp(n/1000, tz=timezone.utc)
                else:
                    dt = datetime.fromtimestamp(n, tz=timezone.utc)
                return dt.isoformat()
            except Exception:
                pass
        # already ISO-ish
        return s

    # numeric epoch
    if isinstance(value, (int, float)):
        n = int(value)
        if n > 10_000_000_000:
            dt = datetime.fromtimestamp(n/1000, tz=timezone.utc)
        else:
            dt = datetime.fromtimestamp(n, tz=timezone.utc)
        return dt.isoformat()

    # fallback: stringify
    try:
        return str(value)
    except Exception:
        return None

def _ext_id_for(e: Dict[str, Any], id_mode: str) -> str:
    """Derive a stable ext_id according to id_mode."""
    if id_mode == "id":
        return str(e.get("id") or e.get("_id") or e.get("uuid") or "")
    if id_mode == "hash":
        import hashlib
        payload = json.dumps(e, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()[:32]
    # default: string of id if present
    return str(e.get("id") or e.get("_id") or "")

def _insert_rows(conn: sqlite3.Connection, table: str, tempo_col: str, id_mode: str, rows: List[Dict[str, Any]]) -> int:
    cur = conn.cursor()
    inserted = 0
    skipped = 0
    # Build SQL without explicit id: let SQLite autoincrement
    sql = f"INSERT OR IGNORE INTO {table} (ext_id, {tempo_col}, raw) VALUES (?,?,?)"
    for e in rows:
        ext = _ext_id_for(e, id_mode=id_mode)
        tval = _to_iso(_pick_time_field(e, tempo_col))
        if tval is None:
            # cannot satisfy NOT NULL tempo
            skipped += 1
            continue
        try:
            cur.execute(sql, (ext, tval, json.dumps(e, ensure_ascii=False)))
            inserted += cur.rowcount
        except sqlite3.IntegrityError as ex:
            # datatype mismatch or constraints: stringify and retry minimal
            try:
                cur.execute(sql, (str(ext), str(tval), json.dumps(e, ensure_ascii=False)))
                inserted += cur.rowcount
            except Exception:
                skipped += 1
        except Exception:
            skipped += 1
    conn.commit()
    return inserted

def _load_batch_file(batch_path: str) -> Dict[str, Any]:
    # Accept .ini or .yaml
    lower = batch_path.lower()
    if lower.endswith(".ini"):
        import configparser
        cp = configparser.ConfigParser()
        with open(batch_path, "r", encoding="utf-8") as fh:
            cp.read_file(fh)
        return {"kind": "ini", "cp": cp}
    else:
        # yaml
        import yaml
        with open(batch_path, "r", encoding="utf-8") as fh:
            data = yaml.safe_load(fh) or {}
        return {"kind": "yaml", "data": data}

def _import_from_ini(conn: sqlite3.Connection, cp) -> int:
    total = 0
    for sect in cp.sections():
        mode = cp.get(sect, "mode", fallback="cloud").strip().lower()
        if mode != "cloud":
            continue
        library_id = cp.get(sect, "library_id").strip()
        table = cp.get(sect, "table").strip()
        form = cp.get(sect, "form", fallback="default").strip()  # currently ignored (we use /entries)
        id_mode = cp.get(sect, "id_mode", fallback="id").strip().lower()
        tempo_col = cp.get(sect, "tempo_col", fallback="tempo").strip()
        hard_cap = cp.getint(sect, "limit", fallback=None)

        # Fetch cloud entries with explicit limit=100 (avoid 429)
        rows = _fetch_full(library_id, limit=100)
        if hard_cap:
            rows = rows[:hard_cap]

        n = _insert_rows(conn, table, tempo_col, id_mode, rows)
        print(f"[ok] {sect} (cloud): {n}/{len(rows)} righe importate")
        total += n
    return total

def _import_from_yaml(conn: sqlite3.Connection, data: Dict[str, Any]) -> int:
    total = 0
    sources = data.get("sources") or data
    if isinstance(sources, dict):
        items = list(sources.values())
    else:
        items = sources
    for spec in items:
        if not isinstance(spec, dict):
            continue
        if (spec.get("mode") or "cloud").lower() != "cloud":
            continue
        library_id = str(spec["library_id"])
        table = spec["table"]
        id_mode = (spec.get("id_mode") or "id").lower()
        tempo_col = spec.get("tempo_col") or "tempo"
        hard_cap = spec.get("limit")

        rows = _fetch_full(library_id, limit=100)
        if hard_cap:
            rows = rows[:int(hard_cap)]
        n = _insert_rows(conn, table, tempo_col, id_mode, rows)
        print(f"[ok] {table} (cloud): {n}/{len(rows)} righe importate")
        total += n
    return total

def resolve_here(p: str) -> str:
    p = p.strip().strip('"').strip("'")
    if not p:
        return p
    if os.path.isabs(p):
        return p
    # resolve relative to script dir
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, p)

def memento_import_batch(db_path: str, batch_path: str) -> int:
    db = resolve_here(db_path)
    batch = resolve_here(batch_path)
    conn = sqlite3.connect(str(db))
    try:
        obj = _load_batch_file(str(batch))
        if obj["kind"] == "ini":
            return _import_from_ini(conn, obj["cp"])  # type: ignore[arg-type]
        elif obj["kind"] == "yaml":
            return _import_from_yaml(conn, obj["data"])  # type: ignore[arg-type]
        else:
            raise RuntimeError("Formato batch non riconosciuto")
    finally:
        conn.close()
