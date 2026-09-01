#!/usr/bin/env bash
# 失落区 LOST ZONE - 一键启动（macOS / Linux）
cd "$(dirname "$0")"

command -v node >/dev/null 2>&1 || {
  echo "[错误] 未检测到 Node.js，请先安装: https://nodejs.org/zh-cn"
  exit 1
}

[ -d node_modules ] || {
  echo "首次启动，正在安装依赖..."
  npm install || { echo "[错误] 依赖安装失败"; exit 1; }
}

echo ""
echo "============================================"
echo "  失落区 LOST ZONE 正在启动..."
echo "  浏览器将打开 http://localhost:5173"
echo "  按 Ctrl+C 停止。"
echo "============================================"
echo ""

( sleep 2; open "http://localhost:5173" 2>/dev/null || xdg-open "http://localhost:5173" 2>/dev/null || true ) &
npm run dev
