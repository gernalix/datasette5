@echo off
setlocal EnableExtensions EnableDelayedExpansion

REM =========================================================
REM  Auto Calendar + Datasette WATCH
REM  - Lancia watch_datasette.ps1
REM  - Il .ps1 si occupa di:
REM      * rigenerare il calendario
REM      * avviare Datasette (HTTP/HTTPS)
REM      * monitorare la cartella del progetto (incluse sottocartelle)
REM      * riavviare la dashboard ad ogni modifica
REM      * inviare un toast su Windows 11 ad ogni avvio riuscito
REM =========================================================

REM Cartella del progetto = cartella di questo .bat
set "ROOT=%~dp0"
pushd "%ROOT%"

echo =========================================================
echo  Avvio Auto Calendar + Datasette in modalita' WATCH
echo  Root progetto: %ROOT%
echo =========================================================
echo.

REM -----------------------------------------------------------------
REM  PULIZIA: termina eventuali vecchie istanze di Python legate a
REM  questo progetto (percorsi che contengono "datasette5").
REM  Questo evita che un vecchio server sulla stessa porta resti vivo.
REM -----------------------------------------------------------------
echo [CLEANUP] Termino eventuali vecchie istanze Python di datasette5...
powershell.exe -NoProfile -ExecutionPolicy Bypass ^
  -Command "Get-Process python -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '*datasette5*' } | Stop-Process -Force" ^
  >NUL 2>&1

echo [CLEANUP] Completato.
echo.

REM Esegui lo script PowerShell che fa tutto il lavoro
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%watch_datasette.ps1"
set "EC=%ERRORLEVEL%"

echo.
echo Watcher terminato con codice di uscita %EC%.

popd
exit /b %EC%
