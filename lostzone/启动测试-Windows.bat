@echo off
setlocal
title LOST ZONE Launcher
set "DIR=%~dp0"

rem Support running from repo root as well as from lostzone/
if exist "%DIR%lostzone\package.json" set "DIR=%DIR%lostzone\"
cd /d "%DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERROR] Node.js not found.
  echo  Option A (no install needed): double-click "LostZone-Playable.html"
  echo         or "dist-single\index.html" in this folder to play.
  echo  Option B: install Node.js LTS from https://nodejs.org/zh-cn
  echo         then run this file again.
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo.
  echo  [ERROR] package.json not found.
  echo  Please keep this .bat together with the lostzone folder inside the
  echo  same unzipped directory. Do NOT copy the .bat out on its own.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\.bin\vite.cmd" (
  echo.
  echo  First run: installing dependencies, about 1-2 minutes...
  call npm install
  if errorlevel 1 (
    echo  [ERROR] npm install failed. Check your network connection,
    echo         or open a terminal here and run:  npm install
    pause
    exit /b 1
  )
  if not exist "node_modules\.bin\vite.cmd" (
    echo  [ERROR] vite still not found after install.
    echo  Open a terminal here and run:  npm install
    pause
    exit /b 1
  )
)

echo.
echo  ============================================
echo    LOST ZONE is starting...
echo    The game will open at http://localhost:5173
echo    Keep this window open. Close it to stop.
echo  ============================================
echo.

rem open the browser 3 seconds later, then keep the server in this window
start "" /b cmd /c "timeout /t 3 /nobreak >nul && start http://localhost:5173"
call npm run dev

echo.
echo  Server stopped.
pause
endlocal
