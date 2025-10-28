# -*- coding: utf-8 -*-
# Auto-regenerate calendar on DB/TXT change and restart Datasette (Windows) — PATCHED
# Requirements: pip install watchdog
import time, subprocess, os, sys, threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

PROJECT_DIR = r"Z:\\download\\datasette5"
DB_PATH     = os.path.join(PROJECT_DIR, "output.db")
TXT_PATH    = os.path.join(PROJECT_DIR, "static", "custom", "calendar_columns.txt")
BUILD_CMD   = [sys.executable, os.path.join(PROJECT_DIR, "scripts", "build_calendar.py"), DB_PATH, TXT_PATH, "--base-path", "/output"]
RESTART_BAT = os.path.join(PROJECT_DIR, "run_datasette_https_plus_checks.bat")
RUN_LOG     = os.path.join(PROJECT_DIR, "run.log")

DEBOUNCE_SECONDS = 1.0
RETRY_BUILD = 5
RETRY_SLEEP = 1.0

_last_event_ts = 0.0
_busy = False

def log(msg: str):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), msg, flush=True)

def safe_norm(p: str) -> str:
    return os.path.normcase(os.path.abspath(p))

WATCH_ALLOW = {safe_norm(DB_PATH), safe_norm(TXT_PATH)}

def build_calendar():
    for i in range(RETRY_BUILD):
        try:
            log("📅 Rigenero calendario...")
            r = subprocess.run(BUILD_CMD, check=True, capture_output=True, text=True)
            if r.stdout:
                print(r.stdout)
            if r.stderr:
                print(r.stderr, file=sys.stderr)
            log("✅ Calendario rigenerato con successo.")
            return True
        except Exception as e:
            log(f"[ERRORE] Build fallita (tentativo {i+1}/{RETRY_BUILD}): {e}")
            time.sleep(RETRY_SLEEP)
    return False

def kill_previous_datasette():
    # Best-effort: kill processes started by previous run (python launch_datasette.py or datasette.exe)
    ps = "$patterns = @('launch_datasette.py','datasette.exe');" \
         "Get-WmiObject Win32_Process | Where-Object { " \
         "$n = $_.Name; $c = $_.CommandLine; " \
         "($n -like '*python*' -or $n -like '*datasette*') -and ($c -match ($patterns -join '|')) } " \
         "| ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } catch {} }"
    try:
        subprocess.run(["powershell", "-NoProfile", "-Command", ps], check=False, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        time.sleep(1.0)
    except Exception as e:
        log(f"[WARN] Stop Datasette fallito: {e}")

def restart_datasette():
    kill_previous_datasette()
    log("🔄 Riavvio Datasette...")
    creation = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
    try:
        subprocess.Popen([RESTART_BAT], cwd=PROJECT_DIR, creationflags=creation)
    except Exception as e:
        log(f"[ERRORE] Avvio Datasette fallito: {e}")

class Handler(FileSystemEventHandler):
    def on_modified(self, event):
        global _last_event_ts, _busy
        now = time.time()
        if now - _last_event_ts < DEBOUNCE_SECONDS:
            return
        _last_event_ts = now

        if event.is_directory:
            return
        target = safe_norm(event.src_path)
        if target not in WATCH_ALLOW:
            return

        if _busy:
            return
        _busy = True
        try:
            if build_calendar():
                restart_datasette()
            else:
                log("❌ Impossibile rigenerare il calendario, salto il riavvio.")
        finally:
            _busy = False

def main():
    for p in WATCH_ALLOW:
        if not os.path.exists(p):
            log(f"[WARN] File non trovato: {p}")

    observer = Observer()
    observer.schedule(Handler(), PROJECT_DIR, recursive=False)
    observer.start()
    log("👂 In ascolto su output.db e calendar_columns.txt ... (CTRL+C per uscire)")
    try:
        while True:
            time.sleep(60)
    except KeyboardInterrupt:
        observer.stop()
    observer.join()

if __name__ == "__main__":
    main()
