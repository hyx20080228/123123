// ============ 入口 ============
import { Application } from 'pixi.js';
import { generateWorld } from './world/mapgen';
import { loadSave, storeSave, charById } from './game/state';
import { Ui } from './ui/ui';
import { Game } from './game/game';
import { sfx } from './audio/sfx';

async function boot() {
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
    // 进入旧城区
    save.charId = charId;
    storeSave(save);
    const world = generateWorld();
    ui.buildHud(app, world);
    ui.showHud(true);
    const game = new Game(app, world, save, charById(charId), ui as any);
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
  });
  window.addEventListener('pointerdown', () => sfx.ensure(), { once: true });
}

boot().catch(err => {
  console.error(err);
  const d = document.createElement('div');
  d.style.cssText = 'color:#f88;padding:30px;font:14px monospace;white-space:pre-wrap';
  d.textContent = '启动失败：\n' + (err?.stack || String(err));
  document.body.appendChild(d);
});
