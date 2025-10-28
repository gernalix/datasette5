#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
auto_calendar.py + notifiche toast (Windows 11)
"""
import argparse, os, sys, time, subprocess
from datetime import datetime
from pathlib import Path

try:
    from win10toast import ToastNotifier
    toaster = ToastNotifier()
except Exception:
    toaster = None

def now():
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def log(level, *msg):
    print(f"{now()} {level:<5}", *msg, flush=True)

def toast(message, ok=True):
    """Mostra una notifica toast su Windows 10/11"""
    if not toaster:
        return
    title = "Datasette Watchdog"
    if ok:
        toaster.show_toast(title, message, icon_path=None, duration=5, threaded=True)
    else:
        toaster.show_toast(title + " - Errore", message, icon_path=None, duration=8, threaded=True)

def build_calendar(root: Path, db: Path, base_path: str):
    py = root / "scripts" / "build_calendar.py"
    cols = root / "static" / "custom" / "calendar_columns.txt"
    if not (py.exists() and db.exists() and cols.exists()):
        log("INFO", "File build_calendar.py/DB/columns mancanti: salto rigenerazione.")
        return True
    log("INFO", "Rigenero calendario…")
    try:
        cmd = [sys.executable, str(py), str(db), str(cols), "--base-path", base_path]
        p = subprocess.run(cmd, capture_output=True, text=True)
        if p.stdout:
            print(p.stdout, end="", flush=True)
        if p.stderr:
            print(p.stderr, end="", file=sys.stderr, flush=True)
        if p.returncode == 0:
            log("INFO", "Calendario rigenerato con successo.")
            return True
        else:
            log("ERROR", f"build_calendar.py exited {p.returncode}")
            return False
    except Exception as e:
        log("ERROR", f"build_calendar.py: {e}")
        return False

def start_datasette(db: Path, host: str, port: int, ssl_key: Path, ssl_crt: Path):
    args = [sys.executable, "-m", "datasette", str(db), "--host", host, "--port", str(port)]

    # === Carica risorse UI ===
    root = Path(".").resolve()
    metadata = root / "metadata.json"
    templates_dir = root / "templates"
    static_custom = root / "static" / "custom"
    if metadata.exists():
        args += ["--metadata", str(metadata)]
    if templates_dir.exists():
        args += ["--template-dir", str(templates_dir)]
    if static_custom.exists():
        args += ["--static", f"custom:{static_custom}"]

    proto = "http"
    if ssl_key.exists() and ssl_crt.exists():
        args += ["--ssl-keyfile", str(ssl_key), "--ssl-certfile", str(ssl_crt)]
        proto = "https"
        log("INFO", "Certificati trovati: HTTPS attivo")
    else:
        log("WARN", "Certificati mancanti: HTTP semplice")

    log("INFO", "Avvio Datasette…")
    try:
        proc = subprocess.Popen(args)
        time.sleep(0.9)
        if proc.poll() is not None:
            log("ERROR", f"Datasette terminato subito. ExitCode: {proc.returncode}")
            toast(f"Errore avvio Datasette (exit {proc.returncode})", ok=False)
        else:
            log("INFO", f"Datasette in esecuzione su: {proto}://{host}:{port}/")
            toast(f"Dashboard attiva su {proto}://{host}:{port}/", ok=True)
        return proc
    except Exception as e:
        log("ERROR", f"Start-Datasette: {e}")
        toast(f"Errore: {e}", ok=False)
        return None

def stop_datasette(proc):
    if proc and proc.poll() is None:
        log("INFO", f"Arresto Datasette PID {proc.pid}…")
        try:
            proc.terminate()
            try:
                proc.wait(timeout=2)
            except subprocess.TimeoutExpired:
                proc.kill()
        except Exception:
            pass

def snapshot_tree(root: Path):
    snap = {}
    for dirpath, _, filenames in os.walk(root):
        parts = Path(dirpath).parts
        if any(p.startswith(".") for p in parts):
            continue
        for fn in filenames:
            p = Path(dirpath) / fn
            try:
                snap[str(p)] = int(p.stat().st_mtime)
            except OSError:
                pass
    return snap

def detect_changes(prev, curr):
    if prev is None or len(prev) != len(curr):
        return True
    for k, v in curr.items():
        if k not in prev or prev[k] != v:
            return True
    return False

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", default="output.db")
    ap.add_argument("--base-path", default="/output")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--port", type=int, default=8001)
    ap.add_argument("--ssl-key", default="")
    ap.add_argument("--ssl-crt", default="")
    ap.add_argument("--watch-root", default=".")
    ap.add_argument("--debounce-ms", type=int, default=1500)
    ap.add_argument("--poll-ms", type=int, default=700)
    args = ap.parse_args()

    root = Path(".").resolve()
    watch_root = (root / args.watch_root).resolve()
    db = (root / args.db).resolve()
    ssl_key = Path(args.ssl_key) if args.ssl_key else Path("no.key")
    ssl_crt = Path(args.ssl_crt) if args.ssl_crt else Path("no.crt")

    log("INFO", f"Avvio watchdog in {root}")
    if not db.exists():
        log("WARN", f"Database non trovato: {db}")

    build_calendar(root, db, args.base_path)
    proc = start_datasette(db, args.host, args.port, ssl_key, ssl_crt)

    last_snap = snapshot_tree(watch_root)
    pending_since = None
    try:
        while True:
            snap = snapshot_tree(watch_root)
            if detect_changes(last_snap, snap):
                if pending_since is None:
                    pending_since = time.time()
                else:
                    log("NOTE", "Modifiche rilevate… (in attesa di quiet period)")
            last_snap = snap

            if pending_since and (time.time() - pending_since) * 1000 >= args.debounce_ms:
                build_calendar(root, db, args.base_path)
                stop_datasette(proc)
                proc = start_datasette(db, args.host, args.port, ssl_key, ssl_crt)
                pending_since = None
                last_snap = snapshot_tree(watch_root)

            time.sleep(args.poll_ms / 1000.0)
    except KeyboardInterrupt:
        log("INFO", "Interruzione richiesta (CTRL+C).")
    finally:
        stop_datasette(proc)
        toast("Watchdog arrestato manualmente", ok=False)
        log("INFO", "Uscita watchdog.")

if __name__ == "__main__":
    main()
