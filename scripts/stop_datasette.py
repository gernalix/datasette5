# -*- coding: utf-8 -*-
"""
stop_datasette.py
- Legge 'datasette.pid' nella cartella progetto
- Se il processo esiste: lo termina (taskkill /PID <pid> /F /T su Windows)
- Rimuove 'datasette.pid' se il processo non esiste più
"""

import os
import sys
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parents[1]
PID_FILE = BASE_DIR / "datasette.pid"

def pid_running(pid: int) -> bool:
    # Usa 'tasklist' su Windows senza dipendenze esterne
    try:
        out = subprocess.check_output(["tasklist", "/FI", f"PID eq {pid}"], text=True, creationflags=0x08000000)
        return str(pid) in out
    except Exception:
        return False

def main() -> int:
    if not PID_FILE.exists():
        print("[INFO] Nessun PID file trovato: nulla da fermare.")
        return 0
    try:
        pid = int(PID_FILE.read_text(encoding="utf-8").strip())
    except Exception:
        print("[WARN] PID file corrotto, lo elimino.")
        PID_FILE.unlink(missing_ok=True)
        return 0

    if not pid_running(pid):
        print(f"[INFO] Processo {pid} non è in esecuzione. Rimuovo PID file.")
        PID_FILE.unlink(missing_ok=True)
        return 0

    print(f"[INFO] Arresto Datasette (PID {pid})...")
    try:
        # /T per killare eventuali figli, /F forza
        subprocess.call(["taskkill", "/PID", str(pid), "/F", "/T"])
    except Exception as e:
        print(f"[ERR] taskkill fallito: {e!r}")
        return 1

    if not pid_running(pid):
        print("[OK] Datasette terminato. Rimuovo PID file.")
        PID_FILE.unlink(missing_ok=True)
        return 0
    else:
        print("[ERR] Il processo sembra ancora attivo.")
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
