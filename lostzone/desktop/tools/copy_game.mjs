// 将 Web 单文件版复制为桌面版游戏页，并注入桌面增强（OST 自动播放；无 desktop API 时静默跳过）
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', '..', 'dist-single', 'index.html');
const dst = path.join(here, '..', 'app', 'index.html');
if (!existsSync(src)) { console.error('[copy_game] 未找到 dist-single/index.html,请先在 lostzone/ 运行 npm run build:single'); process.exit(1); }
copyFileSync(src, dst);
let html = readFileSync(dst, 'utf8');
const inject = `<script>/* desktop-only */try{if(window.desktop){var __b=function(){window.desktop.playBgm(1)};if(document.readyState==='complete')__b();else window.addEventListener('load',__b);}}catch(e){}</script>`;
if (!html.includes('/* desktop-only */')) {
  html = html.includes('</body>') ? html.replace('</body>', inject + '\n</body>') : html + inject;
  writeFileSync(dst, html);
}
console.log('[copy_game] ok ->', dst, `(${(html.length / 1024).toFixed(0)} KB, desktop injection: ${html.includes('/* desktop-only */')})`);
