@echo off
chcp 65001 >nul
title 失落区 LOST ZONE - 免安装启动
set "DIR=%~dp0"
if exist "%DIR%失落区-可玩版.html" (
  start "" "%DIR%失落区-可玩版.html"
  exit /b 0
)
if exist "%DIR%dist-single\index.html" (
  start "" "%DIR%dist-single\index.html"
  exit /b 0
)
echo.
echo  [错误] 未找到可玩版文件。
echo  请确认「失落区-可玩版.html」（或 dist-single\index.html）
echo  与本脚本在同一目录，并且没有被移动到别处。
echo.
pause
