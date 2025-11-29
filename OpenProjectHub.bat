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

:: =====================================================================
::  (NEW) STEP: SELECT DATABASE MODE  (Merged from Code 1)
:: =====================================================================

set "CONFIG_FILE=%BASE_DIR%\db_config.txt"

if not exist "%CONFIG_FILE%" (
    echo LOCAL_URI=mongodb://127.0.0.1:27017/>"%CONFIG_FILE%"
    echo ATLAS_URI=>>"%CONFIG_FILE%"
)

for /f "usebackq eol=# tokens=1,* delims== " %%K in ("%CONFIG_FILE%") do (
  if not "%%K"=="" set "%%K=%%L"
)

echo ==========================================
echo   Select Database Mode
echo ==========================================
echo   1) Local MongoDB
echo   2) MongoDB Atlas
echo.

set /p CHOICE=Enter choice [1-2]: 

if "%CHOICE%"=="2" (
    if not defined ATLAS_URI (
        echo.
        echo [ERROR] ATLAS_URI not found in db_config.txt
        echo Please paste your Atlas connection string under ATLAS_URI=
        pause
        exit /b 1
    )
    set "MONGO_URI=%ATLAS_URI%"
    set "DB_MODE=ATLAS"
) else (
    set "MONGO_URI=%LOCAL_URI%"
    if not defined MONGO_URI set "MONGO_URI=mongodb://127.0.0.1:27017/"
    set "DB_MODE=LOCAL"
)

echo.
echo Using MONGO_URI:
echo   %MONGO_URI%
echo.

:: =====================================================================
:: Step 0: Ensure Python exists
:: =====================================================================

where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python not found in PATH.
    echo Please install Python 3.x and enable "Add to PATH".
    pause
    exit /b
)
echo [OK] Python found.
echo.

:: =====================================================================
:: Step 1: Check Ollama
:: =====================================================================

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

:: =====================================================================
:: Step 2: Check MongoDB  (SKIPPED in ATLAS MODE)
:: =====================================================================

if "%DB_MODE%"=="ATLAS" (
    echo [SKIP] Local MongoDB check (Atlas mode selected)
) else (
    echo [CHECK] MongoDB on mongodb://127.0.0.1:27017 ...
    powershell -Command "if ((Test-NetConnection -ComputerName 127.0.0.1 -Port 27017).TcpTestSucceeded) { exit 0 } else { exit 1 }"
    if %errorlevel% neq 0 (
        echo [ERROR] MongoDB not reachable. Please start it via Compass or Community Server.
        pause
        exit /b
    ) else (
        echo [OK] MongoDB is running.
    )
)
echo.

:: =====================================================================
:: Step 3: Launch RAG backend (unchanged except MONGO_URI now inherited)
:: =====================================================================

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

:: =====================================================================
:: Step 4: Setup & launch FastAPI backend  (unchanged except MONGO_URI available)
:: =====================================================================

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
    echo [FastAPI] Checking virtual environment...
    venv\Scripts\python --version >nul 2>&1
    if errorlevel 1 (
        echo [FastAPI] Virtual environment appears corrupted or incompatible. Recreating...
        rmdir /s /q venv
        python -m venv venv
    ) else (
        echo [FastAPI] Virtual environment is valid.
    )
)

echo [START] Launching FastAPI server...
start "FastAPI Backend" cmd /k "cd /d "%BACKEND_DIR%" && echo [FastAPI] Working in: %%CD%% && call venv\Scripts\activate && echo [FastAPI] Checking dependencies... && pip install -r requirements.txt && echo [FastAPI] Starting Uvicorn... && uvicorn main:app --host 127.0.0.1 --port 8001 --reload"

echo.

:: =====================================================================
:: Step 5: Wait and open frontend (unchanged)
:: =====================================================================

echo Waiting for FastAPI backend to start...
:WAIT_LOOP
timeout /t 2 /nobreak >nul
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://127.0.0.1:8001/' -UseBasicParsing -TimeoutSec 1; if ($r.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }"
if %errorlevel% neq 0 goto WAIT_LOOP

echo [FastAPI] Backend is ready!

set "FRONTEND_URL=http://127.0.0.1:8000/home.html"

echo [OPEN] Opening %FRONTEND_URL% in Chrome...
set "CHROME_PATH="
for %%I in (
  "C:\Program Files\Google\Chrome\Application\chrome.exe"
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
) do (
  if exist "%%~I" set "CHROME_PATH=%%~I"
)

if defined CHROME_PATH (
  start "" "%CHROME_PATH%" "%FRONTEND_URL%"
) else (
  start "" "%FRONTEND_URL%"
)

echo.
echo [SUCCESS] ProjectHub started successfully!
echo --------------------------------------------
echo DB Mode:          %DB_MODE%
echo Mongo URI:        %MONGO_URI%
echo RAG backend:      http://127.0.0.1:8000/
echo FastAPI backend:  http://127.0.0.1:8001/
echo Frontend:         %FRONTEND_URL%
echo --------------------------------------------
pause
endlocal
exit /b
