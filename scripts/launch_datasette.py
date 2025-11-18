# -*- coding: utf-8 -*-
"""
launch_datasette.py
- Runs Datasette via "python -m datasette"
- Binds to 0.0.0.0 so it's reachable via Tailscale hostname
- Loads templates/, static/custom, metadata.json if present
- Enables HTTPS when both --ssl-certfile and --ssl-keyfile are passed
"""

import os
import sys
import subprocess
from pathlib import Path
import argparse

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DB = BASE_DIR / "output.db"
TEMPLATES = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static" / "custom"
METADATA = BASE_DIR / "metadata.json"
PLUGINS = BASE_DIR / "plugins"

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", default="8001")
    ap.add_argument("--ssl-certfile", default="")
    ap.add_argument("--ssl-keyfile", default="")
    args = ap.parse_args()

    cmd = [
        sys.executable, "-m", "datasette", str(OUTPUT_DB),
        "--host", args.host,
        "--port", str(args.port),
        "--setting", "base_url", "/",
    ]

    if TEMPLATES.exists():
        cmd += ["--template-dir", str(TEMPLATES)]
    if STATIC_DIR.exists():
        cmd += ["--static", f"custom:{STATIC_DIR}"]
    if METADATA.exists():
        cmd += ["--metadata", str(METADATA)]
    if PLUGINS.exists():
        cmd += ["--plugins-dir", str(PLUGINS)]

    https = False
    if args.ssl_certfile and args.ssl_keyfile:
        # Uvicorn-compatible flags for TLS
        cmd += ["--ssl-certfile", args.ssl_certfile, "--ssl-keyfile", args.ssl_keyfile]
        https = True

    print("[INFO] Avvio Datasette con comando:", flush=True)
    print("       " + " ".join(f'"{c}"' if (" " in c and not c.startswith("--")) else c for c in cmd), flush=True)
    print(f"[INFO] Modalita': {'HTTPS' if https else 'HTTP'} (host={args.host} port={args.port})", flush=True)

    try:
        return subprocess.call(cmd)
    except FileNotFoundError as e:
        print(f"[ERR] Datasette non trovato. Installa con: pip install datasette\nDettagli: {e!r}", flush=True)
        return 3
    except Exception as e:
        print(f"[ERR] Eccezione avvio Datasette: {e!r}", flush=True)
        return 4

if __name__ == "__main__":
    raise SystemExit(main())