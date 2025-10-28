@echo off
chcp 65001 >nul
title Auto Calendar + Watchdog
cd /d "%~dp0"

rem ===== CONFIG =====
set "HOST=0.0.0.0"
set "PORT=8001"
set "DB=output.db"
set "BASE_PATH=/output"
set "SSL_KEY=C:\Users\seste\daniele.tail6b4058.ts.net.key"
set "SSL_CRT=C:\Users\seste\daniele.tail6b4058.ts.net.crt"
rem ===================

echo ==========================================================
echo Avvio Auto Calendar + Watchdog (Python)
echo Cartella: %cd%
echo ==========================================================
echo.

python scripts\auto_calendar.py ^
  --db "%DB%" ^
  --base-path "%BASE_PATH%" ^
  --host "%HOST%" ^
  --port %PORT% ^
  --ssl-key "%SSL_KEY%" ^
  --ssl-crt "%SSL_CRT%" ^
  --watch-root "."

echo.
echo [auto_calendar.bat] Terminato. Premi un tasto per chiudere...
pause >nul
