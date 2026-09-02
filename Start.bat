@echo off
chcp 65001 > nul 2>&1

echo ========================================
echo My Story Studio - Starting
echo ========================================
echo.

REM Check if path contains Chinese characters
set "current_path=%cd%"
echo Current directory: %current_path%
echo.

echo %current_path% | findstr /r "[\x80-\xff]" > nul
if %errorlevel% equ 0 (
    echo ERROR: Path contains Chinese characters!
    echo.
    echo Electron cannot load files from paths with Chinese characters.
    echo.
    echo Please move the project to an English path like:
    echo   C:\Projects\my-story-studio
    echo.
    echo Then run Start.bat from there.
    echo.
    pause
    goto :eof
)

REM Step 1: Check directory
if not exist "package.json" (
    echo ERROR: package.json not found!
    echo.
    echo You are NOT in the My Story Studio project directory.
    echo.
    pause
    goto :eof
)

REM Step 2: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is NOT installed!
    echo.
    echo Install Node.js v18+ from: https://nodejs.org/
    echo.
    pause
    goto :eof
)

echo Step 1/3: Node.js is OK.
echo Version: 
node --version
echo.

REM Step 3: Check dependencies
if not exist "node_modules\electron" (
    echo Step 2/3: Dependencies not found, installing...
    echo.
    set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
    npm install
    
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Failed to install dependencies!
        echo.
        pause
        goto :eof
    )
    echo Step 2/3: Dependencies installed.
    echo.
) else (
    echo Step 2/3: Dependencies found.
    echo.
)

REM Step 4: Set Electron mirror
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/

REM Step 5: Build TypeScript
if not exist "dist\main\index.js" (
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
) else (
    echo Step 3/3: Already built.
    echo.
)

REM Check if HTML file exists
if not exist "dist\renderer\index.html" (
    echo ERROR: dist/renderer/index.html not found!
    echo.
    echo Check if build succeeded: npm run build
    echo.
    pause
    goto :eof
)

echo Starting My Story Studio...
echo.
npx electron .

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start!
    echo.
    pause
)
