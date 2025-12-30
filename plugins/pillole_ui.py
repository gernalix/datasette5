# v3
# plugins/pillole_ui.py
# -*- coding: utf-8 -*-

import os
import json
from datetime import datetime

from datasette import hookimpl
from datasette.utils.asgi import Response


BASE_DIR = os.path.dirname(os.path.dirname(__file__))
FARMACI_JSON = os.path.join(BASE_DIR, "static", "custom", "pillole_farmaci.json")


def _load_farmaci():
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


async def _ensure_table(db):
    # 'quando' default is a fallback; inserts are done explicitly in Python
    await db.execute_write(
        """
        CREATE TABLE IF NOT EXISTS pillole (
            quando TEXT NOT NULL,
            farmaco TEXT NOT NULL,
            dose   TEXT
        )
        """
    )
    await db.execute_write(
        "CREATE INDEX IF NOT EXISTS idx_pillole_quando ON pillole(quando)"
    )


@hookimpl
async def startup(datasette):
    db = datasette.get_database()  # default DB
    await _ensure_table(db)


async def pillole_add(request, datasette):
    if request.method != "POST":
        return Response.text("Method Not Allowed", status=405)

    db = datasette.get_database()
    await _ensure_table(db)

    farmaco = ""
    dose = ""
    ct = request.headers.get("content-type", "")
    if "application/json" in ct:
        data = await request.json()
        farmaco = (data.get("farmaco") or "").strip()
        dose = (data.get("dose") or "").strip()
    else:
        form = await request.post_vars()
        farmaco = (form.get("farmaco") or "").strip()
        dose = (form.get("dose") or "").strip()

    if not farmaco:
        return Response.json({"ok": False, "error": "farmaco mancante"}, status=400)

    if dose == "":
        for it in _load_farmaci():
            if it["farmaco"] == farmaco and it["dose_default"]:
                dose = it["dose_default"]
                break

    quando = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")

    await db.execute_write(
        "INSERT INTO pillole (quando, farmaco, dose) VALUES (:quando, :farmaco, :dose)",
        {"quando": quando, "farmaco": farmaco, "dose": dose or None},
    )

    return Response.json(
        {
            "ok": True,
            "row": {"quando": quando, "farmaco": farmaco, "dose": dose},
        }
    )



async def pillole_js(request, datasette):
    # Serve the JS from disk to avoid dependency on --static mounting
    try:
        js_path = os.path.join(BASE_DIR, "static", "custom", "pillole.js")
        with open(js_path, "r", encoding="utf-8") as f:
            body = f.read()
        return Response.text(body, content_type="application/javascript; charset=utf-8")
    except Exception as e:
        return Response.text(
            f"console.error('pillole.js load failed: {e!s}');",
            content_type="application/javascript; charset=utf-8",
            status=500,
        )

async def pillole_recent(request, datasette):
    db = datasette.get_database()
    await _ensure_table(db)

    try:
        limit = int(request.args.get("limit") or 30)
    except Exception:
        limit = 30
    limit = max(1, min(limit, 200))

    res = await db.execute(
        "SELECT quando, farmaco, COALESCE(dose, '') AS dose FROM pillole ORDER BY quando DESC LIMIT ?",
        [limit],
    )
    return Response.json({"ok": True, "rows": list(res.rows)})


@hookimpl
def register_routes():
    return [
        (r"^/-/pillole/add$", pillole_add),
        (r"^/-/pillole/recent\.json$", pillole_recent),
    ]


@hookimpl
def extra_template_vars(datasette):
    return {"pillole_farmaci": _load_farmaci()}
