// LOST ZONE 失落区 · 桌面版主进程
// 启动画面（splash）→ 进入游戏（复用的 Web 单文件版）
// 桌面专属：lza:// 协议提供 1G+ 高清资源包（2K 纹理 / OST / SFX）
const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

// 自定义只读协议：resources/ 目录即桌面资产根（file 相对路径在打包后不可靠）
protocol.registerSchemesAsPrivileged([
  { scheme: 'lza', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

const RES_ROOT = path.join(__dirname, 'resources');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0b0d12',
    title: '失落区 · LOST ZONE',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.loadFile(path.join(__dirname, 'app', 'splash.html'));
  return win;
}

app.whenReady().then(() => {
  // lza://audio/xxx.wav → resources/audio/xxx.wav
  protocol.handle('lza', (req) => {
    try {
      const rel = decodeURIComponent(req.url.slice('lza://'.length));
      const f = path.normalize(path.join(RES_ROOT, rel));
      if (!f.startsWith(RES_ROOT)) return new Response('forbidden', { status: 403 });
      if (!fs.existsSync(f)) return new Response('not found', { status: 404 });
      return net.fetch(pathToFileURL(f).toString());
    } catch (e) {
      return new Response('error', { status: 500 });
    }
  });
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
