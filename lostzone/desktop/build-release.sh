#!/usr/bin/env bash
# ============================================================
#  失落区 · 桌面版一键打包（Linux / macOS）
#  用法：  SIZE=1G ./build-release.sh          # 完整 1GB 资源包
#         SIZE=150M ./build-release.sh        # 快速 150MB
#  产物：  release/LostZone-Desktop-<平台>-<架构>.zip (约 1.2GB)
# ============================================================
set -euo pipefail
cd "$(dirname "$0")"

SIZE="${SIZE:-1G}"
echo "=================================================="
echo " 失落区 · LOST ZONE  桌面版打包"
echo "   资源包: ${SIZE}  平台: $(uname -s)  $(uname -m)"
echo "=================================================="

# ---------- 1. 安装依赖（Electron 二进制 + electron-builder） ----------
echo "[1/5] 安装依赖 (npm install，首次会下载 Electron ~120MB)..."
npm install --no-audit --no-fund
if [ ! -f node_modules/electron/dist/electron ]; then
  echo "  -> Electron 二进制缺失，尝试补下载..."
  ( cd node_modules/electron && node install.js ) || echo "  !! 若下载失败，请检查网络后重试 npm install"
  [ -f node_modules/electron/dist/electron ] || { echo "错误：Electron 二进制不可用"; exit 1; }
fi
echo "  -> Electron $(node -p "require('electron/package.json').version") 就绪"

# ---------- 2. 生成高清资源包（可复现，固定 seed） ----------
echo "[2/5] 生成 ${SIZE} 高清资源包 (OST/2K纹理/120音效)..."
python3 tools/gen_assets.py --size "${SIZE}"

# ---------- 3. 同步游戏本体 + 注入桌面 OST ----------
echo "[3/5] 同步游戏单文件版并注入桌面增强..."
npm run copy:game

# ---------- 4. electron-builder 打包 ----------
echo "[4/5] electron-builder 打包 (dir)..."
case "$(uname -s)" in
  Linux*)  PLAT='--linux' ;;
  Darwin*) PLAT='--mac' ;;
  *)       PLAT='--linux' ;;   # 其它 POSIX 按 linux 处理
esac
npx electron-builder ${PLAT} dir --publish never

# ---------- 5. 压缩发行包 ----------
echo "[5/5] 压缩 release/..."
cd release
ARCH="$(uname -m)"
ZIP="../LostZone-Desktop-$(uname -s | tr A-Z a-z)-${ARCH}.zip"
rm -f "$ZIP"
zip -qry "$ZIP" .
SIZE_KB=$(du -sk "$ZIP" | cut -f1)
echo ""
echo "=================================================="
echo " ✅ 打包完成"
echo "    发行包: $(pwd)/$ZIP"
echo "    大小:   $((SIZE_KB / 1024)) MB"
echo "    解压后运行:  linux-unpacked/失落区-LostZone  (Windows 为 .exe)"
echo "=================================================="
