@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_CMD=py -3.12"
%PYTHON_CMD% --version >nul 2>&1
if errorlevel 1 (
  set "PYTHON_CMD=python"
)

echo [1/4] Creating virtual environment (.venv312)...
%PYTHON_CMD% -m venv .venv312
if errorlevel 1 (
  echo Failed to create .venv312. Check that Python 3.12 is installed.
  exit /b 1
)

echo [2/4] Activating .venv312...
call .venv312\Scripts\activate
if errorlevel 1 (
  echo Failed to activate .venv312.
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
echo Done. Backend is now using backend\.venv312
echo Run server with: run_backend.bat
exit /b 0
