// ============ 入口 ============
import { Application } from 'pixi.js';
import { generateWorld } from './world/mapgen';
import { loadSave, storeSave, charById } from './game/state';
import { Ui } from './ui/ui';
import { Game } from './game/game';
import { sfx } from './audio/sfx';

// 全局错误可见化：运行期任何异常都会显示错误面板
function installGlobalErrorUi() {
  const show = (msg: string) => {
    const existing = document.getElementById('error-overlay');
    if (existing) existing.remove();
    const div = document.createElement('div');
    div.id = 'error-overlay';
    div.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.92)';
    div.innerHTML = `<div class="window panel" style="width:min(700px,92vw);max-height:86vh;overflow:auto;padding:24px 28px">
      <h2 style="color:#ff8a80;margin-bottom:10px">⚠️ 游戏运行出错</h2>
      <pre style="white-space:pre-wrap;font:12px/1.7 monospace;color:#ffb9b2;background:#1a1214;border:1px solid #5c2623;border-radius:10px;padding:14px;max-height:46vh;overflow:auto">${msg.replace(/</g, '&lt;')}</pre>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn" onclick="location.reload()">刷新重试</button>
      </div>
    </div>`;
    document.body.appendChild(div);
  };
  window.addEventListener('error', (e) => {
    console.error('[LostZone] 运行错误:', e.error || e.message);
    show(e.error?.stack || `${e.message} (${e.filename}:${e.lineno})`);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[LostZone] 未处理的异常:', e.reason);
    show(e.reason?.stack || String(e.reason));
  });
}

async function boot() {
  installGlobalErrorUi();
  const app = new Application();
  await app.init({
    background: '#10151c',
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
    powerPreference: 'high-performance',
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const save = loadSave();
  const ui = new Ui(save, (charId) => {
    // 进入旧城区 —— 先隐藏大厅并显示遮罩，任何异常都可见
    try {
      ui.hideLobby();
      ui.showLoading('正在生成旧城区…');
      save.charId = charId;
      storeSave(save);
      const world = generateWorld();
      ui.buildHud(app, world);
      ui.showHud(true);
      const game = new Game(app, world, save, charById(charId), ui as any);
      ui.hideLoading();
      ui.onSlotClick = (i: number) => {
        if (i === game['slotIdx']) { /* 已装备 */ }
        (game as any).equip(i);
      };
      const tick = () => {
        const dt = Math.min(1 / 20, (app.ticker as any).deltaMS / 1000);
        game.update(dt);
        (ui as any).updateMinimap?.({ x: game['px'], y: game['py'], aim: game['aim'] });
      };
      app.ticker.add(tick);
      if (!save.seenTutorial) {
        save.seenTutorial = true;
        storeSave(save);
        setTimeout(() => ui.openTutorial(() => { sfx.ensure(); }), 250);
      }
    } catch (err) {
      console.error('[LostZone] 进入游戏失败:', err);
      ui.showError(err);
    }
  });
  window.addEventListener('pointerdown', () => { try { sfx.ensure(); } catch { /* ignore */ } }, { once: true });
}

boot().catch(err => {
  console.error(err);
  const d = document.createElement('div');
  d.style.cssText = 'color:#f88;padding:30px;font:14px monospace;white-space:pre-wrap';
  d.textContent = '启动失败：\n' + (err?.stack || String(err));
  document.body.appendChild(d);
});
