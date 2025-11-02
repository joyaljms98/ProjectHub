@echo off
setlocal enabledelayedexpansion
title ProjectHub Launcher
color 0A

echo ===========================================
echo          ProjectHub Setup
echo ===========================================
echo.

set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"
echo Base folder: "%BASE_DIR%"
echo.

:: ------------------------------------------------------
:: Step 0: Ensure Python exists
:: ------------------------------------------------------
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH.
    echo Please install Python 3.x and enable "Add to PATH".
    pause
    exit /b
)
echo [OK] Python found.
echo.

:: ------------------------------------------------------
:: Step 1: Check Ollama
:: ------------------------------------------------------
echo [CHECK] Ollama connection on http://127.0.0.1:11434/ ...
powershell -Command "try { $r = (Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 3); exit 0 } catch { exit 1 }"
if %errorlevel% neq 0 (
    echo [WARN] Ollama not reachable. Please open the Ollama Desktop App.
    echo You can continue without Ollama if you wish.
    choice /c CY /n /m "Press C to Continue, Y to Exit: "
    if errorlevel 2 exit /b
) else (
    echo [OK] Ollama is running.
)
echo.

:: ------------------------------------------------------
:: Step 2: Check MongoDB
:: ------------------------------------------------------
echo [CHECK] MongoDB on mongodb://127.0.0.1:27017 ...
powershell -Command "if ((Test-NetConnection -ComputerName 127.0.0.1 -Port 27017).TcpTestSucceeded) { exit 0 } else { exit 1 }"
if %errorlevel% neq 0 (
    echo [ERROR] MongoDB not reachable. Please start it via Compass or Community Server.
    pause
    exit /b
) else (
    echo [OK] MongoDB is running.
)
echo.

:: ------------------------------------------------------
:: Step 3: Launch RAG backend
:: ------------------------------------------------------
set "RAG_DIR=%BASE_DIR%\python"
set "RAG_SCRIPT=RAG18.py"

if not exist "%RAG_DIR%\%RAG_SCRIPT%" (
    echo [ERROR] RAG script not found: "%RAG_DIR%\%RAG_SCRIPT%"
    pause
    exit /b
)

echo [START] Launching RAG backend...
start "RAG Backend" cmd /k "cd /d "%RAG_DIR%" && echo [RAG] Working in: %%CD%% && python "%RAG_SCRIPT%" || (echo [RAG] Exited with code %%ERRORLEVEL%%. Press any key to retry... && pause >nul && python "%RAG_SCRIPT%")"

echo.

:: ------------------------------------------------------
:: Step 4: Setup & launch FastAPI backend
:: ------------------------------------------------------
set "BACKEND_DIR=%BASE_DIR%\backend"
if not exist "%BACKEND_DIR%" (
    echo [ERROR] Backend folder not found.
    pause
    exit /b
)

echo [SETUP] Preparing FastAPI backend...
cd /d "%BACKEND_DIR%"

if not exist "venv" (
    echo [FastAPI] Creating virtual environment...
    python -m venv venv
) else (
    echo [FastAPI] Virtual environment already exists.
)

echo [START] Launching FastAPI server...
start "FastAPI Backend" cmd /k "cd /d "%BACKEND_DIR%" && echo [FastAPI] Working in: %%CD%% && call venv\Scripts\activate && (if not exist .deps_installed (echo [FastAPI] Installing requirements... && pip install -r requirements.txt && echo ok > .deps_installed) else (echo [FastAPI] Dependencies OK)) && echo [FastAPI] Starting Uvicorn... && uvicorn main:app --host 127.0.0.1 --port 8001 --reload"

echo.

:: ------------------------------------------------------
:: Step 5: Wait and open frontend
:: ------------------------------------------------------
echo Waiting 10 seconds for backends to start...
timeout /t 10 /nobreak >nul

set "FRONTEND_FILE=%BASE_DIR%\frontend\home.html"
if not exist "%FRONTEND_FILE%" (
    echo [ERROR] Frontend file not found: "%FRONTEND_FILE%"
    pause
    exit /b
)

echo [OPEN] Opening "%FRONTEND_FILE%" in Chrome...
set "CHROME_PATH="
for %%I in (
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) do (
  if exist "%%~I" set "CHROME_PATH=%%~I"
)

if defined CHROME_PATH (
  start "" "%CHROME_PATH%" "%FRONTEND_FILE%"
) else (
  start "" "%FRONTEND_FILE%"
)

echo.
echo [SUCCESS] ProjectHub started successfully!
echo --------------------------------------------
echo RAG backend:      http://127.0.0.1:8000/
echo FastAPI backend:  http://127.0.0.1:8001/
echo Frontend:         "%FRONTEND_FILE%"
echo --------------------------------------------
pause
endlocal
exit /b