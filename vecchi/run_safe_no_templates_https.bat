@echo on
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
title Datasette HTTPS (SAFE) - NO templates/custom

pushd "%~dp0"
set "DB=output.db"
set "HOST=0.0.0.0"
set "PORT=8001"
set "CERT=C:\Users\seste\daniele.tail6b4058.ts.net.crt"
set "KEY=C:\Users\seste\daniele.tail6b4058.ts.net.key"

where python || (echo [ERRORE] Python non trovato & pause & exit /b 1)
python -c "import datasette,sys;print('Datasette',datasette.__version__)" || (echo [INFO] Installo Datasette... & python -m pip install -U datasette)

echo [INFO] Avvio Datasette (SAFE) su https://daniele.tail6b4058.ts.net:%PORT%/  (senza templates/custom)
python -m datasette "%DB%" ^
  --host %HOST% ^
  --port %PORT% ^
  --reload ^
  --ssl-certfile "%CERT%" ^
  --ssl-keyfile "%KEY%" ^
  --setting base_url / ^
  --setting allow_facet on

echo. & echo [INFO] CHIUSURA (SAFE). Premi un tasto...
pause >nul
popd
