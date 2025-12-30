# v17
# plugins/pillole_ui.py
# -*- coding: utf-8 -*-

import json
import os
import asyncio
import sqlite3
from datetime import datetime, timezone

from datasette import hookimpl
from datasette.utils.asgi import Response


BASE_DIR = os.path.dirname(os.path.dirname(__file__))

SEED_JSON_CANDIDATES = [
    os.path.join(BASE_DIR, "static", "custom", "pillole_farmaci.json"),
    os.path.join(BASE_DIR, "data", "pillole_farmaci.json"),
]

DB_OP_TIMEOUT = 2.0


def _now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _normalize_seed_payload(data):
    # supporta:
    #  - [ {...}, {...} ]
    #  - { "items": [ {...}, {...} ] }
    if isinstance(data, dict):
        data = data.get("items")

    if not isinstance(data, list):
        return []

    out = []
    for x in data:
        if not isinstance(x, dict):
            continue
        farmaco = str(x.get("farmaco") or "").strip()
        if not farmaco:
            continue
        dose_default = x.get("dose_default", None)
        if isinstance(dose_default, str) and dose_default.strip() == "":
            dose_default = None
        out.append({"farmaco": farmaco, "dose_default": dose_default})
    return out


def _load_farmaci_seed_from_json():
    for path in SEED_JSON_CANDIDATES:
        try:
            if not os.path.exists(path):
                continue
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            out = _normalize_seed_payload(data)
            if out:
                return out
        except Exception:
            pass
    return []


async def _get_db(datasette):
    try:
        return datasette.get_database("output")
    except Exception:
        return datasette.get_database()


async def _ensure_tables(datasette):
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


def _to_float(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip()
        if not s:
            return None
        try:
            return float(s.replace(",", "."))
        except Exception:
            return None
    return None


async def _seed_farmaci_defaults(datasette):
    db = await _get_db(datasette)
    seed = _load_farmaci_seed_from_json()
    if not seed:
        return

    for x in seed:
        try:
            await asyncio.wait_for(
                db.execute_write(
                    """
                    INSERT INTO pillole_farmaci (farmaco, dose_default)
                    VALUES (?, ?)
                    ON CONFLICT(farmaco) DO UPDATE
                    SET dose_default = excluded.dose_default
                    """,
                    [x["farmaco"], _to_float(x.get("dose_default"))],
                ),
                timeout=DB_OP_TIMEOUT,
            )
        except Exception:
            pass


async def _cache_farmaci_list(datasette):
    db = await _get_db(datasette)
    try:
        res = await asyncio.wait_for(
            db.execute(
                "SELECT farmaco, dose_default FROM pillole_farmaci ORDER BY farmaco"
            ),
            timeout=DB_OP_TIMEOUT,
        )
        rows = [dict(r) for r in res.rows]
        if rows:
            datasette._pillole_farmaci = rows
            return
    except Exception:
        pass

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


def _coerce_dose(v):
    return _to_float(v)


async def pillole_add(request, datasette):
    """
    POST /-/pillole/add
    Accetta JSON e form-encoded (compatibile con pillole.js)
    """
    if request.method != "POST":
        return Response.json({"ok": False, "error": "POST only"}, status=405)

    payload = {}

    # prova JSON
    try:
        body = await request.post_body()
        if body:
            payload = json.loads(body.decode("utf-8"))
    except Exception:
        payload = {}

    # fallback form-data / urlencoded
    if not payload:
        try:
            post = await request.post_vars()
            payload = dict(post) if post else {}
        except Exception:
            payload = {}

    farmaco = str(payload.get("farmaco") or "").strip()
    if not farmaco:
        return Response.json({"ok": False, "error": "Missing farmaco"}, status=400)

    dose = _coerce_dose(payload.get("dose"))
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
    except Exception as e:
        return Response.json({"ok": False, "error": str(e)}, status=500)

    return Response.json({"ok": True, "quando": quando})


async def pillole_recent(request, datasette):
    db = await _get_db(datasette)
    limit = min(max(int(request.args.get("limit", 30)), 1), 500)

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
        rows = [dict(r) for r in res.rows]
    except Exception:
        rows = []

    return Response.json({"ok": True, "rows": rows})


async def pillole_defaults(request, datasette):
    db = await _get_db(datasette)
    try:
        res = await asyncio.wait_for(
            db.execute(
                "SELECT farmaco, dose_default FROM pillole_farmaci ORDER BY farmaco"
            ),
            timeout=DB_OP_TIMEOUT,
        )
        rows = [dict(r) for r in res.rows]
    except Exception:
        rows = _load_farmaci_seed_from_json()

    return Response.json({"ok": True, "rows": rows})


async def pillole_js(request, datasette):
    path = os.path.join(BASE_DIR, "static", "custom", "pillole.js")
    try:
        with open(path, "r", encoding="utf-8") as f:
            body = f.read()
    except Exception:
        body = "// pillole.js not found"

    return Response(body, headers={"content-type": "application/javascript; charset=utf-8"})


@hookimpl
def register_routes():
    return [
        (r"^/-/pillole/add$", pillole_add),
        (r"^/-/pillole/recent\.json$", pillole_recent),
        (r"^/-/pillole/defaults\.json$", pillole_defaults),
        (r"^/-/pillole/pillole\.js$", pillole_js),
    ]


@hookimpl
def extra_template_vars(datasette):
    cached = getattr(datasette, "_pillole_farmaci", None)
    if cached is not None:
        return {"pillole_farmaci": cached}
    return {"pillole_farmaci": _load_farmaci_seed_from_json()}
