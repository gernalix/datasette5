@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ==========================================================
REM  Auto Calendar + Datasette (HTTPS via Python) - SAFE
REM  - Usa SEMPRE .venv313
REM  - Passa CERT_PEM/KEY_PEM allo script Python
REM  - NESSUN uso di ELSE per evitare "... was unexpected ..."
REM ==========================================================

set "ROOT=%~dp0"
pushd "%ROOT%"

echo ==========================================================
echo Avvio Auto Calendar + Datasette (HTTPS via Python - SAFE)
echo Cartella: %ROOT%
echo Porta preferita: 8001
echo ==========================================================

REM --- Python del venv fisso .venv313 ---
set "PY_VENV=%ROOT%\.venv313\Scripts\python.exe"
if not exist "%PY_VENV%" (
  echo ERRORE: venv non trovato: "%PY_VENV%"
  goto :error
)

REM --- Certificati fissi (PEM combinato + KEY) ---
set "CERT_PEM=C:\Users\seste\daniele.tail6b4058.ts.net.pem"
set "KEY_PEM=C:\Users\seste\daniele.tail6b4058.ts.net.key"

if not exist "%CERT_PEM%" (
  echo ERRORE: Certificato PEM combinato non trovato: "%CERT_PEM%"
  echo Crea il PEM con:
  echo   type "C:\Users\seste\daniele.tail6b4058.ts.net.crt" ^> "C:\Users\seste\daniele.tail6b4058.ts.net.pem"
  echo   type "C:\Users\seste\daniele.tail6b4058.ts.net.key" ^>^> "C:\Users\seste\daniele.tail6b4058.ts.net.pem"
  goto :error
)

if not exist "%KEY_PEM%" (
  echo ERRORE: Chiave non trovata: "%KEY_PEM%"
  goto :error
)

REM --- Altre variabili utili (se lo script le legge dall'ambiente) ---
set "PORT=8001"
set "HOST=0.0.0.0"
set "BASE_URL=/"
set "DB=output.db"
set "TEMPLATES=templates"
set "PLUGINS=plugins"
set "METADATA=metadata.json"
set "STATIC_CUSTOM=custom:static/custom"

REM --- Avvio unico: lo script Python gestisce watchdog + Datasette (HTTPS) ---
if exist "scripts\auto_calendar.py" (
  echo ----------------------------------------------------------
  echo Avvio: scripts\auto_calendar.py con HTTPS (CERT_PEM/KEY_PEM)
  "%PY_VENV%" "scripts\auto_calendar.py"
  set "EXITCODE=%ERRORLEVEL%"
  if not "%EXITCODE%"=="0" (
    echo ----------------------------------------------------------
    echo ERRORE: auto_calendar.py terminato con codice %EXITCODE%.
    goto :error
  )
)

if not exist "scripts\auto_calendar.py" (
  echo ERRORE: scripts\auto_calendar.py non trovato. Non posso avviare la dashboard.
  goto :error
)

echo.
echo [FINE] Script terminato.
goto :end

:error
echo.
echo (Premi un tasto per chiudere.)
pause >nul
popd
exit /b 1

:end
echo.
echo (Premi un tasto per chiudere.)
pause >nul
popd
exit /b 0
