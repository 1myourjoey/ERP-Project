@echo off
REM =========================================
REM   VC ERP - Full Regression Test Script
REM =========================================

echo.
echo [1/4] Backend: running pytest
echo -----------------------------------------
set PY=python
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 set PY=%~dp0.python312-embed\python.exe
cd /d %~dp0backend
"%PY%" -m pytest tests/ -v --tb=short
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Backend tests failed.
    exit /b 1
)
echo [OK] Backend tests passed.

echo.
echo [2/4] Backend: API consistency check
echo -----------------------------------------
"%PY%" scripts/check_api_consistency.py
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] API consistency mismatch detected.
)

echo.
echo [3/4] Frontend: TypeScript build
echo -----------------------------------------
cd /d %~dp0frontend
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [FAIL] Frontend build failed.
    exit /b 1
)
echo [OK] Frontend build passed.

echo.
echo [4/4] Frontend: ESLint
echo -----------------------------------------
call npx eslint src/ --ext .ts,.tsx --max-warnings 0
if %ERRORLEVEL% NEQ 0 (
    echo [WARN] ESLint warnings/errors detected.
)

echo.
echo =========================================
echo   [DONE] Full regression checks complete
echo =========================================
