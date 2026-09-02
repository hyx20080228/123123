@echo off
chcp 65001 > nul 2>&1

echo ========================================
echo My Story Studio - Installation
echo ========================================
echo.

REM Step 1: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is NOT installed!
    echo.
    echo Please install Node.js v18+ from: https://nodejs.org/
    echo.
    echo IMPORTANT: Check "Automatically add Node.js to system PATH" during installation.
    echo.
    pause
    goto :eof
)

echo Step 1/3: Node.js is OK.
echo Version: 
node --version
echo.

REM Step 2: Set Electron mirror for China
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
echo Using Electron mirror: %ELECTRON_MIRROR%
echo.

REM Step 3: Install dependencies
echo Step 2/3: Installing dependencies...
npm install

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to install dependencies!
    echo.
    echo Try: npm config set registry https://registry.npmjs.org
    echo Then: npm install
    echo.
    pause
    goto :eof
)

echo Step 2/3: Dependencies installed successfully.
echo.

REM Step 4: Build TypeScript
echo Step 3/3: Building TypeScript files...
npm run build

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Build failed!
    echo.
    pause
    goto :eof
)

echo Step 3/3: Build successful.
echo.

echo ========================================
echo Installation Complete!
echo ========================================
echo.
echo To start My Story Studio:
echo   Double-click Start.bat from: %cd%
echo.
pause
