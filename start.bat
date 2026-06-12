@echo off
:: 1. Start the Python Backend
echo [1/2] Starting Python Backend...
cd /d "%~dp0\backend"
start /b "" python app.py > nul 2>&1

:: 2. Start the Frontend
echo [2/2] Starting Frontend Server...
cd /d "%~dp0\frontend"
start /b "" cmd /c "npm run serve-build" > nul 2>&1

exit /b 0
