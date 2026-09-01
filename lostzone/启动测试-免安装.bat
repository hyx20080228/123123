@echo off
setlocal
title LOST ZONE (No Install)
set "DIR=%~dp0"
cd /d "%DIR%"

rem Prefer the ASCII-named playable file, then the built one
if exist "LostZone-Playable.html" (
  start "" "LostZone-Playable.html"
  goto :done
)
if exist "dist-single\index.html" (
  start "" "dist-single\index.html"
  goto :done
)

echo.
echo  [ERROR] Playable file not found.
echo  Tried:
echo    %DIR%LostZone-Playable.html
echo    %DIR%dist-single\index.html
echo  Please re-download the latest ZIP and keep the whole folder together,
echo  or download "LostZone-Playable.html" from GitHub Releases.
echo.
pause

:done
endlocal
