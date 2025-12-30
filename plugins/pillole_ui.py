# v14
# plugins/pillole_ui.py
# -*- coding: utf-8 -*-

import json
import os
from datetime import datetime, timezone
import asyncio
import sqlite3

from datasette import hookimpl
from datasette.utils.asgi import Response


# Root del progetto (parent della cartella plugins)
BASE_DIR = os.path.dirname(os.path.dirname(__file__))

# Nel tuo repo il seed sta qui:
SEED_JSON_CANDIDATES = [
    os.path.join(BASE_DIR, "static", "custom", "pillole_farmaci.json"),
    # fallback (se in futuro lo sposti)
    os.path.join(BASE_DIR, "data", "pillole_farmaci.json"),
]

# Keep DB ops from hanging the UI forever (locked DB, missing table, etc.)
DB_OP_TIMEOUT = 2.0


def _now_iso():
    # Store UTC ISO8601 with Z
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _load_farmaci_seed_from_json():
    """
    Returns list like:
        [{"farmaco":"duloxetina","dose_default":90}, ...]
    Safe fallback to [].
    """
    for path in SEED_JSON_CANDIDATES:
        try:
            if not os.path.exists(path):
                continue
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)

            if not isinstance(data, list):
                continue

            out = []
            for x in data:
                if isinstance(x, dict) and "farmaco" in x:
                    out.append(
                        {
                            "farmaco": str(x.get("farmaco") or "").strip(),
                            "dose_default": x.get("dose_default", None),
                        }
                    )
            out = [x for x in out if x["farmaco"]]
            if out:
                return out
        except Exception:
            # prova il prossimo candidate
            pass
    return []


async def _get_db(datasette):
    # Prefer "output" if exists, else use first DB
    try:
        return datasette.get_database("output")
    except Exception:
        return datasette.get_database()


async def _ensure_tables(datasette):
    """
    Create tables if missing. Should run once at startup.
    """
    db = await _get_db(datasette)

    async def _exec(sql):
        return await asyncio.wait_for(db.execute_write(sql), timeout=DB_OP_TIMEOUT)

    await _exec(
        """
        CREATE TABLE IF NOT EXISTS pillole (
            quando TEXT NOT NULL,
            farmaco TEXT NOT NULL,
            dose REAL
        )
        """
    )
    await _exec("CREATE INDEX IF NOT EXISTS idx_pillole_quando ON pillole(quando)")
    await _exec("CREATE INDEX IF NOT EXISTS idx_pillole_farmaco ON pillole(farmaco)")

    await _exec(
        """
        CREATE TABLE IF NOT EXISTS pillole_farmaci (
            farmaco TEXT PRIMARY KEY,
            dose_default REAL
        )
        """
    )


async def _seed_farmaci_defaults(datasette):
    """
    Seed the defaults table in sqlite so UI can render quickly even without seed JSON later.
    """
    db = await _get_db(datasette)

    seed = _load_farmaci_seed_from_json()
    if not seed:
        return

    for x in seed:
        farmaco = x["farmaco"]
        dose_default = x.get("dose_default", None)
        try:
            await asyncio.wait_for(
                db.execute_write(
                    """
                    INSERT INTO pillole_farmaci (farmaco, dose_default)
                    VALUES (?, ?)
                    ON CONFLICT(farmaco) DO UPDATE SET dose_default=excluded.dose_default
                    """,
                    [farmaco, dose_default],
                ),
                timeout=DB_OP_TIMEOUT,
            )
        except Exception:
            pass


async def _cache_farmaci_list(datasette):
    """
    Populate datasette._pillole_farmaci so templates can render quickly without hitting DB.
    """
    db = await _get_db(datasette)
    try:
        res = await asyncio.wait_for(
            db.execute(
                """
                SELECT farmaco, dose_default
                FROM pillole_farmaci
                ORDER BY farmaco
                """
            ),
            timeout=DB_OP_TIMEOUT,
        )
        rows = [dict(r) for r in res.rows]
        if rows:
            datasette._pillole_farmaci = rows
            return
    except Exception:
        pass

    # fallback seed
    datasette._pillole_farmaci = _load_farmaci_seed_from_json()


@hookimpl
def startup(datasette):
    async def inner():
        try:
            await _ensure_tables(datasette)
            await _seed_farmaci_defaults(datasette)
            await _cache_farmaci_list(datasette)
        except Exception:
            pass

    return inner


def _coerce_dose(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    s = str(value).strip()
    if not s:
        return None
    try:
        return float(s.replace(",", "."))
    except Exception:
        return None


async def pillole_add(request, datasette):
    """
    POST /-/pillole/add
    Body JSON:
      {"farmaco":"duloxetina", "dose":90, "quando": "...optional..."}

    If quando omitted -> now UTC.
    """
    if request.method != "POST":
        return Response.json({"ok": False, "error": "POST only"}, status=405)

    try:
        body = await request.post_body()
        payload = json.loads(body.decode("utf-8")) if body else {}
    except Exception:
        return Response.json({"ok": False, "error": "Invalid JSON"}, status=400)

    farmaco = str(payload.get("farmaco") or "").strip()
    if not farmaco:
        return Response.json({"ok": False, "error": "Missing farmaco"}, status=400)

    dose = _coerce_dose(payload.get("dose", None))
    quando = str(payload.get("quando") or "").strip() or _now_iso()

    db = await _get_db(datasette)

    try:
        await asyncio.wait_for(
            db.execute_write(
                "INSERT INTO pillole (quando, farmaco, dose) VALUES (?, ?, ?)",
                [quando, farmaco, dose],
            ),
            timeout=DB_OP_TIMEOUT,
        )
    except sqlite3.OperationalError as e:
        return Response.json({"ok": False, "error": str(e)}, status=500)
    except Exception as e:
        return Response.json({"ok": False, "error": str(e)}, status=500)

    return Response.json({"ok": True, "quando": quando, "farmaco": farmaco, "dose": dose})


async def pillole_defaults(request, datasette):
    """
    GET /-/pillole/defaults.json
    """
    db = await _get_db(datasette)
    try:
        res = await asyncio.wait_for(
            db.execute(
                """
                SELECT farmaco, dose_default
                FROM pillole_farmaci
                ORDER BY farmaco
                """
            ),
            timeout=DB_OP_TIMEOUT,
        )
        rows = [dict(r) for r in res.rows]
        if not rows:
            rows = _load_farmaci_seed_from_json()
    except Exception:
        rows = _load_farmaci_seed_from_json()
    return Response.json({"ok": True, "rows": rows})


async def pillole_recent(request, datasette):
    db = await _get_db(datasette)
    try:
        limit = int(request.args.get("limit") or "30")
    except Exception:
        limit = 30
    limit = max(1, min(limit, 500))

    try:
        res = await asyncio.wait_for(
            db.execute(
                """
                SELECT quando, farmaco, dose
                FROM pillole
                ORDER BY quando DESC
                LIMIT ?
                """,
                [limit],
            ),
            timeout=DB_OP_TIMEOUT,
        )
        # Row -> dict (fix del 500 JSON)
        rows = [dict(r) for r in res.rows]
    except Exception:
        rows = []
    return Response.json({"ok": True, "rows": rows})


async def pillole_js(request, datasette):
    """
    Serve custom JS (pillole.js) from static/custom if present, else fallback.
    """
    static_path = os.path.join(BASE_DIR, "static", "custom", "pillole.js")
    try:
        with open(static_path, "r", encoding="utf-8") as f:
            body = f.read()
    except Exception:
        body = "// pillole.js not found"
    return Response.text(body, content_type="application/javascript; charset=utf-8")


@hookimpl
def register_routes():
    return [
        (r"^/-/pillole/add$", pillole_add),
        (r"^/-/pillole/defaults\.json$", pillole_defaults),
        (r"^/-/pillole/recent\.json$", pillole_recent),
        (r"^/-/pillole/pillole\.js$", pillole_js),
    ]


@hookimpl
def extra_template_vars(datasette):
    cached = getattr(datasette, "_pillole_farmaci", None)
    if cached is not None:
        return {"pillole_farmaci": cached}

    seed = _load_farmaci_seed_from_json()
    return {"pillole_farmaci": seed}
