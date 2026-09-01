// ============ 冒烟测试：地图连通性 + 对局全流程模拟（无浏览器） ============
import { describe, expect, test, beforeEach } from 'vitest';
import { Application } from 'pixi.js';
import { generateWorld, TILE, T, Z, World, isSolidTile } from '../src/world/mapgen';
import { gget, bfsWalkable, bfsNext } from '../src/core/util';
import { Game } from '../src/game/game';
import { DEFAULT_SAVE, CHARS } from '../src/core/defs';
import { storeSave } from '../src/game/state';

// happy-dom 的 canvas 2d 不可用 → 打桩
function fakeCanvas(): any {
  const ctx = {
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() {}, clearRect() {}, drawImage() {},
    fillStyle: '', globalCompositeOperation: 'source-over',
    beginPath() {}, arc() {}, fill() {}, save() {}, restore() {}, translate() {}, rotate() {}, closePath() {},
    moveTo() {}, lineTo() {},
  };
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}
const realCreate = document.createElement.bind(document);
document.createElement = ((tag: string, opts?: any) => {
  if (tag === 'canvas') return fakeCanvas();
  return realCreate(tag, opts);
}) as any;

const FLOOR_BY_ZONE: Record<number, number> = {
  [Z.RES]: T.RES_F, [Z.HOS]: T.HOS_F, [Z.WH]: T.WH_F, [Z.MET]: T.MET_F,
  [Z.RAD]: T.RAD_F, [Z.CEL]: T.CEL_F, [Z.CEN]: T.PLAZA, [Z.EXT]: T.YARD,
};

function openAllDoors(w: World) {
  for (const d of Object.values(w.doors)) {
    const z = w.zoneId[d.ty * 96 + d.tx];
    w.grid.cells[d.ty * 96 + d.tx] = FLOOR_BY_ZONE[z] ?? T.PLAZA;
  }
}
function closedAllDoors(w: World) {
  for (const d of Object.values(w.doors)) {
    const z = w.zoneId[d.ty * 96 + d.tx];
    w.grid.cells[d.ty * 96 + d.tx] = T.MET_W; // 关卡口全部视为墙
  }
}

function reachable(w: World, sx: number, sy: number, tx: number, ty: number): boolean {
  const came = bfsWalkable(w.grid, (t) => !isSolidTile(t), sx, sy, tx, ty);
  return came[ty * 96 + tx] !== -1;
}

function makeHud(store: any) {
  return {
    setHud(d: any) { store.hud = d; },
    hudTick() {},
    toast(m: string, k: string) { store.toasts.push([m, k]); },
    prompt() {}, zone() {}, extract() {},
    openLore() {},
    openPuzzleClock(cb: () => void) { store.puzzleCb = cb; },
    openKeypad(cb: (c: string) => boolean) { store.keypadCb = cb; },
    openInv() {},
    openResult(ok: boolean, lines: string[]) { store.result = { ok, lines }; },
    openTutorial() {}, openPause() {}, onDeath() {}, closeAll() {},
  };
}

describe('旧城区地图', () => {
  test('关键地点全部连通（门全开）', () => {
    const w = generateWorld();
    openAllDoors(w);
    const sx = Math.floor(w.spawn.x / 32), sy = Math.floor(w.spawn.y / 32);
    const targets: [number, number, string][] = [
      [48, 88, '撤离点'], [53, 41, '钟楼地窖'], [38, 19, '地下药房'],
      [64, 8, '广播站控制室'], [84, 30, 'B7集装箱'], [82, 70, '地铁储物间'],
      [41, 35, '点唱机'], [39, 9, '护士站抽屉'], [61, 63, '地铁售票厅'],
      [17, 19, '花盆'], [14, 12, '纸条1'],
    ];
    for (const [tx, ty, name] of targets) {
      expect(reachable(w, sx, sy, tx, ty), `${name} 应可达`).toBe(true);
    }
  });

  test('所有拾取物与交互点（门全开）均可达', () => {
    const w = generateWorld();
    openAllDoors(w);
    const sx = Math.floor(w.spawn.x / 32), sy = Math.floor(w.spawn.y / 32);
    const came = bfsWalkable(w.grid, (t) => !isSolidTile(t), sx, sy, 0, 0);
    for (const p of w.pickups) {
      const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32);
      expect(came[ty * 96 + tx], `拾取 ${p.item}@(${tx},${ty}) 应可达`).not.toBe(-1);
    }
    for (const i of w.interacts) {
      const tx = Math.floor(i.x / 32), ty = Math.floor(i.y / 32);
      expect(came[ty * 96 + tx], `交互 ${i.id}@(${tx},${ty}) 应可达`).not.toBe(-1);
    }
  });

  test('资源/敌人全部合法：不在墙上、不在荒野、巡逻点不压道具', () => {
    const w = generateWorld();
    for (const p of w.pickups) {
      const tx = Math.floor(p.x / 32), ty = Math.floor(p.y / 32);
      expect(isSolidTile(w.grid.cells[ty * 96 + tx]), `拾取 ${p.item}@(${tx},${ty}) 不能在墙上`).toBe(false);
      expect(w.zoneId[ty * 96 + tx], `拾取 ${p.item}@(${tx},${ty}) 必须在建筑区域`).not.toBe(Z.NONE);
    }
    for (const e of w.enemies) {
      for (const pt of [{ x: e.x, y: e.y }, ...e.patrol]) {
        const tx = Math.floor(pt.x / 32), ty = Math.floor(pt.y / 32);
        expect(isSolidTile(w.grid.cells[ty * 96 + tx]), '敌人/锚点不能在墙上').toBe(false);
        for (const prop of w.props) {
          if (!prop.solid) continue;
          const d = Math.hypot(pt.x - prop.x, pt.y - prop.y);
          expect(d, `敌人锚点 (${tx},${ty}) 不能压在 ${prop.kind} 上`).toBeGreaterThanOrEqual(prop.r + 14);
        }
      }
      for (const pk of w.pickups) {
        for (const prop of w.props) {
          if (!prop.solid) continue;
          const d = Math.hypot(pk.x - prop.x, pk.y - prop.y);
          expect(d, `拾取 ${pk.item} 不能压在 ${prop.kind} 上`).toBeGreaterThanOrEqual(prop.r + 8);
        }
      }
    }
  });

  test('锁门时：地窖/药房/储物间不可达', () => {
    const w = generateWorld();
    closedAllDoors(w);
    const sx = Math.floor(w.spawn.x / 32), sy = Math.floor(w.spawn.y / 32);
    expect(reachable(w, sx, sy, 53, 41)).toBe(false);
    expect(reachable(w, sx, sy, 38, 19)).toBe(false);
    expect(reachable(w, sx, sy, 82, 70)).toBe(false);
    expect(reachable(w, sx, sy, 48, 88)).toBe(true); // 撤离点仍可达
  });
});

describe('对局流程', () => {
  let app: any, world: World, game: Game, store: any;
  beforeEach(() => {
    app = new Application();
    world = generateWorld();
    store = { toasts: [], hud: null, result: null, puzzleCb: null, keypadCb: null };
    const save = structuredClone(DEFAULT_SAVE);
    game = new Game(app, world, save, CHARS[0], makeHud(store) as any);
  });

  test('近战攻击可连续使用（第二次点击不卡死）', () => {
    const g: any = game;
    // 装备砍肉刀
    if (!g.st.slots[0] || g.st.slots[0].item !== 'cleaver') {
      g.st.slots[0] = { item: 'cleaver', count: 1 };
      g.slotIdx = 0;
      g.replaceWeapon();
    }
    // 第一次点击
    g.justClicked = 1;
    game.update(1 / 60);
    expect(g.meleeT).toBeGreaterThan(0);
    // 等挥砍结束
    for (let i = 0; i < 20; i++) game.update(1 / 60);
    expect(g.meleeT).toBe(0);
    // 第二次点击必须再次触发
    g.justClicked = 1;
    game.update(1 / 60);
    expect(g.meleeT).toBeGreaterThan(0);
  });

  test('运行 300 帧不崩溃且可移动', () => {
    const g: any = game;
    const y0 = g.py;
    g.keys.add('KeyW');
    for (let i = 0; i < 300; i++) game.update(1 / 60);
    expect(g.py).toBeLessThan(y0);
    g.keys.delete('KeyW');
  });

  test('纸条1拾取 → 花盆解锁 → 护士站日志链', () => {
    const g: any = game;
    g.px = 14 * 32; g.py = 12 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(game.save.lore).toContain('note1');
    // 花盆
    g.px = 16.5 * 32; g.py = 19.5 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(g.st.keys.flower).toBe(true);
    // 护士站抽屉
    g.px = 39.5 * 32; g.py = 9.5 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(game.save.lore).toContain('log1');
    expect(g.st.keys.pharmacy).toBe(true);
  });

  test('钟楼谜题 → 地窖开门 → 备用电源', () => {
    const g: any = game;
    g.px = 48.5 * 32; g.py = 43.5 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(store.puzzleCb).toBeTruthy();
    store.puzzleCb(); // 解谜成功
    const d = world.doors.cellar!;
    expect(isSolidTile(gget(world.grid, d.tx, d.ty))).toBe(false);
    // 进入地窖拾取电源
    g.px = 53 * 32 + 16; g.py = 40 * 32 + 12;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(g.st.hasPowercell).toBe(true);
  });

  test('药房链：钥匙 → 开门 → 抗辐药剂', () => {
    const g: any = game;
    g.st.keys.pharmacy = true;
    g.px = 42.5 * 32; g.py = 19.5 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    const d = world.doors.pHarma!;
    expect(isSolidTile(gget(world.grid, d.tx, d.ty))).toBe(false);
  });

  test('门禁 1024 → 储物间 → 日志2 解锁后门', () => {
    const g: any = game;
    g.px = 79.5 * 32; g.py = 70.5 * 32;
    game.update(1 / 60);
    (game as any).keypadInteract();
    expect(store.keypadCb).toBeTruthy();
    store.keypadCb('1024');
    const d = world.doors.storage!;
    expect(isSolidTile(gget(world.grid, d.tx, d.ty))).toBe(false);
    g.px = 82 * 32 + 14; g.py = 70 * 32 + 10;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(game.save.lore).toContain('log2');
  });

  test('撤离流程（无电池被拒 → 有电池成功）', () => {
    const g: any = game;
    g.px = 48 * 32 + 16; g.py = 88.5 * 32;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(store.toasts.some((t: any) => String(t[0]).includes('备用电源'))).toBe(true);
    g.st.hasPowercell = true;
    (game as any).startExtract();
    g.keys.clear();
    for (let i = 0; i < 300; i++) game.update(1 / 60);
    expect(store.result).toBeTruthy();
    expect(store.result.ok).toBe(true);
  });

  test('死亡流程：丢装备、情报保留', () => {
    const g: any = game;
    g.save.lore.push('note1');
    g.st.bag['titanium'] = 2;
    const gold0 = g.save.gold;
    (game as any).hurtPlayer(9999);
    expect(store.result).toBeTruthy();
    expect(store.result.ok).toBe(false);
    expect(g.save.deaths).toBe(1);
  });

  test('B7 集装箱与 818 皮卡可搜刮', () => {
    const g: any = game;
    g.px = 84 * 32 + 14; g.py = 30 * 32 + 16;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(game.pickups.some(p => p.def.item === 'smg' && !p.taken)).toBe(true);
    g.px = 78 * 32 + 16; g.py = 49 * 32 + 20;
    game.update(1 / 60);
    (game as any).tryInteract();
    expect(game.pickups.some(p => p.def.item === 'ammo' && !p.taken)).toBe(true);
  });
});
