@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM ================================================
REM  Auto Calendar + Datasette HTTPS via Python SAFE
REM  - Niente --build-only (lo script non lo supporta)
REM  - Avvio UNICO: solo scripts\auto_calendar.py
REM  - Passo --ssl-key / --ssl-crt allo script
REM  - Usa .venv313
REM ================================================

set "ROOT=%~dp0"
pushd "%ROOT%"

echo ================================================
echo Avvio Auto Calendar + Datasette HTTPS via Python SAFE
echo Cartella %ROOT%
echo Porta 8001
echo ================================================

REM Python del venv fisso
set "PY_VENV=%ROOT%\.venv313\Scripts\python.exe"
if exist "%PY_VENV%" goto :venv_ok
echo ERRORE venv non trovato %PY_VENV%
goto :error

:venv_ok
REM Certificati fissi (usa PEM combinato per compatibilita')
set "SSL_KEY=C:\Users\seste\daniele.tail6b4058.ts.net.key"
set "SSL_CRT=C:\Users\seste\daniele.tail6b4058.ts.net.pem"

if exist "%SSL_KEY%" goto :key_ok
echo ERRORE chiave non trovata %SSL_KEY%
goto :error

:key_ok
if exist "%SSL_CRT%" goto :crt_ok
echo ERRORE certificato PEM combinato non trovato %SSL_CRT%
echo Crea il PEM con:
echo   type "C:\Users\seste\daniele.tail6b4058.ts.net.crt" ^> "C:\Users\seste\daniele.tail6b4058.ts.net.pem"
echo   type "C:\Users\seste\daniele.tail6b4058.ts.net.key" ^>^> "C:\Users\seste\daniele.tail6b4058.ts.net.pem"
goto :error

:crt_ok
REM Parametri passati allo script (usa il suo argparse)
set "HOST=0.0.0.0"
set "PORT=8001"
set "BASEPATH=/"

if exist "scripts\auto_calendar.py" goto :run_script
echo ERRORE scripts\auto_calendar.py non trovato
goto :error

:run_script
echo Avvio scripts\auto_calendar.py con HTTPS
"%PY_VENV%" "scripts\auto_calendar.py" --host "%HOST%" --port "%PORT%" --base-path "%BASEPATH%" --ssl-key "%SSL_KEY%" --ssl-crt "%SSL_CRT%"
if "%ERRORLEVEL%"=="0" goto :end
echo ERRORE auto_calendar.py terminato con codice %ERRORLEVEL%
goto :error

:error
echo.
echo Premi un tasto per chiudere
pause >nul
popd
exit /b 1

:end
echo.
echo Terminato. Premi un tasto per chiudere
pause >nul
popd
exit /b 0
