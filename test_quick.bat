@echo off
REM Quick check: backend tests + frontend build
echo [Quick Check] Backend tests...
set PY=python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 set PY=%~dp0.python312-embed\python.exe
cd /d %~dp0backend
"%PY%" -m pytest tests/ -q --tb=line
if %ERRORLEVEL% NEQ 0 exit /b 1

echo.
echo [Quick Check] Frontend build...
cd /d %~dp0frontend
call npm run build --silent
if %ERRORLEVEL% NEQ 0 exit /b 1

echo.
echo Done.
