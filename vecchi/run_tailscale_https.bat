@echo on
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
title Datasette HTTPS (NORMAL) - templates + custom

pushd "%~dp0"
set "DB=output.db"
set "HOST=0.0.0.0"
set "PORT=8001"
set "CERT=C:\Users\seste\daniele.tail6b4058.ts.net.crt"
set "KEY=C:\Users\seste\daniele.tail6b4058.ts.net.key"
set "TEMPLATES=%CD%\templates"
set "CUSTOM=%CD%\custom"

where python || (echo [ERRORE] Python non trovato & pause & exit /b 1)
python -c "import datasette,sys;print('Datasette',datasette.__version__)" || (echo [INFO] Installo Datasette... & python -m pip install -U datasette)

echo [INFO] Avvio Datasette (NORMAL) su https://daniele.tail6b4058.ts.net:%PORT%/
python -m datasette "%DB%" ^
  --host %HOST% ^
  --port %PORT% ^
  --reload ^
  --ssl-certfile "%CERT%" ^
  --ssl-keyfile "%KEY%" ^
  --template-dir "%TEMPLATES%" ^
  --static custom:"%CUSTOM%" ^
  --setting base_url / ^
  --setting allow_facet on

echo. & echo [INFO] CHIUSURA (NORMAL). Premi un tasto...
pause >nul
popd
