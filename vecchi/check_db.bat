@echo on
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION
pushd "%~dp0"
set "DB=output.db"
where python || (echo [ERRORE] Python non trovato & pause & exit /b 1)
python verify_db.py
echo.
echo [INFO] Fine check. Premi un tasto...
pause >nul
popd
