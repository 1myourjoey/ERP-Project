@echo off
setlocal

cd /d "%~dp0"

echo [1/4] Creating virtual environment (.venv) with global Python...
python -m venv .venv
if errorlevel 1 (
  echo Failed to create .venv. Check that "python" works in this terminal.
  exit /b 1
)

echo [2/4] Activating .venv...
call .venv\Scripts\activate
if errorlevel 1 (
  echo Failed to activate .venv.
  exit /b 1
)

echo [3/4] Upgrading pip...
python -m pip install -U pip
if errorlevel 1 (
  echo Failed to upgrade pip.
  exit /b 1
)

echo [4/4] Installing backend requirements...
python -m pip install -r requirements.txt
if errorlevel 1 (
  echo Failed to install requirements.
  exit /b 1
)

echo.
echo Done. Backend is now using backend\.venv
echo Run server with: run_backend.bat
exit /b 0

