@echo off
setlocal

cd /d "%~dp0"

set "PYTHON_EXE=.venv\Scripts\python.exe"

if not exist "%PYTHON_EXE%" (
  if exist "..\.python312-embed\python.exe" (
    echo backend\.venv not found. Falling back to embedded Python.
    set "PYTHON_EXE=..\.python312-embed\python.exe"
  ) else (
    echo backend\.venv not found.
    echo Run setup_venv.bat first.
    exit /b 1
  )
)

"%PYTHON_EXE%" -m uvicorn main:app --host 127.0.0.1 --port 8000
