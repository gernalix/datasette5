@echo off
setlocal ENABLEDELAYEDEXPANSION
title Audit Datasette + Watcher
cd /d "%~dp0.."

echo ==========================================================
echo Avvio Audit + Watcher (Python)
echo Cartella: %cd%
echo ==========================================================

IF EXIST ".venv\Scripts\activate.bat" (
  call ".venv\Scripts\activate.bat"
)

REM Avvia watcher (rigenera custom\audit.html ad ogni cambio di output.db)
start "audit_watch" cmd /c python -u "scripts\audit_watch.py"

REM Avvia Datasette con metadata.json su 127.0.0.1:8001
start "datasette" cmd /c datasette "output.db" --metadata "metadata.json" --port 8001 --host 127.0.0.1 --cors --inspect-file inspect.json --setting default_page_size 50

timeout /t 2 >nul
start "" "http://127.0.0.1:8001/output/audit"
start "" "http://127.0.0.1:8001/custom/audit.html"

endlocal
