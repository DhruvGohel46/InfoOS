@echo off
title POS System - Development Server
echo ========================================
echo    POS System - Development Server
echo ========================================
echo.

echo Starting Development Backend Server...
cd /d "%~dp0\backend"
start "POS Dev Backend" cmd /k "python app.py --port 5049"

echo.
echo Starting Development Frontend...
cd /d "%~dp0\frontend"
start "POS Dev Frontend" cmd /k "set PORT=3049&& set REACT_APP_API_URL=http://localhost:5049&& set BROWSER=none&& npm start"

echo.
echo Both development servers are starting...
echo Backend: http://localhost:5049
echo Frontend: http://localhost:3049
echo.
exit /b 0
