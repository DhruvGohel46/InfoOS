@echo off
title InfoOS - Stop Servers
echo ========================================
echo    InfoOS - Modern POS & Billing System
echo               [ STOPPING ]
echo ========================================
echo.

echo Stopping Python Backend...
:: Forcefully stops the Python backend server
taskkill /f /im python.exe >nul 2>&1

echo Stopping Frontend Server...
:: Forcefully stops the Node process running the frontend
taskkill /f /im node.exe >nul 2>&1

echo.
echo ========================================
echo  InfoOS Servers Stopped Successfully!
echo ========================================
echo.
exit /b 0
