@echo off
title LOST ZONE
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
if exist "node_modules\.bin\vite.cmd" goto run
echo First run: installing dependencies, about 1-2 minutes...
call npm install
if errorlevel 1 goto npmfail
:run
start "" http://localhost:5173
echo Game will open at http://localhost:5173
echo Keep this window open. Close it to stop the game.
call npm run dev
pause
exit /b 0
:nonode
echo [ERROR] Node.js not found.
echo No install needed: double-click LostZone-Playable.html in this folder.
pause
exit /b 1
:npmfail
echo [ERROR] npm install failed. Check network, or run "npm install" here.
pause
exit /b 1
