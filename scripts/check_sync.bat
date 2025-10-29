@echo off
REM ====== check_sync.bat (fixed ASCII) ======
REM Uso:
REM   scripts\check_sync.bat [repo_path] [branch] [render_url]
REM Esempi:
REM   scripts\check_sync.bat
REM   scripts\check_sync.bat Z:\download\datasette5 master https://datasette5.onrender.com

setlocal
set REPO=%~1
if "%REPO%"=="" set REPO=.
set BRANCH=%~2
if "%BRANCH%"=="" set BRANCH=master
set RENDER=%~3

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0check_sync.ps1" -RepoPath "%REPO%" -Branch "%BRANCH%" -RenderUrl "%RENDER%"
echo.
pause
