@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem =========================
rem Datasette HTTPS launcher with asset checks
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
set "OPEN_BROWSER=1"

rem ---- Force HTTPS ----
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

echo ==== Datasette HTTPS launcher started at %date% %time% ==== > "%LOG%"
echo Working dir: %cd% >> "%LOG%"

rem ---- Basic checks ----
if not exist "%DB%" (
  echo [ERROR] Database not found: "%DB%". >> "%LOG%"
  echo Database not found: "%DB%".
  exit /b 1
)

set "STATIC_CUSTOM=%STATIC%\%CUSTOM_SUB%"
set "HAD_ERROR=0"

rem ---- Expected assets ----
set "EXPECT1=%STATIC_CUSTOM%\desktop.css"
set "EXPECT2=%STATIC_CUSTOM%\mobile.css"
set "EXPECT3=%STATIC_CUSTOM%\click_to_filter.js"
set "EXPECT4=%STATIC_CUSTOM%\date_range_filter.js"
set "EXPECT5=%TEMPLATES%\base.html"

for %%F in ("%EXPECT1%" "%EXPECT2%" "%EXPECT3%" "%EXPECT4%" "%EXPECT5%") do (
  if not exist "%%~F" (
    echo [WARN] Missing expected asset: "%%~F" >> "%LOG%"
    set "HAD_ERROR=1"
  ) else (
    echo [OK] Found asset: "%%~F" >> "%LOG%"
  )
)

rem ---- Optional flags ----
set "PLUGIN_FLAG="
if exist "%PLUGINS%" (
  set PLUGIN_FLAG=--plugins-dir "%PLUGINS%"
  echo [OK] Using plugins dir: "%PLUGINS%" >> "%LOG%"
)

set "META_FLAG="
if exist "%METADATA%" (
  set META_FLAG=--metadata "%METADATA%"
  echo [OK] Using metadata: "%METADATA%" >> "%LOG%"
)

set "TEMPLATE_FLAG="
if exist "%TEMPLATES%" (
  set TEMPLATE_FLAG=--template-dir "%TEMPLATES%"
  echo [OK] Using templates dir: "%TEMPLATES%" >> "%LOG%"
)

set "STATIC_FLAG="
if exist "%STATIC_CUSTOM%" (
  set STATIC_FLAG=--static custom:"%STATIC_CUSTOM%"
  echo [OK] Serving static custom: "%STATIC_CUSTOM%" >> "%LOG%"
)

rem ---- HTTPS flags ----
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
  echo [OK] HTTPS mode enabled. >> "%LOG%"
)

if "%HAD_ERROR%"=="1" (
  powershell -NoProfile -Command "$wshell = New-Object -ComObject WScript.Shell; $wshell.Popup('Some assets or SSL files missing. Check ' + (Resolve-Path '%LOG%'), 8, 'Datasette HTTPS launcher', 48)"
)

rem ---- Launch Datasette ----
echo Running: datasette "%DB%" --host %HOST% --port %PORT% %SSL_FLAGS% %TEMPLATE_FLAG% %STATIC_FLAG% %META_FLAG% %PLUGIN_FLAG% >> "%LOG%"
echo Starting Datasette over HTTPS... see "%LOG%" for details.
echo.

datasette "%DB%" --host %HOST% --port %PORT% %SSL_FLAGS% %TEMPLATE_FLAG% %STATIC_FLAG% %META_FLAG% %PLUGIN_FLAG% >> "%LOG%" 2>&1

set "ERRLVL=%ERRORLEVEL%"
if not "%ERRLVL%"=="0" (
  echo [ERROR] Datasette exited with code %ERRLVL%. >> "%LOG%"
  echo Datasette exited with code %ERRLVL%. See "%LOG%" for details.
  exit /b %ERRLVL%
)

if "%OPEN_BROWSER%"=="1" (
  start "" "https://127.0.0.1:%PORT%/output"
)

echo ==== Datasette stopped at %date% %time% ==== >> "%LOG%"
endlocal
