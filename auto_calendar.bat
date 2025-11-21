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
echo Avvio Auto Calendar + Datasette in modalita' WATCH
echo Root progetto: %ROOT%
echo =========================================================
echo.

REM Esegui lo script PowerShell che fa tutto il lavoro
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%watch_datasette.ps1"
set "EC=%ERRORLEVEL%"

echo.
echo Watcher terminato con codice di uscita %EC%.

popd
exit /b %EC%
