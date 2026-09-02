@echo off
REM ============================================================
REM  LostZone / 失落区  桌面版一键打包 (Windows)
REM  set SIZE=150M && build-release.bat   快速档
REM  build-release.bat                    完整 1GB 档
REM  产物: release\win-unpacked\  (压缩包: LostZone-Desktop-win-x64.zip)
REM ============================================================
chcp 65001 >nul
cd /d "%~dp0"
if "%SIZE%"=="" set SIZE=1G
echo ==================================================
echo  LostZone desktop build  SIZE=%SIZE%
echo ==================================================

echo [1/5] npm install (Electron 约 120MB) ...
call npm install --no-audit --no-fund || goto :fail
if not exist "node_modules\electron\dist\electron.exe" (
  echo  -> Electron 二进制缺失, 补下载...
  cd node_modules\electron
  call node install.js
  cd ..\..
  if not exist "node_modules\electron\dist\electron.exe" (
    echo 错误: Electron 二进制不可用, 请检查网络后重试
    goto :fail
  )
)

echo [2/5] 生成 %SIZE% 高清资源包 ...
python tools\gen_assets.py --size %SIZE%
if errorlevel 1 goto :fail

echo [3/5] 同步游戏本体 ...
call npm run copy:game || goto :fail

echo [4/5] electron-builder 打包 (win dir) ...
call npx electron-builder --win dir --publish never
if errorlevel 1 goto :fail

echo [5/5] 压缩 ...
cd release
powershell -NoProfile -Command "Compress-Archive -Path win-unpacked\* -DestinationPath ..\LostZone-Desktop-win-x64.zip -Force -CompressionLevel Optimal"
cd ..

echo.
echo ==================================================
echo  打包完成
echo  发行包: %cd%\LostZone-Desktop-win-x64.zip
echo  运行:   release\win-unpacked\失落区-LostZone.exe
echo ==================================================
pause
exit /b 0
:fail
echo.
echo 打包失败, 请查看上方错误信息
pause
exit /b 1
