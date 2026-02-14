@echo off
setlocal

cd /d "%~dp0"

if not exist "node_modules" (
  echo node_modules not found. Installing dependencies...
  npm install
  if errorlevel 1 (
    echo npm install failed.
    exit /b 1
  )
)

npm run dev -- --host 127.0.0.1 --port 5173

