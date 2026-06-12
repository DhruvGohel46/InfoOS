@echo off
title POS System - Fast Food Shop
echo ========================================
echo    POS System - Fast Food Shop
echo ========================================
echo.

echo Starting Backend Server (including Reminders)...
cd backend
start "POS Backend" cmd /k "python app.py"

echo.
echo Starting Frontend...
cd ../frontend
start "POS Frontend" cmd /k "npm run serve-build"

echo.
echo Both servers are starting...
echo Backend: http://localhost:5050 (with Dashboard Auto-Refresh)
echo Frontend: http://localhost:3050
echo.
echo Dashboard Refresher: Auto-started with backend
echo Auto Refresh: Daily at 12:01 AM
echo Archive: Previous day data stored automatically
echo.
exit /b 0
 