@echo off
echo ===================================================
echo [1/3] Running Black Formatter on Backend...
echo ===================================================
cd backend
call .venv\Scripts\python -m black .
set BLACK_EXIT=%errorlevel%
cd ..
if %BLACK_EXIT% neq 0 (
    echo [ERROR] Black formatting failed!
    exit /b %BLACK_EXIT%
)

echo ===================================================
echo [2/3] Running Backend Pytest...
echo ===================================================
cd backend
call .venv\Scripts\python -m pytest
set PYTEST_EXIT=%errorlevel%
cd ..
if %PYTEST_EXIT% neq 0 (
    echo [ERROR] Backend pytest failed!
    exit /b %PYTEST_EXIT%
)

echo ===================================================
echo [3/3] Running Frontend Playwright E2E Tests...
echo ===================================================
call npx playwright test
if %errorlevel% neq 0 (
    echo [ERROR] Playwright E2E tests failed!
    exit /b %errorlevel%
)

echo ===================================================
echo SUCCESS: All formats and tests passed!
echo ===================================================
