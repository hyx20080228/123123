// ============ UI 层测试（happy-dom） ============
import { describe, expect, test, beforeEach } from 'vitest';
import { Ui } from '../src/ui/ui';
import { DEFAULT_SAVE, ITEMS, LORE } from '../src/core/defs';
import { generateWorld, World } from '../src/world/mapgen';
import { newRun } from '../src/game/state';

function stubCanvas(): any {
  const ctx = {
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, clearRect() {}, drawImage() {},
    fillStyle: '', globalCompositeOperation: 'source-over',
    beginPath() {}, arc() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, closePath() {},
    moveTo() {}, lineTo() {}, fillText() {},
  };
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}
const realCreate = document.createElement.bind(document);
document.createElement = ((tag: string, opts?: any) => {
  if (tag === 'canvas') return stubCanvas();
  return realCreate(tag, opts);
}) as any;

describe('UI 层', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="app"></div><div id="screen-root"></div>'; });

  test('大厅构建与角色切换', () => {
    const ui = new Ui(structuredClone(DEFAULT_SAVE), () => {});
    expect(document.querySelector('#lobby')).toBeTruthy();
    expect(document.querySelectorAll('.char-card').length).toBe(4);
    (document.querySelector('[data-char="rabbit"]') as HTMLElement).click();
    expect(document.querySelector('[data-char="rabbit"]')!.classList.contains('sel')).toBe(true);
  });

  test('点击进入旧城区回调角色', () => {
    let got = '';
    const ui = new Ui(structuredClone(DEFAULT_SAVE), (id) => { got = id; });
    (document.querySelector('#btn-go') as HTMLElement).click();
    expect(got).toBe('cat');
  });

  test('回收站：购买升级 & 出售', () => {
    const save = structuredClone(DEFAULT_SAVE);
    save.gold = 10000;
    save.stash['bolt'] = 10;
    const ui = new Ui(save, () => {});
    (document.querySelector('#btn-shop') as HTMLElement).click();
    expect(document.querySelector('#shop')).toBeTruthy();
    const up = document.querySelector('[data-up="guns"]') as HTMLElement;
    expect(up.textContent).toContain('200');
    up.click();
    expect(save.upgrades.guns).toBe(1);
    expect(save.gold).toBe(9800);
    const sell = document.querySelector('[data-item="bolt"]') as HTMLElement;
    sell.click();
    expect(save.gold).toBe(9880);
    expect(Object.keys(save.stash).length).toBe(0);
  });

  test('情报墙展示收集进度', () => {
    const save = structuredClone(DEFAULT_SAVE);
    save.lore = ['note1', 'log1'];
    const ui = new Ui(save, () => {});
    (document.querySelector('#btn-lore') as HTMLElement).click();
    expect(document.querySelector('#lore')).toBeTruthy();
    const html = document.querySelector('#lore')!.innerHTML;
    expect(html).toContain('已收集 2/10');
    expect(html).toContain('一张被压皱的便条');
  });

  test('HUD 构建与背包弹窗', () => {
    const ui: any = new Ui(structuredClone(DEFAULT_SAVE), () => {});
    const app = { renderer: { width: 100, height: 100 }, screen: { width: 1280, height: 720 }, stage: {} };
    ui.buildHud(app, generateWorld() as World);
    ui.showHud(true);
    expect(document.querySelector('#hud')).toBeTruthy();
    const st = newRun({}, 'cat', []);
    ui.openInv(st, generateWorld() as World, () => {});
    expect(document.querySelector('#modal')).toBeTruthy();
    expect(document.querySelectorAll('#inventory-grid .slot').length).toBe(6);
  });
});
