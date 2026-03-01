@echo off
echo ========================================
echo   VC ERP - Starting Backend + Frontend
echo ========================================
echo.

set "BACKEND_PY=.venv312\Scripts\python.exe"
if not exist "%~dp0backend\%BACKEND_PY%" set "BACKEND_PY=.venv\Scripts\python.exe"
if not exist "%~dp0backend\%BACKEND_PY%" set "BACKEND_PY=python"

echo [1/2] Starting Backend (port 8000)...
start "VC-ERP Backend" cmd /k "cd /d %~dp0backend && set VON_AUTH_DISABLED=1 && %BACKEND_PY% -m uvicorn main:app --port 8000 --reload"

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
