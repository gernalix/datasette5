# v12
# plugins/pillole_ui.py
# -*- coding: utf-8 -*-

import json
import os
from datetime import datetime, timezone
import asyncio
import sqlite3

from datasette import hookimpl
from datasette.utils.asgi import Response


# This file is used ONLY to seed the DB the first time.
BASE_DIR = os.path.dirname(os.path.dirname(__file__))  # project root
FARMACI_JSON = os.path.join(BASE_DIR, "static", "custom", "pillole_farmaci.json")

PILLOLE_JS = os.path.join(BASE_DIR, "static", "custom", "pillole.js")

DB_NAME = "output"  # derived from output.db

# Hard timeout (seconds) to avoid hanging UI if SQLite is locked/busy
DB_OP_TIMEOUT = 2.5



def _utc_now_iso_no_ms():
    # SQLite + JS friendly ISO without milliseconds, UTC
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


async def _ensure_tables(db):
    await db.execute_write(
        """
        CREATE TABLE IF NOT EXISTS pillole (
            id INTEGER PRIMARY KEY,
            quando TEXT NOT NULL,
            farmaco TEXT NOT NULL,
            dose TEXT
        )
        """
    )
    await db.execute_write(
        "CREATE INDEX IF NOT EXISTS idx_pillole_quando ON pillole(quando)"
    )
    await db.execute_write(
        """
        CREATE TABLE IF NOT EXISTS pillole_farmaci (
            farmaco TEXT PRIMARY KEY,
            dose_default TEXT
        )
        """
    )


def _load_farmaci_seed_from_json():
    try:
        with open(FARMACI_JSON, "r", encoding="utf-8") as f:
            data = json.load(f)
        items = data.get("items") or []
        out = []
        for it in items:
            farmaco = (it.get("farmaco") or "").strip()
            if not farmaco:
                continue
            out.append(
                {
                    "farmaco": farmaco,
                    "dose_default": (it.get("dose_default") or "").strip(),
                }
            )
        return out
    except Exception:
        return []


async def _seed_farmaci_if_needed(db):
    # Seed only once: if table empty.
    row = await db.execute("SELECT COUNT(*) AS c FROM pillole_farmaci")
    if (row.first() or {}).get("c", 0) > 0:
        return

    seed = _load_farmaci_seed_from_json()
    if not seed:
        return

    def _do(conn):
        conn.executemany(
            "INSERT OR REPLACE INTO pillole_farmaci(farmaco, dose_default) VALUES (?, ?)",
            [(x["farmaco"], x.get("dose_default", "")) for x in seed],
        )

    await db.execute_write_fn(_do)


async def _load_farmaci_from_db(db):
    res = await db.execute(
        "SELECT farmaco, COALESCE(dose_default,'') AS dose_default FROM pillole_farmaci ORDER BY lower(farmaco)"
    )
    return list(res.rows)


async def _get_db(datasette):
    # Prefer output DB; fall back to default if name differs
    try:
        return datasette.get_database(DB_NAME)
    except Exception:
        return datasette.get_database()


@hookimpl
async def startup(datasette):
    # Non-blocking startup: never do DB writes that could hang the server.
    async def _bg():
        try:
            db = await _get_db(datasette)
            await _ensure_tables(db)
            await _seed_farmaci_if_needed(db)
            datasette._pillole_farmaci = await _load_farmaci_from_db(db)  # type: ignore[attr-defined]
        except Exception as e:
            # Don't crash Datasette if seeding fails; log and continue.
            try:
                datasette.logger.exception("pillole_ui startup background task failed")
            except Exception:
                pass

    try:
        asyncio.create_task(_bg())
    except Exception:
        # If no running loop, just skip seeding; it will happen lazily on first request.
        pass



PILLOLE_JS = os.path.join(BASE_DIR, "static", "custom", "pillole.js")


async def pillole_js(request, datasette):
    try:
        with open(PILLOLE_JS, "r", encoding="utf-8") as f:
            body = f.read()
    except Exception:
        body = "// pillole.js missing\n"
    return Response.text(body, headers={"content-type": "application/javascript; charset=utf-8"})

async def pillole_add(request, datasette):
    if request.method != "POST":
        return Response.text("Method Not Allowed", status=405)

    db = await _get_db(datasette)

    # Datasette 0.65.x Request does not expose a raw body helper we can rely on across versions.
    # To avoid "403 Unknown content-type", the frontend posts as application/x-www-form-urlencoded,
    # so we can always parse via post_vars().
    try:
        form = await request.post_vars()
    except Exception as e:
        return Response.json({"ok": False, "error": f"bad request: {e!s}"}, status=400)

    farmaco = (form.get("farmaco") or "").strip()
    dose_val = form.get("dose", None)

    if not farmaco:
        return Response.json({"ok": False, "error": "farmaco missing"}, status=400)

    dose = "" if dose_val is None else str(dose_val).strip()
    quando = _utc_now_iso_no_ms()

    async def _insert_once():
        await db.execute_write(
            "INSERT INTO pillole(quando, farmaco, dose) VALUES (?, ?, ?)",
            [quando, farmaco, dose],
        )

    # Try insert; if table missing on a fresh DB, create it once and retry.
    try:
        await asyncio.wait_for(_insert_once(), timeout=DB_OP_TIMEOUT)
    except sqlite3.OperationalError as e:
        msg = str(e).lower()
        if "no such table" in msg:
            try:
                await asyncio.wait_for(_ensure_tables(db), timeout=DB_OP_TIMEOUT)
                await asyncio.wait_for(_insert_once(), timeout=DB_OP_TIMEOUT)
            except Exception:
                return Response.json({"ok": False, "error": "db busy/locked (ensure/insert)"}, status=503)
        else:
            return Response.json({"ok": False, "error": f"db error: {e!s}"}, status=500)
    except Exception:
        return Response.json({"ok": False, "error": "db busy/locked (insert)"}, status=503)

    return Response.json({"ok": True, "row": {"quando": quando, "farmaco": farmaco, "dose": dose}})


async def pillole_recent(request, datasette):
    db = await _get_db(datasette)
    try:
        limit = int(request.args.get("limit") or "30")
    except Exception:
        limit = 30
    limit = max(1, min(limit, 500))

    # IMPORTANT: never do DB writes on this GET endpoint.
    # If tables are missing (first run) or the DB is busy/locked,
    # return an empty result rather than hanging.
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
        rows = list(res.rows)
    except Exception as e:
        # Don't hang the UI: return empty rows but also include a hint for debugging.
        rows = []
    return Response.json({"ok": True, "rows": rows})


@hookimpl
def register_routes():
    return [
        (r"^/-/pillole/add$", pillole_add),
        (r"^/-/pillole/recent\.json$", pillole_recent),
        (r"^/-/pillole/pillole\.js$", pillole_js),
    ]


@hookimpl
def extra_template_vars(datasette):
    # Prefer cached DB-backed list (populated by background startup task).
    cached = getattr(datasette, "_pillole_farmaci", None)
    if cached is not None:
        return {"pillole_farmaci": cached}

    # Fallback: show seed list even if DB seeding hasn't happened yet.
    seed = _load_farmaci_seed_from_json()
    return {"pillole_farmaci": seed}
