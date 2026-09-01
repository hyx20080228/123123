@echo off
chcp 65001 >nul
title 失落区 LOST ZONE - 启动器
set "DIR=%~dp0"
rem 若脚本位于仓库根目录，自动进入 lostzone 子目录
if exist "%DIR%lostzone\package.json" set "DIR=%DIR%lostzone\"
cd /d "%DIR%"

rem 免安装优先提示
if exist "%DIR%失落区-可玩版.html" (
  echo.
  echo  [提示] 当前目录已有单文件版「失落区-可玩版.html」：
  echo         直接双击它即可开始游戏，无需安装 Node.js。
  echo         如仍要用本地服务器模式，请按任意键继续...
  echo.
  pause >nul
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js。
  echo  方案A（强烈推荐）：双击「失落区-可玩版.html」直接玩。
  echo  方案B：安装 Node.js（免费）后重新运行本脚本：
  echo        https://nodejs.org/zh-cn  （选 LTS 版）
  echo.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo.
  echo  [错误] 找不到游戏文件 package.json。
  echo  请确认：本脚本与 lostzone 文件夹在同一个解压目录里，
  echo  并且没有被单独复制到桌面或其它文件夹。
  echo  目录应为：下载解压的文件夹 - lostzone - 本脚本
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo.
  echo  首次启动，正在安装依赖（约 1-2 分钟）...
  call npm install
  if errorlevel 1 (
    echo  [错误] 依赖安装失败，请检查网络后重试。
    pause
    exit /b 1
  )
)

echo.
echo  ============================================
echo   失落区 LOST ZONE 正在启动...
echo   浏览器将自动打开 http://localhost:5173
echo   关闭本窗口即停止游戏。
echo  ============================================
echo.
start "" "http://localhost:5173"
call npm run dev
pause
