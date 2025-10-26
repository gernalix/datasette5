@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem =========================
rem Datasette HTTPS launcher with table formatting checks
rem =========================

rem ---- Config ----
set "DB=output.db"
set "HOST=0.0.0.0"
set "PORT=8001"
set "TEMPLATES=templates"
set "STATIC=static"
set "CUSTOM_SUB=custom"
set "METADATA=metadata.json"
set "PLUGINS=plugins"

rem Force HTTPS with your cert/key
set "USE_HTTPS=1"
set "SSL_CERT=C:\Users\seste\daniele.tail6b4058.ts.net.crt"
set "SSL_KEY=C:\Users\seste\daniele.tail6b4058.ts.net.key"

rem ---- Derived paths ----
for /f "tokens=1-3 delims=/ " %%a in ("%date%") do (
  set "YYYY=%date:~-4%"
  set "MM=%%b"
  set "DD=%%c"
)
for /f "tokens=1-3 delims=:." %%h in ("%time%") do (
  set "HH=%%h"
  set "NN=%%i"
  set "SS=%%j"
)
set "LOGDIR=logs"
if not exist "%LOGDIR%" mkdir "%LOGDIR%"
set "LOG=%LOGDIR%\datasette_%YYYY%-%MM%-%DD%_%HH%-%NN%-%SS%.log"

echo ==== Datasette HTTPS launcher at %date% %time% ==== > "%LOG%"
echo Working dir: %cd% >> "%LOG%"

rem ---- Checks ----
if not exist "%DB%" (
  echo [ERROR] Database not found: "%DB%". >> "%LOG%"
  echo Database not found: "%DB%". See "%LOG%".
  exit /b 1
)

set "STATIC_CUSTOM=%STATIC%\%CUSTOM_SUB%"
set "HAD_ERROR=0"

set "EXPECT1=%STATIC_CUSTOM%\format_overrides.js"
set "EXPECT2=%STATIC_CUSTOM%\format_overrides.css"
set "EXPECT3=%TEMPLATES%\base.html"

for %%F in ("%EXPECT1%" "%EXPECT2%" "%EXPECT3%") do (
  if not exist "%%~F" (
    echo [WARN] Missing expected asset: "%%~F" >> "%LOG%"
    set "HAD_ERROR=1"
  ) else (
    echo [OK] Found asset: "%%~F" >> "%LOG%"
  )
)

set "PLUGIN_FLAG="
if exist "%PLUGINS%" (
  set PLUGIN_FLAG=--plugins-dir "%PLUGINS%"
  echo [OK] Using plugins dir: "%PLUGINS%" >> "%LOG%"
) else (
  echo [INFO] Plugins dir not found; continuing without it. >> "%LOG%"
)

set "META_FLAG="
if exist "%METADATA%" (
  set META_FLAG=--metadata "%METADATA%"
  echo [OK] Using metadata: "%METADATA%" >> "%LOG%"
) else (
  echo [INFO] metadata.json not found; continuing without it. >> "%LOG%"
)

set "TEMPLATE_FLAG="
if exist "%TEMPLATES%" (
  set TEMPLATE_FLAG=--template-dir "%TEMPLATES%"
  echo [OK] Using templates dir: "%TEMPLATES%" >> "%LOG%"
) else (
  echo [WARN] templates dir not found; custom includes may not load. >> "%LOG%"
  set "HAD_ERROR=1"
)

set "STATIC_FLAG="
if exist "%STATIC_CUSTOM%" (
  set STATIC_FLAG=--static custom:"%STATIC_CUSTOM%"
  echo [OK] Serving static custom: "%STATIC_CUSTOM%" >> "%LOG%"
) else (
  echo [ERROR] Static custom folder missing: "%STATIC_CUSTOM%". >> "%LOG%"
  set "HAD_ERROR=1"
)

set "SSL_FLAGS="
if "%USE_HTTPS%"=="1" (
  if not exist "%SSL_CERT%" (
    echo [ERROR] SSL cert not found: "%SSL_CERT%". >> "%LOG%"
    set "HAD_ERROR=1"
  )
  if not exist "%SSL_KEY%" (
    echo [ERROR] SSL key not found: "%SSL_KEY%". >> "%LOG%"
    set "HAD_ERROR=1"
  )
  set SSL_FLAGS=--ssl-certfile "%SSL_CERT%" --ssl-keyfile "%SSL_KEY%"
  echo [OK] HTTPS enabled. >> "%LOG%"
)

if "%HAD_ERROR%"=="1" (
  powershell -NoProfile -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.Popup('Missing assets or SSL files. Check ' + (Resolve-Path '%LOG%'), 8, 'Datasette launcher', 48)"
)

echo Running: datasette "%DB%" --host %HOST% --port %PORT% %SSL_FLAGS% %TEMPLATE_FLAG% %STATIC_FLAG% %META_FLAG% %PLUGIN_FLAG% >> "%LOG%"
echo Starting Datasette (HTTPS=%USE_HTTPS%)... see "%LOG%" for details.
echo.

datasette "%DB%" --host %HOST% --port %PORT% %SSL_FLAGS% %TEMPLATE_FLAG% %STATIC_FLAG% %META_FLAG% %PLUGIN_FLAG% >> "%LOG%" 2>&1

set "ERRLVL=%ERRORLEVEL%"
if not "%ERRLVL%"=="0" (
  echo [ERROR] Datasette exited with code %ERRLVL%. >> "%LOG%"
  echo Datasette exited with code %ERRLVL%. See "%LOG%".
  exit /b %ERRLVL%
)

endlocal
