@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM =========================================================
REM  Auto Calendar + Datasette (HTTPS SAFE) — FINAL
REM  - Positional args to build_calendar.py
REM  - Absolute static mount: --static custom:"Z:\download\datasette5\static\custom"
REM  - Conditional flags for templates/plugins/metadata
REM  - ASCII only
REM =========================================================

REM --- Project root
set "ROOT=%~dp0"
pushd "%ROOT%"

REM --- Python venv
set "PY=%ROOT%\.venv313\Scripts\python.exe"
if not exist "%PY%" (
  echo ERROR: Python venv not found: %PY%
  goto :error
)

REM --- Params
set "HOST=0.0.0.0"
set "PORT=8001"
set "BASE_URL=/"
set "DB=output.db"
set "LIST_PATH=static\custom\calendar_columns.txt"

REM --- Absolute static dir
set "STATIC_DIR=%ROOT%static\custom"

REM --- Optional HTTPS
set "SSL_KEY=%ROOT%ssl\server-key.pem"
set "SSL_CRT=%ROOT%ssl\server-crt.pem"
set "USE_HTTPS=0"
if exist "%SSL_KEY%" if exist "%SSL_CRT%" set "USE_HTTPS=1"

echo =========================================================
echo Start Auto Calendar + Datasette (HTTPS SAFE)
echo Folder: %ROOT%
echo Port:   %PORT%
echo BaseURL:%BASE_URL%
echo Static: %STATIC_DIR%
echo =========================================================

REM --- 1) Build calendar (positional args expected by your script)
if exist "%ROOT%scripts\build_calendar.py" (
  echo Running build_calendar.py
  echo   DB:        %ROOT%%DB%
  echo   LIST_PATH: %ROOT%%LIST_PATH%
  echo   BASE_URL:  %BASE_URL%
  "%PY%" "%ROOT%scripts\build_calendar.py" "%ROOT%%DB%" "%ROOT%%LIST_PATH%" --base-path "%BASE_URL%"
  if errorlevel 1 (
    echo WARN: build_calendar.py returned code %ERRORLEVEL%
  ) else (
    echo OK: calendar build completed
  )
) else (
  echo NOTE: scripts\build_calendar.py not found, skipping calendar build
)

REM --- 2) Conditional flags
set "TEMPLATES_FLAG="
if exist "%ROOT%templates" set "TEMPLATES_FLAG=--template-dir templates"

set "PLUGINS_FLAG="
if exist "%ROOT%plugins" set "PLUGINS_FLAG=--plugins-dir plugins"

set "METADATA_FLAG="
if exist "%ROOT%metadata.json" set "METADATA_FLAG=--metadata metadata.json"

REM --- 3) Build Datasette command with absolute static mount
set "CMD=%PY% -m datasette "%DB%" --host %HOST% --port %PORT% --setting base_url %BASE_URL% --static custom:""%STATIC_DIR%"" %TEMPLATES_FLAG% %PLUGINS_FLAG% %METADATA_FLAG%"

if "%USE_HTTPS%"=="1" (
  set "CMD=%CMD% --ssl-key "%SSL_KEY%" --ssl-cert "%SSL_CRT%""
  echo HTTPS enabled
) else (
  echo HTTPS not enabled (ssl key/cert not found)
)

echo.
echo Starting Datasette...
echo %CMD%
cmd /c %CMD%

echo.
echo Links:
echo   Audit standalone: http://localhost:%PORT%/-/static/custom/audit/Audit.html
echo   Audit (base_url /output): http://localhost:%PORT%/output/-/static/custom/audit/Audit.html
echo   Pages redirect (if present): http://localhost:%PORT%/-/pages/audit
echo.
goto :end

:error
echo.
echo FAILED - check venv or paths.
popd
exit /b 1

:end
echo.
echo DONE.
popd
exit /b 0
