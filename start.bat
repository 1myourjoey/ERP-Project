@echo off
echo ========================================
echo   VC ERP - Starting Backend + Frontend
echo ========================================
echo.

set "BACKEND_PY=python"
if exist "%~dp0backend\.venv312\pyvenv.cfg" (
  set "BACKEND_PY=.venv312\Scripts\python.exe"
) else if exist "%~dp0backend\.venv\pyvenv.cfg" (
  set "BACKEND_PY=.venv\Scripts\python.exe"
)

echo [1/2] Starting Backend (port 8000)...
start "VC-ERP Backend" cmd /k "cd /d %~dp0backend && set VON_AUTH_DISABLED=1 && %BACKEND_PY% -m uvicorn main:app --port 8000 --reload --reload-dir . --reload-exclude=.venv/* --reload-exclude=.venv312/* --reload-exclude=__pycache__/* --reload-exclude=uploads/* --reload-exclude=chroma_data/*"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend (port 5173)...
start "VC-ERP Frontend" cmd /k "cd /d %~dp0frontend && set VITE_AUTH_DISABLED=true && npm run dev"

echo.
echo ========================================
echo   Backend:  http://localhost:8000
echo   Frontend: http://localhost:5173
echo   API Docs: http://localhost:8000/docs
echo ========================================
echo.
echo Both servers started in separate windows.
echo Close this window anytime.
