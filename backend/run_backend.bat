@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE=python"
if exist ".venv312\pyvenv.cfg" (
  set "PYTHON_EXE=.venv312\Scripts\python.exe"
) else if exist ".venv\pyvenv.cfg" (
  set "PYTHON_EXE=.venv\Scripts\python.exe"
)
if not exist "%PYTHON_EXE%" (
  if exist "..\.python312-embed\python.exe" (
    echo backend virtualenv not found. Falling back to embedded Python.
    set "PYTHON_EXE=..\.python312-embed\python.exe"
  ) else (
    echo backend virtualenv not found.
    echo Run setup_venv.bat first.
    exit /b 1
  )
)

set "VON_AUTH_DISABLED=1"
"%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000
