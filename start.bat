@echo off
title InfoOS - Modern POS & Billing System
echo ========================================
echo    InfoOS - Modern POS & Billing System
echo ========================================
echo.

cd backend
:: Run Python in the background and redirect output so it doesn't print here
start /b python app.py > nul 2>&1

echo.
echo Starting Frontend...
cd ../frontend
:: Run NPM in the background and redirect output
start /b npm run serve-build > nul 2>&1

echo.
echo Both servers are starting...
echo Backend: http://localhost:5050 (with Dashboard Auto-Refresh)
echo Frontend: http://localhost:3050
echo.
exit /b 0
 