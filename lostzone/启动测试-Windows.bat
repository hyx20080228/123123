@echo off
chcp 65001 >nul
title LOST ZONE - 本地测试服
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [错误] 未检测到 Node.js。
  echo  请先安装 Node.js（免费）：https://nodejs.org/zh-cn 下载 LTS 版并安装，
  echo  安装完成后重新双击本文件。
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
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
echo   浏览器会自动打开 http://localhost:5173
echo   关闭本窗口即停止游戏。
echo  ============================================
echo.
start "" http://localhost:5173
npm run dev
pause
