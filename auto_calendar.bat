@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM =========================================================
REM  Auto Calendar + Datasette (HTTPS SAFE)
REM  - Uses venv .venv313
REM  - Rebuilds calendar (output.db + static/custom/calendar_columns.txt)
REM  - Launches Datasette with HTTPS if Tailscale certs exist
REM =========================================================

REM --- Project root (this .bat's folder)
set "ROOT=%~dp0"
pushd "%ROOT%"

REM --- Python venv (always use .venv313)
set "VENV=%ROOT%\.venv313\Scripts\python.exe"
if not exist "%VENV%" (
  echo [ERR] VENV non trovato: %VENV%
  goto :error
)

REM --- Canonical paths
set "DB=%ROOT%\output.db"
set "CUSTOM=%ROOT%\static\custom"
set "CALTXT=%CUSTOM%\calendar_columns.txt"
set "TEMPLATES=%ROOT%\templates"
set "METADATA=%ROOT%\metadata.json"

REM --- Tailscale cert locations (prefer ProgramData; fallback to user PEM if present)
set "TS_CRT=C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.crt"
set "TS_KEY=C:\ProgramData\Tailscale\certs\daniele.tail6b4058.ts.net.key"
set "TS_PEM=C:\Users\seste\daniele.tail6b4058.ts.net.pem"

set "SSL_CERTFILE="
set "SSL_KEYFILE="

if exist "%TS_CRT%" if exist "%TS_KEY%" (
  set "SSL_CERTFILE=%TS_CRT%"
  set "SSL_KEYFILE=%TS_KEY%"
) else (
  REM Optional fallback if you really want to use a combined PEM for other tools.
  if exist "%TS_PEM%" (
    REM Uvicorn/Datasette DO NOT accept a combined PEM directly.
    REM We still leave SSL_* empty here to force HTTP rather than a broken HTTPS.
    echo [WARN] Trovato solo PEM combinato: %TS_PEM% (verra' ignorato)
  )
)

REM --- Build calendar (positional args: DB, TEXT, then options)
echo ========================================================
echo Rigenero calendario…
"%VENV%" "%ROOT%\scripts\build_calendar.py" "%DB%" "%CALTXT%" --base-path "/"
if errorlevel 1 (
  echo [ERR] build_calendar.py fallito.
  goto :error
)
echo [OK] Calendario rigenerato.

REM --- Launch Datasette via helper (always via HTTPS if certs found)
set "DATASETTE_HOST=0.0.0.0"
set "DATASETTE_PORT=8001"

if defined SSL_CERTFILE if defined SSL_KEYFILE (
  echo [INFO] Certificati trovati. Avvio HTTPS.
  "%VENV%" "%ROOT%\scripts\launch_datasette.py" --host "%DATASETTE_HOST%" --port "%DATASETTE_PORT%" --ssl-certfile "%SSL_CERTFILE%" --ssl-keyfile "%SSL_KEYFILE%"
) else (
  echo [WARN] Certificati non trovati. Avvio in HTTP.
  "%VENV%" "%ROOT%\scripts\launch_datasette.py" --host "%DATASETTE_HOST%" --port "%DATASETTE_PORT%"
)

set "EC=%ERRORLEVEL%"
echo.
if %EC% NEQ 0 (
  echo [ERR] Datasette terminato con codice %EC%.
  goto :error
)

echo [FINE] Auto Calendar + Datasette terminato con successo.
echo.
goto :end

:error
echo.
echo FAILED - verifica venv/certs/percorso.
popd
exit /b 1

:end
echo.
echo DONE.
popd
exit /b 0
