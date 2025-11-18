
# -*- coding: utf-8 -*-
"""Simple file browser for Datasette.

Espone /files/ per navigare i dischi C: e Z:
direttamente dal browser (ad esempio via Tailscale da telefono).
"""
import os
import posixpath
import urllib.parse

from datasette import hookimpl
from datasette.utils.asgi import Response, AsgiFileDownload

# Mappa le lettere di drive ai path reali su Windows
DRIVES = {
    "C": "C:\\",
    "Z": "Z:\\",
}


def _safe_join(base, rel_path):
    """Join base and rel_path assicurandosi di restare dentro base.

    Ritorna (full_path, normalized_rel) dove normalized_rel
    usa sempre '/' e non ha slash iniziali/finali.
    """
    rel_path = (rel_path or "").replace("\\", "/")
    rel_path = rel_path.strip("/")

    parts = []
    for part in rel_path.split("/"):
        if not part or part == ".":
            continue
        if part == "..":
            # Ignora tentativi di risalire fuori dalla root
            continue
        parts.append(part)

    full_path = base
    for part in parts:
        full_path = os.path.join(full_path, part)

    norm_base = os.path.normcase(os.path.abspath(base))
    norm_full = os.path.normcase(os.path.abspath(full_path))
    if not norm_full.startswith(norm_base):
        raise PermissionError("Percorso fuori dal drive consentito")

    normalized_rel = "/".join(parts)
    return full_path, normalized_rel


@hookimpl
def register_routes(datasette):
    """Registra le route:
    - /files/           -> scelta disco
    - /files/C/         -> root di C:
    - /files/C/dir/...  -> sottocartelle e file
    """
    return [
        (r"^/files/?$", files_root),
        (r"^/files/(?P<drive>[A-Za-z])(?:/(?P<path>.*))?$", file_browser),
    ]


async def files_root(datasette, request):
    """Pagina root: scelta del disco da esplorare."""
    drives = []
    for letter, base in DRIVES.items():
        if os.path.exists(base):
            drives.append(
                {
                    "name": f"{letter}:",
                    "url": f"/files/{letter}/",
                }
            )

    html = await datasette.render_template(
        "file_browser.html",
        {
            "mode": "root",
            "drives": drives,
            "drive": None,
            "display_path": "",
            "dirs": [],
            "files": [],
            "parent_url": None,
        },
        request=request,
    )
    return Response.html(html)


async def file_browser(datasette, request, send):
    """Esplora un drive/percorso specifico o scarica un file."""
    drive = request.url_vars.get("drive", "").upper()
    base = DRIVES.get(drive)
    if base is None:
        raise datasette.NotFound("Drive non consentito")

    rel_path = request.url_vars.get("path") or ""
    rel_path = urllib.parse.unquote(rel_path)

    try:
        full_path, normalized_rel = _safe_join(base, rel_path)
    except PermissionError as ex:
        raise datasette.Forbidden(str(ex))

    if os.path.isdir(full_path):
        try:
            entries = sorted(os.listdir(full_path), key=str.lower)
        except PermissionError:
            entries = []

        dirs = []
        files = []
        for name in entries:
            if name.startswith("."):
                continue

            child_full = os.path.join(full_path, name)
            child_rel = (
                posixpath.join(normalized_rel, name) if normalized_rel else name
            )
            encoded_rel = urllib.parse.quote(child_rel)
            child_url = f"/files/{drive}/{encoded_rel}"

            if os.path.isdir(child_full):
                dirs.append({"name": name, "url": child_url + "/"})
            else:
                files.append({"name": name, "url": child_url})

        parent_url = None
        if normalized_rel:
            parent_rel = posixpath.dirname(normalized_rel)
            if parent_rel:
                parent_url = f"/files/{drive}/{urllib.parse.quote(parent_rel)}/"
            else:
                parent_url = f"/files/{drive}/"

        html = await datasette.render_template(
            "file_browser.html",
            {
                "mode": "dir",
                "drive": drive,
                "display_path": full_path,
                "dirs": dirs,
                "files": files,
                "parent_url": parent_url,
            },
            request=request,
        )
        response = Response.html(html)
        await response.asgi_send(send)
        return

    # Se è un file, lo streammiamo al client
    download = AsgiFileDownload(full_path)
    await download.asgi_send(send)
    # Nessun ritorno: abbiamo già risposto via send()
