# -*- coding: utf-8 -*-
"""
launch_datasette.py
- Runs Datasette via "python -m datasette" (no 'serve' subcommand to avoid CLI parsing issues)
- Binds to 0.0.0.0 so it's reachable via Tailscale hostname
- Loads templates/, static/custom, metadata.json if present
- Enables HTTPS automatically if both key+cert exist (paths can be overridden via env)
"""

import os
import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
OUTPUT_DB = BASE_DIR / "output.db"
TEMPLATES = BASE_DIR / "templates"
STATIC_DIR = BASE_DIR / "static" / "custom"
METADATA = BASE_DIR / "metadata.json"

# Bind to all interfaces for Tailscale reachability
HOST = os.environ.get("DATASETTE_HOST", "0.0.0.0")
PORT = os.environ.get("DATASETTE_PORT", "8001")

SSL_KEY = Path(os.environ.get("DATASETTE_SSL_KEY", r"C:\Users\seste\daniele.tail6b4058.ts.net.key"))
SSL_CRT = Path(os.environ.get("DATASETTE_SSL_CRT", r"C:\Users\seste\daniele.tail6b4058.ts.net.crt"))

def main() -> int:
    py = sys.executable

    if not OUTPUT_DB.exists():
        print(f"[ERR] output.db non trovato: {OUTPUT_DB}", flush=True)
        return 2

    # Build command without 'serve' (datasette treats first args as files to serve)
    cmd = [py, "-m", "datasette", str(OUTPUT_DB),
           "--host", HOST, "--port", PORT,
           "--reload"]

    if TEMPLATES.exists():
        cmd += ["--template-dir", str(TEMPLATES)]
    if STATIC_DIR.exists():
        cmd += ["--static", f"custom:{STATIC_DIR}"]
    if METADATA.exists():
        cmd += ["--metadata", str(METADATA)]

    if SSL_KEY.exists() and SSL_CRT.exists():
        cmd += ["--ssl-keyfile", str(SSL_KEY), "--ssl-certfile", str(SSL_CRT)]

    print("[INFO] Avvio Datasette con comando:", flush=True)
    print("       " + " ".join(f'"{c}"' if " " in c else c for c in cmd), flush=True)

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
