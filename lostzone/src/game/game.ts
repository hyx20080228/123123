// ============ 对局逻辑：玩家 / 锈犬 / 战斗 / 搜刮 / 撤离 / 叙事 ============
const AUTO_PICK = ['cloth', 'bolt', 'wire', 'canfood', 'cell', 'ammo', 'can', 'titanium', 'antir', 'sigcell'];
import { Application, Container, Graphics, Sprite } from 'pixi.js';
import { World, T, Z, TILE, W, H, ZONES, isSolidTile, PickupDef } from '../world/mapgen';
import { gget, bfsWalkable, bfsNext, raycastGrid, clamp, lerp, TAU, dist2 } from '../core/util';
import { ITEMS, LORE, SaveData, CharDef, Settings, DEFAULT_SETTINGS } from '../core/defs';
import { newRun, RunState, addSlot, addBag, bagCount, autoLoadout, storeSave } from './state';
import { RendererCtx } from '../render/renderer';
import { createCharSprite, poseChar, CharSprite, createHoundSprite, poseHound, HoundSprite,
  makeWeapon, makeProp, makePickupSprite, pulsePickup, PickupSprite, makeExtractSprite, makeDoorSprite } from '../render/art';
import { Particles } from '../render/particles';
import { sfx } from '../audio/sfx';

export interface HudApi {
  setHud(data: any): void;
  toast(msg: string, kind: string): void;
  prompt(text: string | null): void;
  zone(name: string): void;
  extract(p: number | null): void;
  openLore(loreId: string, onClose?: () => void): void;
  openPuzzleClock(onDone: () => void, onClose?: () => void): void;
  openKeypad(onDone: (code: string) => boolean, onClose?: () => void): void;
  openInv(state: RunState, world: World, onUse: (slot: number) => void, onClose?: () => void): void;
  openResult(ok: boolean, lines: string[], onOk: () => void): void;
  openTutorial(onDone: () => void): void;
  openPause(onResume: () => void, onExit: () => void): void;
  onDeath(): void;
  hudTick(state: RunState, save: SaveData): void;
  refreshPickups?(): void;
  closeAll(): void;
  openMenu(onResume: () => void, onExit: () => void, onSettings: (k: string, v: number | boolean) => void): void;
  flashMenuButton(): void;
}

interface PickupEnt { def: PickupDef; sprite: PickupSprite; taken: boolean; t: number }
interface DoorEnt { id: string; x: number; y: number; tx: number; ty: number; sprite: Container; open: boolean }
interface EnemyEnt {
  x: number; y: number; hp: number; maxHp: number; r: number; elite: boolean; speed: number;
  state: 'patrol' | 'chase' | 'attack' | 'stun' | 'dead';
  patrol: { x: number; y: number }[]; pi: number; alert: number;
  t: number; actT: number; cool: number; repath: number; path: Int32Array | null; pathOK: boolean;
  hitT: number; sprite: HoundSprite; zone: number; barkT: number;
  wx: number; wy: number; waitT: number; stuckT: number; home: { x: number; y: number };
}
interface LightPulse { x: number; y: number; r: number; a: number; ttl: number }

export class Game {
  app: Application; world: World; rc: RendererCtx; save: SaveData; char: CharDef; settings: Settings;
  st: RunState; hud: HudApi;
  private particles = new Particles();
  // 玩家
  private px = 0; private py = 0; private pr = 12; private aim = 0;
  private pSprite: CharSprite; private weaponSprites: Record<string, Container> = {};
  private walkT = 0; private moving = false; private sprint = false;
  private slotIdx = 0; private fireT = 0; private reloadT = 0; private meleeT = 0;
  private hitT = 0; private invuln = 0; private hurtFlash = 0;
  // 输入
  private keys = new Set<string>();
  private mouse = { x: 0, y: 0, down: false, rdown: false };
  // 实体
  private enemies: EnemyEnt[] = [];
  private pickups: PickupEnt[] = [];
  private doors: DoorEnt[] = [];
  private propRects: { x: number; y: number; r: number }[] = [];
  private propsC: Container[] = [];
  private lights: LightPulse[] = [];
  private beacon: ReturnType<typeof makeExtractSprite>;
  private nearInteract: { id: string; x: number; y: number; label: string; act: string } | null = null;
  private zoneNow = 0; private bannerT = 0;
  private extractT: number | null = null;
  private eventT = -1; private eventSpawned = false;
  private done = false; private paused = false;
  private time = 0;
  private tracer: { x0: number; y0: number; x1: number; y1: number; ttl: number }[] = [];
  private tracersG = new Graphics();
  private keysMap = new Map<string, number>();
  private unlocked = new Set<string>();
  private looted = new Set<string>();

  constructor(app: Application, world: World, save: SaveData, char: CharDef, hud: HudApi,
    settings: Settings = DEFAULT_SETTINGS) {
    this.app = app; this.world = world; this.save = save; this.char = char; this.hud = hud; this.settings = settings;
    this.st = newRun(save.upgrades, char.id, autoLoadout(save));
    this.rc = new RendererCtx(app, world, settings);
    this.rc.objLayer.addChild(this.particles.c);
    this.px = world.spawn.x; this.py = world.spawn.y;
    this.pSprite = createCharSprite(char);
    this.beacon = makeExtractSprite();
    this.buildWorld();
    this.replaceWeapon();
    this.zoneNow = this.zoneAt();
    this.rc.objLayer.addChild(this.pSprite.c);
    this.bindInput();
    this.zoneNow = this.zoneAt();
    this.hud.zone(ZONES[this.zoneNow].name);
    this.renderHotbar();
    this.hud.hudTick(this.st, this.save);
  }

  // ---------- 构建世界实体 ----------
  private buildWorld() {
    const w = this.world;
    for (const p of w.props) {
      const c = makeProp(p.kind, p.data);
      let node: Container = c;
      try {
        // 静态道具烘焙为单张纹理 Sprite：大幅降低 draw call 与内存
        const tex = this.app.renderer.generateTexture({ target: c, clearColor: '#00000000', antialias: true });
        const ss = new Sprite(tex);
        ss.anchor.set(0.5);
        node = ss;
        c.destroy({ children: true });
      } catch { /* 无渲染器（测试/回退）时保留 Graphics */ }
      node.position.set(p.x, p.y);
      node.zIndex = p.y;
      this.rc.objLayer.addChild(node);
      this.propsC.push(node);
      if (p.solid) this.propRects.push({ x: p.x, y: p.y, r: p.r });
    }
    for (const d of Object.values(w.doors)) {
      const sprite = makeDoorSprite(d.open, d.kind);
      sprite.position.set(d.tx * TILE + 16, d.ty * TILE + 8);
      sprite.zIndex = d.ty * TILE;
      this.rc.objLayer.addChild(sprite);
      this.doors.push({ ...d, sprite, x: d.tx * TILE, y: d.ty * TILE, open: d.open });
      if (!d.open) this.lockSolid(d.tx, d.ty, true);
    }
    for (const pk of w.pickups) {
      const def = ITEMS[pk.item];
      if (!def) continue;
      const sprite = makePickupSprite(def.name, def.icon, def.color);
      sprite.c.position.set(pk.x, pk.y);
      sprite.c.zIndex = pk.y + 2000;
      this.rc.objLayer.addChild(sprite.c);
      this.pickups.push({ def: pk, sprite, taken: false, t: Math.random() * 5 });
    }
    for (const e of w.enemies) {
      const sprite = createHoundSprite(e.elite);
      sprite.c.position.set(e.x, e.y);
      sprite.c.zIndex = e.y;
      this.rc.objLayer.addChild(sprite.c);
      this.enemies.push({
        x: e.x, y: e.y, hp: e.elite ? 190 : 70, maxHp: e.elite ? 190 : 70, r: e.elite ? 15 : 13,
        elite: e.elite, speed: e.elite ? 150 : 126, state: 'patrol', patrol: e.patrol,
        pi: 0, alert: 0, t: Math.random() * 10, actT: 0, cool: 0, repath: 0, path: null, pathOK: false,
        hitT: 0, sprite, zone: e.zone, barkT: 0,
        wx: e.x, wy: e.y, waitT: 0, stuckT: 0, home: { x: e.x, y: e.y },
      });
    }
    this.beacon.c.position.set(w.extraction.x, w.extraction.y);
    this.beacon.c.zIndex = w.extraction.y;
    this.rc.objLayer.addChild(this.beacon.c);
    // 激活时开启的门（flag）
    for (const [id, d] of Object.entries(w.doors)) {
      if (d.kind === 'flag' && id === 'radioBack' && this.save.radioDoorOpen) this.openDoor('radioBack', true);
    }
  }

  private lockSolid(tx: number, ty: number, lock: boolean) {
    const zone = this.world.zoneId[ty * 96 + tx];
    const wmap: Record<number, number> = { [Z.RES]: T.RES_W, [Z.HOS]: T.HOS_W, [Z.WH]: T.WH_W, [Z.MET]: T.MET_W, [Z.RAD]: T.RAD_W, [Z.CEL]: T.CEL_W };
    const fmap: Record<number, number> = { [Z.RES]: T.RES_F, [Z.HOS]: T.HOS_F, [Z.WH]: T.WH_F, [Z.MET]: T.MET_F, [Z.RAD]: T.RAD_F, [Z.CEL]: T.CEL_F, [Z.CEN]: T.PLAZA };
    if (lock) this.world.grid.cells[ty * 96 + tx] = wmap[zone] ?? T.MET_W;
    else this.world.grid.cells[ty * 96 + tx] = fmap[zone] ?? T.PLAZA;
  }

  // ---------- 输入 ----------
  private bindInput() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3' || e.code === 'Digit4' || e.code === 'Digit5' || e.code === 'Digit6') {
        const i = +e.code.slice(5) - 1;
        if (this.st.slots[i]) this.equip(i);
      }
      if (e.code === 'KeyR') this.tryReload();
      if (e.code === 'KeyE') this.tryInteract();
      if (e.code === 'Tab') { e.preventDefault(); this.toggleInv(); }
      if (e.code === 'Escape') this.togglePause();
      if (e.code === 'KeyF') this.toggleFlash();
      if (e.code === 'KeyF5') return;
      if (this.hitIntercept?.()) return;
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    this.app.stage.eventMode = 'static';
    this.app.stage.hitArea = this.app.screen;
    this.app.stage.on('pointermove', (e) => { this.mouse.x = e.global.x; this.mouse.y = e.global.y; });
    window.addEventListener('mousedown', (e) => { if (e.button === 0) { this.mouse.down = true; this.justClicked = Math.min(3, this.justClicked + 1); } if (e.button === 2) this.mouse.rdown = true; });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.down = false; if (e.button === 2) this.mouse.rdown = false; });
    window.addEventListener('contextmenu', (e) => { if (this.running()) e.preventDefault(); });
  }
  private hitIntercept: (() => boolean) | null = null;
  private modalOpen(fn: (close: () => void) => void) {
    this.paused = true;
    fn(() => { this.paused = false; });
  }
  setIntercept(fn: (() => boolean) | null) { this.hitIntercept = fn; }
  private running() { return !this.paused && !this.done; }

  // ---------- 主循环 ----------
  update(dt: number) {
    if (!this.running() || this.done) { this.rc.follow(dt, this.px, this.py); return; }
    this.time += dt;
    this.st.time = this.time;
    this.updatePlayer(dt);
    this.updateEnemies(dt);
    this.updatePickups(dt);
    this.updateInteract(dt);
    this.updateExtraction(dt);
    this.updateEvent(dt);
    this.updateLights(dt);
    this.particles.update(dt);
    this.updateFx(dt);
    this.rc.follow(dt, this.px, this.py);
    this.renderHud();
  }

  // ---------- 玩家 ----------
  private updatePlayer(dt: number) {
    let dx = 0, dy = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dy -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dy += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;
    this.sprint = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    this.moving = dx !== 0 || dy !== 0;
    if (this.moving) {
      const len = Math.hypot(dx, dy);
      const sp = (this.sprint ? 330 : 232);
      const nx = this.px + dx / len * sp * dt, ny = this.py + dy / len * sp * dt;
      const [cx, cy] = this.moveCircle(nx, ny, this.pr);
      this.px = cx; this.py = cy;
      this.walkT += dt;
    } else this.walkT += dt * 0.3;
    // 准星
    const s = this.rc.worldToScreen(this.px, this.py);
    this.aim = Math.atan2(this.mouse.y - s.y, this.mouse.x - s.x);
    poseChar(this.pSprite, this.walkT, this.moving, this.aim, this.hitT, this.sprint,
      this.meleeT > 0 ? 1 - this.meleeT / 0.22 : 0, this.dead);
    this.pSprite.c.position.set(this.px, this.py);
    this.pSprite.c.zIndex = this.py;
    // 武器姿态
    const slot = this.st.slots[this.slotIdx];
    if (slot) {
      const def = ITEMS[slot.item];
      const w = this.weaponSprites[slot.item];
      if (def.kind === 'gun') {
        const recoil = this.fireT > 0 ? this.fireT * 30 : 0;
        w.y = -recoil;
        if (this.reloadT > 0) w.rotation = (this.slotIdx % 2 ? 1 : -1) * 0.9 * Math.min(1, this.reloadT);
      }
    }
    // 计时器
    this.fireT = Math.max(0, this.fireT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.hitT = Math.max(0, this.hitT - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload();
    }
    this.updateWeaponFire(dt);
  }

  private moveCircle(nx: number, ny: number, r: number): [number, number] {
    const W = 96;
    const solid = (x: number, y: number) => isSolidTile(gget(this.world.grid, Math.floor(x / TILE), Math.floor(y / TILE)));
    // 轴分离
    let x = nx, y = this.py;
    if (solid(x - r, y) || solid(x + r, y) || solid(x, y - r) || solid(x, y + r)) x = this.px;
    let yy = ny;
    if (solid(x - r, yy) || solid(x + r, yy) || solid(x, yy - r) || solid(x, yy + r)) yy = this.py;
    // 道具
    for (const p of this.propRects) {
      const d = Math.hypot(x - p.x, yy - p.y);
      const min = r + p.r;
      if (d < min && d > 0.001) {
        const k = (min - d) / d;
        x += (x - p.x) * k; yy += (yy - p.y) * k;
      }
    }
    return [clamp(x, r, W * TILE - r), clamp(yy, r, W * TILE - r)];
  }

  private replaceWeapon() {
    const slot = this.st.slots[this.slotIdx];
    if (!slot) return;
    const old = this.pSprite.weapon;
    if (!this.weaponSprites[slot.item]) this.weaponSprites[slot.item] = makeWeapon(slot.item);
    const w = this.weaponSprites[slot.item];
    old.removeChildren();
    old.addChild(w);
  }
  private equip(i: number) {
    if (!this.st.slots[i]) return;
    this.slotIdx = i;
    this.reloadT = 0;
    this.replaceWeapon();
    sfx.click();
    this.renderHotbar();
  }
  private tryReload() {
    const slot = this.st.slots[this.slotIdx];
    if (!slot) return;
    const def = ITEMS[slot.item];
    if (def.kind !== 'gun' || slot.count >= def.mag! || this.st.ammo <= 0 || this.reloadT > 0) return;
    this.reloadT = def.reload!;
    sfx.click();
  }
  private finishReload() {
    const slot = this.st.slots[this.slotIdx];
    if (!slot) return;
    const def = ITEMS[slot.item];
    const need = def.mag! - slot.count;
    const take = Math.min(need, this.st.ammo);
    slot.count += take; this.st.ammo -= take;
    sfx.unlock();
    this.renderHotbar();
  }

  private updateWeaponFire(dt: number) {
    const slot = this.st.slots[this.slotIdx];
    if (!slot || this.reloadT > 0 || this.meleeT > 0) return;
    const def = ITEMS[slot.item];
    if (def.kind === 'melee') {
      if ((this.mouse.down || this.justClicked > 0) && this.fireT <= 0) {
        if (this.justClicked > 0) this.justClicked--;
        this.fireT = 1 / def.rate!;
        this.meleeT = 0.22;
        this.meleeAttack(def.dmg!, def.range!, def.meleeArc!);
        sfx.melee();
      }
      return;
    }
    if (def.kind !== 'gun') return;
    if (this.mouse.down && (def.auto || this.mouse.rdown || this.justClicked > 0)) {
      if (slot.count <= 0) { this.tryReload(); return; }
      if (this.fireT <= 0) {
        if (this.justClicked > 0) this.justClicked--;
        this.fireT = 1 / def.rate!;
        slot.count--;
        const spread = def.spread! * (this.sprint || this.moving ? 1.6 : 1) * (this.sprint ? 2 : 1);
        const a = this.aim + (Math.random() - 0.5) * 2 * spread;
        this.shoot(a, def.dmg!, def.range!);
        sfx.shot(slot.item === 'smg');
        this.rc.addShake(0.12);
        this.lights.push({ x: this.px + Math.cos(a) * 30, y: this.py + Math.sin(a) * 30, r: 110, a: 1, ttl: 0.08 });
        this.renderHotbar();
      }
    }
  }
  private justClicked = 0;
  private dead = false;
  private meleeAttack(dmg: number, range: number, arc: number) {
    let hit = false;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d > range + e.r) continue;
      const ang = Math.atan2(e.y - this.py, e.x - this.px);
      let diff = Math.abs(((ang - this.aim) % TAU + TAU * 1.5) % TAU - Math.PI);
      if (diff < arc / 2 + 0.15) {
        hit = true;
        this.damageEnemy(e, dmg * this.gunMult(), ang);
        const kb = 26;
        e.x = this.px + Math.cos(ang) * (d + kb);
        e.y = this.py + Math.sin(ang) * (d + kb);
      }
    }
    this.particles.spawn(this.px + Math.cos(this.aim) * 34, this.py + Math.sin(this.aim) * 20, { n: hit ? 12 : 6, color: 0xffffff, speed: 190, life: .28, size: 2.6, grav: 60, ang: this.aim, spread: 0.9 });
    this.rc.addShake(hit ? 0.16 : 0.06);
    if (hit) sfx.hit();
  }
  private gunMult() { return 1 + (this.save.upgrades.guns || 0) * 0.15; }

  private shoot(a: number, dmg: number, range: number) {
    const dx = Math.cos(a), dy = Math.sin(a);
    // 敌人命中
    let bestT = range, bestE: EnemyEnt | null = null;
    for (const e of this.enemies) {
      if (e.state === 'dead') continue;
      const rx = e.x - this.px, ry = e.y - this.py;
      const tProj = rx * dx + ry * dy;
      if (tProj < 0 || tProj > range) continue;
      const perp = Math.abs(rx * dy - ry * dx);
      if (perp < e.r + 4 && tProj < bestT) { bestT = tProj; bestE = e; }
    }
    // 墙
    const wall = raycastGrid(this.world.grid, isSolidTile, this.px, this.py, this.px + dx * range, this.py + dy * range, range);
    const endT = wall.hit ? Math.min(bestT, wall.t * range) : bestT;
    let ex = this.px + dx * endT, ey = this.py + dy * endT;
    if (bestE && endT === bestT) {
      this.damageEnemy(bestE, dmg * this.gunMult(), a);
      ex = bestE.x; ey = bestE.y;
    }
    if (wall.hit && (!bestE || bestT > wall.t * range)) {
      this.particles.spawn(ex, ey, { n: 5, color: 0xd8c9a0, speed: 90, life: .3, size: 2, grav: 160 });
    }
    this.tracer.push({ x0: this.px + dx * 26, y0: this.py + dy * 26, x1: ex, y1: ey, ttl: 0.09 });
    this.particles.spawn(this.px + dx * 30, this.py + dy * 24, { n: 3, color: 0xffe0a0, speed: 60, life: .12, size: 2.4, grav: 0, ang: a, spread: 0.6 });
    this.alarmNearby(this.px, this.py, 420);
  }

  private damageEnemy(e: EnemyEnt, dmg: number, ang: number) {
    if (e.state === 'dead') return;
    e.hp -= dmg;
    e.hitT = 0.12;
    e.state = 'chase'; e.alert = 2;
    e.actT = 0.05;
    this.particles.spawn(e.x, e.y, { n: 6, color: 0xffb04a, speed: 150, life: .35, size: 2.6, grav: 260 });
    sfx.hit();
    if (e.hp <= 0) this.killEnemy(e);
  }
  private killEnemy(e: EnemyEnt) {
    e.state = 'dead'; e.actT = 0;
    if (this.settings.shake) this.rc.addShake(0.22);
    sfx.dogDie();
    this.particles.spawn(e.x, e.y, { n: 14, color: 0xffa04a, speed: 220, life: .5, size: 3, grav: 340 });
    this.particles.spawn(e.x, e.y, { n: 6, color: 0x9aa4ac, speed: 130, life: .4, size: 2.4, grav: 300 });
    // 掉落
    const drops = e.elite ? ['bolt', 'ammo', 'titanium'] : ['cloth', 'bolt', 'cell'];
    for (const it of drops) {
      if (Math.random() < (e.elite ? 0.9 : 0.55))
        this.spawnItem(it, e.x + (Math.random() - .5) * 30, e.y + (Math.random() - .5) * 30, e.zone, Math.random() < .3 ? 2 : 1);
    }
  }
  private spawnItem(item: string, x: number, y: number, zone: number, count = 1) {
    const def = ITEMS[item]; if (!def) return;
    const sprite = makePickupSprite(def.name, def.icon, def.color);
    sprite.c.position.set(x, y); sprite.c.zIndex = y + 2000;
    this.rc.objLayer.addChild(sprite.c);
    this.pickups.push({ def: { item, count, x, y, zone }, sprite, taken: false, t: Math.random() * 5 });
  }

  private alarmNearby(x: number, y: number, r: number) {
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.alert > 1) continue;
      if (dist2(x, y, e.x, e.y) < r * r) { e.state = 'chase'; e.alert = 3; e.repath = 0; }
    }
  }

  // ---------- 锈犬 AI ----------
  private updateEnemies(dt: number) {
    for (const e of this.enemies) {
      if (e.state === 'dead') { poseHound(e.sprite, e.t, false, 0, true); e.sprite.c.position.set(e.x, e.y); continue; }
      e.t += dt;
      e.hitT = Math.max(0, e.hitT - dt);
      e.cool = Math.max(0, e.cool - dt);
      e.alert = Math.max(0, e.alert - dt);
      const d2p = dist2(e.x, e.y, this.px, this.py);
      const sees = this.canSee(e.x, e.y, this.px, this.py, e.elite ? 420 : 340)
        && d2p < (e.elite ? 460 * 460 : 380 * 380);
      if (sees && e.alert <= 0 && e.state !== 'attack') {
        e.state = 'chase'; e.alert = 4; e.repath = 0;
        if (e.barkT <= 0) { sfx.dog(); e.barkT = 1.6; }
        e.sprite.head.y = -6;
      }
      e.barkT = Math.max(0, e.barkT - dt);
      switch (e.state) {
        case 'patrol': this.aiPatrol(e, dt); break;
        case 'chase': this.aiChase(e, dt, d2p, sees); break;
        case 'attack': this.aiAttack(e, dt, d2p, sees); break;
        case 'stun': {
          e.actT -= dt;
          if (e.actT <= 0) e.state = 'chase';
          break;
        }
      }
      const atkPhase = e.state === 'attack' ? clamp(e.actT / 0.62, 0, 1) : -1;
      poseHound(e.sprite, e.t, (e.state === 'patrol' && e.waitT <= 0) || e.state === 'chase', e.alert, false, atkPhase);
      e.sprite.c.position.set(e.x, e.y + Math.sin(e.t * 8) * (e.state === 'attack' ? 1.4 : 0));
      e.sprite.c.zIndex = e.y;
    }
  }

  private canSee(x0: number, y0: number, x1: number, y1: number, range: number) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len > range) return false;
    const steps = Math.ceil(len / 14);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x0 + dx * t, y = y0 + dy * t;
      if (isSolidTile(gget(this.world.grid, Math.floor(x / TILE), Math.floor(y / TILE)))) return false;
    }
    return true;
  }

  /** 实体移动：轴分离 + 贴墙滑动 + 道具推开（与玩家一致，杜绝卡墙抖动/瞬移） */
  private stepEntity(e: EnemyEnt, tx: number, ty: number, speed: number, dt: number): number {
    const dx = tx - e.x, dy = ty - e.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) return 0;
    const step = Math.min(speed * dt, len);
    const vx = dx / len * step, vy = dy / len * step;
    const r = e.r - 2;
    const solid = (x: number, y: number) => isSolidTile(gget(this.world.grid, Math.floor(x / TILE), Math.floor(y / TILE)));
    let x = e.x;
    if (!solid(x + vx + Math.sign(vx) * r, e.y) && !solid(x + vx, e.y - r) && !solid(x + vx, e.y + r)) x += vx;
    let y = e.y;
    if (!solid(x, y + vy + Math.sign(vy) * r) && !solid(x - r, y + vy) && !solid(x + r, y + vy)) y += vy;
    for (const pp of this.propRects) {
      const d = Math.hypot(x - pp.x, y - pp.y);
      const min = r + pp.r;
      if (d < min && d > 0.001) {
        const k = (min - d) / d;
        x += (x - pp.x) * k; y += (y - pp.y) * k;
      }
    }
    const ox = e.x, oy = e.y;
    e.x = clamp(x, 4, W * TILE - 4);
    e.y = clamp(y, 4, H * TILE - 4);
    return Math.hypot(e.x - ox, e.y - oy);
  }

  /** 卡住检测：连续几乎不动 → 强制换路/换目标 */
  private trackStuck(e: EnemyEnt, moved: number, dt: number, onStuck: () => void) {
    if (moved < 0.4) {
      e.stuckT += dt;
      if (e.stuckT > 0.55) { e.stuckT = 0; onStuck(); }
    } else e.stuckT = 0;
  }

  /** 寻路到瓦片；pathOK 记录是否可达 */
  private computePath(e: EnemyEnt, tx: number, ty: number) {
    const ex = Math.floor(e.x / TILE), ey = Math.floor(e.y / TILE);
    e.path = bfsWalkable(this.world.grid, t => !isSolidTile(t), ex, ey, tx, ty);
    e.pathOK = e.path[ty * 96 + tx] !== -1;
  }

  /** 自由巡逻：沿巡逻锚点环线行走 + 驻足嗅探；无锚点时在出生点周边游荡 */
  private aiPatrol(e: EnemyEnt, dt: number) {
    if (e.waitT > 0) { e.waitT -= dt; return; }
    let px: number, py: number;
    if (e.patrol.length) {
      px = e.patrol[e.pi].x; py = e.patrol[e.pi].y;
    } else {
      px = e.wx; py = e.wy;
      const dh = Math.hypot(px - e.x, py - e.y);
      if (dh < 30) {
        e.waitT = 1 + Math.random() * 1.6;
        // 出生点周边选一个随机可达点
        for (let t = 0; t < 10; t++) {
          const nx = Math.floor(e.home.x / TILE) + Math.floor((Math.random() - 0.5) * 10);
          const ny = Math.floor(e.home.y / TILE) + Math.floor((Math.random() - 0.5) * 10);
          if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
          if (isSolidTile(gget(this.world.grid, nx, ny))) continue;
          e.wx = nx * TILE + 16; e.wy = ny * TILE + 16; break;
        }
        return;
      }
    }
    const dTarget = Math.hypot(px - e.x, py - e.y);
    if (dTarget < 44) {
      if (e.patrol.length) e.pi = (e.pi + 1) % e.patrol.length;
      e.waitT = 0.9 + Math.random() * 1.9;
      e.path = null; e.stuckT = 0;
      return;
    }
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
    e.repath -= dt;
    if (e.repath <= 0 || !e.path) {
      e.repath = 1.1;
      this.computePath(e, tx, ty);
      if (!e.pathOK) {
        // 目标不可达 → 换下一个锚点
        if (e.patrol.length) e.pi = (e.pi + 1) % e.patrol.length;
        e.path = null; e.repath = 0;
        return;
      }
    }
    let nx = px, ny = py;
    if (e.path) {
      const nxt = bfsNext(e.path, W, Math.floor(e.x / TILE), Math.floor(e.y / TILE), tx, ty);
      if (nxt) { nx = nxt[0] * TILE + 16; ny = nxt[1] * TILE + 16; }
    }
    const moved = this.stepEntity(e, nx, ny, e.speed * 0.72, dt);
    this.trackStuck(e, moved, dt, () => {
      e.repath = 0; e.path = null;
      if (e.patrol.length) e.pi = (e.pi + 1) % e.patrol.length;
    });
  }

  private aiChase(e: EnemyEnt, dt: number, d2p: number, sees: boolean) {
    e.repath -= dt;
    const dist = Math.sqrt(d2p);
    // 近身 → 攻击
    if (sees && d2p < 52 * 52 && e.cool <= 0) { e.state = 'attack'; e.actT = 0; return; }
    // 脱战：丢失视野/超距 → 回巡逻
    if ((!sees && e.alert <= 0) || dist > 560) { this.returnToPatrol(e); return; }
    const ptx = Math.floor(this.px / TILE), pty = Math.floor(this.py / TILE);
    if (e.repath <= 0 || !e.path) {
      e.repath = 0.55;
      this.computePath(e, ptx, pty);
    }
    // 近距离且视线通畅 → 直线追击（更自然）
    if (sees && dist < 280) {
      const moved = this.stepEntity(e, this.px, this.py, e.speed * (dist > 180 ? 1.18 : 1.05), dt);
      this.trackStuck(e, moved, dt, () => { e.repath = 0; });
      return;
    }
    if (e.path && e.pathOK) {
      const nxt = bfsNext(e.path, W, Math.floor(e.x / TILE), Math.floor(e.y / TILE), ptx, pty);
      if (nxt) {
        const moved = this.stepEntity(e, nxt[0] * TILE + 16, nxt[1] * TILE + 16, e.speed * (dist > 280 ? 1.25 : 1), dt);
        this.trackStuck(e, moved, dt, () => { e.repath = 0; e.path = null; });
        return;
      }
    }
    // 无路可走但有视野 → 直线逼近；否则放弃
    if (sees) {
      const moved = this.stepEntity(e, this.px, this.py, e.speed, dt);
      this.trackStuck(e, moved, dt, () => { this.returnToPatrol(e); });
    } else this.returnToPatrol(e);
  }

  /** 失败回退：选最近巡逻锚点，平滑归位 */
  private returnToPatrol(e: EnemyEnt) {
    e.state = 'patrol'; e.path = null; e.repath = 0; e.stuckT = 0; e.cool = Math.max(e.cool, 0.4);
    if (e.patrol.length) {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < e.patrol.length; i++) {
        const d = dist2(e.x, e.y, e.patrol[i].x, e.patrol[i].y);
        if (d < bd) { bd = d; bi = i; }
      }
      e.pi = bi;
    } else { e.wx = e.home.x; e.wy = e.home.y; }
  }

  private aiAttack(e: EnemyEnt, dt: number, d2p: number, sees: boolean) {
    e.actT += dt;
    if (e.actT < 0.42) {
      // 前摇：面向玩家，身体下压
      e.sprite.body.y = Math.sin(e.actT / 0.42 * Math.PI) * 1.6;
      e.sprite.head.y = -2 - e.actT * 6;
      if (e.actT > 0.05 && e.actT - dt <= 0.05) sfx.roar();
      // 目标跑了 → 放弃攻击
      if (!sees && d2p > 120 * 120) { e.state = 'chase'; e.repath = 0; e.cool = 0.3; e.sprite.body.y = 0; }
    } else if (e.actT < 0.62) {
      // 扑咬（带碰撞，不会穿墙）
      const ang = Math.atan2(this.py - e.y, this.px - e.x);
      this.stepEntity(e, e.x + Math.cos(ang) * 90, e.y + Math.sin(ang) * 90, 330, dt);
      if (d2p < 62 * 62 && this.invuln <= 0) this.hurtPlayer(e.elite ? 20 : 12, e);
    } else {
      e.state = 'chase'; e.cool = e.elite ? 0.9 : 1.3; e.repath = 0; e.sprite.body.y = 0;
    }
  }

  private hurtPlayer(dmg: number, from?: EnemyEnt) {
    if (this.invuln > 0 || this.done) return;
    this.invuln = 0.5;
    const absorbed = Math.min(this.st.armor, dmg * 0.5);
    this.st.armor -= absorbed;
    this.st.hp -= dmg - absorbed;
    this.hitT = 0.2; this.hurtFlash = 0.35;
    sfx.hurt();
    sfx.dog();
    if (this.settings.shake) this.rc.addShake(0.4);
    const ang = from ? Math.atan2(this.py - from.y, this.px - from.x) : Math.PI;
    this.particles.spawn(this.px, this.py, { n: 8, color: 0xff6a5a, speed: 180, life: .4, size: 3, grav: 240, ang });
    if (this.extractT !== null) { this.extractT = null; this.hud.extract(null); this.hud.toast('撤离被打断！', 'bad'); }
    if (this.st.hp <= 0) { this.st.hp = 0; this.die(); }
  }

  // ---------- 拾取 ----------
  private updatePickups(dt: number) {
    for (const p of this.pickups) {
      if (p.taken) continue;
      p.t += dt;
      const d = Math.hypot(p.def.x - this.px, p.def.y - this.py);
      pulsePickup(p.sprite, p.t, d < 60);
      if (AUTO_PICK.includes(p.def.item)) {
        if (d < 46) { this.pick(p); continue; }
      }
    }
    // 最近的可交互拾取物（按 E）
    this.nearInteractPickup = null;
    let best = Infinity;
    for (const p of this.pickups) {
      if (p.taken) continue;
      const def = ITEMS[p.def.item];
      if (AUTO_PICK.includes(p.def.item)) continue;
      const d = Math.hypot(p.def.x - this.px, p.def.y - this.py);
      if (d < 44 && d < best) { best = d; this.nearInteractPickup = p; this.hud.prompt(`E · 拾取「${def.name}」`); }
    }
    if (!this.nearInteractPickup && !this.nearInteract) this.hud.prompt(null);
  }
  private nearInteractPickup: PickupEnt | null = null;

  private pick(p: PickupEnt) {
    const { item, count } = p.def;
    const def = ITEMS[item];
    sfx.pickup();
    p.taken = true;
    p.sprite.c.destroy();
    let msg = '';
    if (LORE[item]) {
      if (!this.save.lore.includes(item)) {
        this.save.lore.push(item);
        this.hud.toast(`📄 ${LORE[item].tag}「${LORE[item].title}」已收入情报墙`, 'lore');
        sfx.page();
      } else this.hud.toast(`已收集：${LORE[item].title}`, 'lore');
      this.save.lore.includes('log2') && this.openCellarBack();
      msg = 'lore';
    } else if (def.kind === 'quest') {
      if (item === 'flowerkey') this.st.keys.flower = true;
      if (item === 'pharmacykey') this.st.keys.pharmacy = true;
      if (item === 'powercell') this.st.hasPowercell = true;
      if (item === 'tape') { this.st.hasTape = true; if (!this.save.lore.includes('tapeLore')) { this.save.lore.push('tapeLore'); } }
      this.hud.toast(`🔑 获得「${def.name}」`, 'good');
    } else if (def.kind === 'gun' || def.kind === 'armor' || def.kind === 'melee') {
      if (def.kind !== 'melee' && this.st.slots.some(s => s && s.item === item)) {
        this.hud.toast('已拥有同型号武器', 'info');
      } else if (addSlot(this.st, item)) {
        const sl = this.st.slots.find(s => s && s.item === item)!;
        if (def.kind === 'gun') sl.count = def.mag!;
        if (def.kind === 'armor') sl.count = 1;
        this.hud.toast(`⚔️ 获得「${def.name}」按 ${this.slotNum(item)} 装备`, 'good');
        this.renderHotbar();
      } else { this.hud.toast('背包已满', 'bad'); }
    } else if (def.kind === 'ammo') {
      this.st.ammo += count ?? 30;
      this.hud.toast(`+${count ?? 30} 发 9mm 弹药`, 'info');
    } else if (def.kind === 'consumable') {
      const found = this.st.slots.find(s => s && s.item === item && s.count < def.stack!);
      if (found) found.count++;
      else if (addSlot(this.st, item)) {}
      else this.st.hp = Math.min(this.st.maxHp, this.st.hp + def.heal!);
      this.renderHotbar();
    } else {
      addBag(this.st, item, count ?? 1);
      this.hud.toast(`+${count ?? 1} ${def.name}`, 'info');
    }
    this.hud.hudTick(this.st, this.save);
  }
  private slotNum(item: string): string {
    const i = this.st.slots.findIndex(s => s && s.item === item);
    return i >= 0 ? String(i + 1) : '?';
  }

  // ---------- 交互 ----------
  private updateInteract(dt: number) {
    if (this.nearInteractPickup) return;
    this.nearInteract = null;
    let best = Infinity;
    for (const it of this.world.interacts) {
      const d = Math.hypot(it.x - this.px, it.y - this.py);
      if (d < it.r && d < best) { best = d; this.nearInteract = it; }
    }
    if (this.nearInteract) this.hud.prompt(`E · ${this.nearInteract.label}`);
    else if (!this.nearInteractPickup) this.hud.prompt(null);
  }
  private tryInteract() {
    this.hitIntercept?.();
    if (this.nearInteractPickup) { this.pick(this.nearInteractPickup); return; }
    const it = this.nearInteract;
    if (!it) return;
    switch (it.act) {
      case 'flowerpot': {
        if (this.st.keys.flower) { this.hud.toast('花盆下已经没有别的东西了。', 'info'); return; }
        this.st.keys.flower = true;
        sfx.unlock(); sfx.pickup();
        this.hud.toast('🗝️ 月季盆下压着一把钥匙——钥匙柄刻着「二院护士站」', 'good');
        break;
      }
      case 'drawer': {
        if (!this.st.keys.flower) { this.hud.toast('抽屉锁着。便条上说——钥匙埋在某个花盆下？', 'info'); sfx.deny(); return; }
        if (this.looted.has('drawer')) return;
        this.looted.add('drawer');
        this.save.lore.includes('log1') || this.save.lore.push('log1');
        this.st.keys.pharmacy = true;
        sfx.unlock(); sfx.page();
        this.hud.toast('📔 日志「市立二院封锁日志」已收入情报墙 · 拾得药房钥匙', 'lore');
        this.modalOpen(close => this.hud.openLore('log1', close));
        break;
      }
      case 'clock': {
        sfx.click();
        this.modalOpen(close => this.hud.openPuzzleClock(() => {
          this.openDoor('cellar', false);
          sfx.chime();
          this.hud.toast('⚙️ 齿轮咬合——钟楼旁的一扇暗门滑开了……', 'lore');
          this.hud.toast('隐藏房间「钟楼地窖」已开启', 'good');
          close();
        }, close));
        break;
      }
      case 'chestB7': {
        if (this.looted.has('B7')) { this.hud.toast('B7 集装箱已经空了。', 'info'); return; }
        this.looted.add('B7');
        sfx.unlock();
        this.spawnItem('smg', it.x - 20, it.y - 10, Z.WH);
        this.spawnItem('titanium', it.x + 16, it.y + 14, Z.WH, 2);
        this.spawnItem('ammo', it.x + 4, it.y - 26, Z.WH, 30);
        this.hud.toast('🛢️ B7 箱被撬开！', 'good');
        break;
      }
      case 'truck818': {
        if (this.looted.has('truck')) { this.hud.toast('后备箱空了。', 'info'); return; }
        this.looted.add('truck');
        this.spawnItem('ammo', it.x, it.y - 20, Z.WH, 30);
        this.spawnItem('can', it.x + 30, it.y, Z.WH, 2);
        this.spawnItem('wire', it.x - 26, it.y + 6, Z.WH, 2);
        this.hud.toast('🚚 818 皮卡后备箱：弹药与补给', 'good');
        break;
      }
      case 'jukebox': {
        if (!this.st.hasTape) { this.hud.toast('点唱机是坏的——也许需要什么"特殊"的东西。（纸条5）', 'info'); sfx.deny(); return; }
        if (this.eventT >= 0) { this.hud.toast('第五声已经响过了。', 'info'); return; }
        this.startEvent();
        break;
      }
      case 'pharmaDoor': {
        if (!this.st.keys.pharmacy) {
          sfx.deny();
          this.hud.toast('门锁着。钥匙可能藏在医院某个抽屉里——护士站？', 'info');
          return;
        }
        if (!this.doors.find(d => d.id === 'pHarma')?.open) {
          this.openDoor('pHarma');
          this.hud.toast('💊 药房门开了——里面是「抗辐药剂」', 'good');
        }
        break;
      }
      case 'keypad': this.keypadInteract(); break;
      case 'extract': this.startExtract(); break;
    }
  }

  private openDoor(id: string, silent = false) {
    const d = this.doors.find(d => d.id === id);
    if (!d) return;
    if (d.open) return;
    d.open = true;
    d.sprite.visible = false;
    this.lockSolid(d.tx, d.ty, false);
    if (!silent) { sfx.unlock(); }
  }
  private openCellarBack() {
    if (!this.save.lore.includes('log2')) return;
    this.openDoor('cellarBack', true);
    this.openDoor('metroGate', true);
    if (!this.unlocked.has('back')) {
      this.unlocked.add('back');
      this.hud.toast('🗺️ 日志附图中标出「隧道尽头第三个出口」——地窖后门与隧道北闸已解锁', 'lore');
    }
  }

  // ---------- 钥匙码 UI ----------
  keypadInteract() {
    this.modalOpen(close => this.hud.openKeypad((code) => {
      if (code === '1024') {
        this.openDoor('storage');
        this.hud.toast('⚙️ 咔哒——储物间的门开了。', 'good');
        close();
        return true;
      }
      sfx.deny();
      this.hud.toast('密码错误。', 'bad');
      return false;
    }, close));
  }

  // ---------- 撤离 ----------
  private startExtract() {
    if (this.extractT !== null) return;
    if (!this.st.hasPowercell) {
      this.hud.toast('信标没有反应……需要「备用电源」。（线索指向钟楼底下）', 'info');
      sfx.deny();
      return;
    }
    this.extractT = 0;
    this.hud.toast('⚠️ 撤离信标启动中——保持位置！', 'good');
  }
  private updateExtraction(dt: number) {
    if (this.extractT === null) {
      // 靠近提示
      if (this.nearInteract?.act === 'extract') this.hud.extract(null);
      return;
    }
    const near = Math.hypot(this.beacon.c.position.x - this.px, this.beacon.c.position.y - this.py) < 130;
    if (!near || this.moving) {
      this.extractT = null; this.hud.extract(null);
      this.hud.toast('撤离未完成：请站在信标旁不要移动', 'bad');
      return;
    }
    this.extractT += dt;
    this.hud.extract(this.extractT / 4);
    this.beacon.beam.alpha = 0.25 + Math.sin(this.extractT * 8) * 0.12;
    if (this.extractT >= 4) { this.extract(); }
  }
  private extract() {
    this.done = true;
    sfx.extract();
    this.save.runs++; this.save.extractions++;
    this.save.bestTime = Math.max(this.save.bestTime, this.time);
    const lines: string[] = [];
    let gold = 0;
    // 战利品入仓库
    const put = (item: string, n: number) => { this.save.stash[item] = (this.save.stash[item] || 0) + n; };
    for (const [item, n] of Object.entries(this.st.bag)) { put(item, n); gold += (ITEMS[item]?.value || 0) * n; }
    for (const s of this.st.slots) {
      if (!s) continue;
      const def = ITEMS[s.item];
      if (def.kind === 'gun' || def.kind === 'armor') put(s.item, 1);
      if (def.kind === 'ammo') { this.st.ammo += s.count; }
      gold += (def.value || 0) * (def.kind === 'gun' || def.kind === 'armor' ? 1 : 0);
    }
    gold = Math.round(gold * this.st.infoMult);
    const infoLore = this.save.lore.length;
    gold += infoLore * 8;
    this.save.gold += gold;
    lines.push(`撤离成功 · 用时 ${fmtT(this.time)}`);
    lines.push(`战利品已送入仓库（资源 ${bagCount(this.st)} 件 + 装备）`);
    lines.push(`情报碎片 ×${infoLore}（每份估价 8 旧币）`);
    if (this.st.infoMult > 1) lines.push(`「第五声」情报加成 ×2`);
    lines.push(`结算旧币：<b>+${gold}</b>`);
    this.hud.openResult(true, lines, () => {});
    this.finishRun();
  }
  private die() {
    this.done = true;
    this.dead = true;
    this.save.runs++; this.save.deaths++;
    sfx.roar();
    let salvage = 0;
    for (const [item, n] of Object.entries(this.st.bag)) salvage += (ITEMS[item]?.value || 0) * n;
    for (const s of this.st.slots) if (s) salvage += ITEMS[s.item]?.value || 0;
    salvage = Math.round(salvage * 0.2);
    this.save.gold += salvage;
    const lines = [
      '你倒在了旧城区。带出来的东西全部丢失。',
      `残骸回收（20%）：<b>+${salvage}</b> 旧币`,
      `已收集的情报碎片不会丢失（${this.save.lore.length} 份）。`,
      '「再进去一次。答案就在钟楼底下。」',
    ];
    this.hud.openResult(false, lines, () => {});
    this.finishRun();
  }
  private finishRun() {
    storeSave(this.save);
  }

  // ---------- 事件「第五声」 ----------
  private startEvent() {
    this.eventT = 0;
    this.st.infoMult = 2;
    this.st.hasTape = false;
    sfx.event();
    this.rc.addShake(0.8);
    this.hud.toast('🎵 点唱机响了——不是旋律，是数数的声音……', 'lore');
    this.hud.toast('「……一、二、三、四——第五声，不在钟里。」', 'lore');
    this.hud.toast('⚠️ 钟楼方向传来巨响！', 'bad');
  }
  private updateEvent(dt: number) {
    if (this.eventT < 0) return;
    this.eventT += dt;
    if (this.eventT > 1.2 && !this.eventSpawned) {
      this.eventSpawned = true;
      const spots = [[42, 36], [54, 34], [38, 46], [58, 46], [50, 48], [46, 34]];
      for (const [tx, ty] of spots) {
        const x = tx * TILE, y = ty * TILE;
        const sprite = createHoundSprite(Math.random() < 0.34);
        sprite.c.position.set(x, y);
        sprite.c.zIndex = y;
        this.rc.objLayer.addChild(sprite.c);
        this.enemies.push({
          x, y, hp: 90, maxHp: 90, r: 13, elite: false, speed: 150, state: 'chase',
          patrol: [], pi: 0, alert: 6, t: 0, actT: 0, cool: 0, repath: 0, path: null, pathOK: false,
          hitT: 0, sprite, zone: Z.CEN, barkT: 1,
          wx: x, wy: y, waitT: 0, stuckT: 0, home: { x, y },
        });
      }
      this.alarmNearby(this.px, this.py, 999);
      sfx.roar();
    }
    if (this.eventT > 3 && !this.eventDoneFlag) {
      this.eventDoneFlag = true;
      this.save.radioDoorOpen = true;
      this.openDoor('radioBack', true);
      this.hud.toast('📻 广播站的后门回响了一声——「下次，从后面进来。」', 'lore');
    }
  }
  private eventDoneFlag = false;

  // ---------- 光效（30Hz 节流，静态光源不逐帧重绘） ----------
  private lightAcc = 1;
  private updateLights(dt: number) {
    for (let i = this.lights.length - 1; i >= 0; i--) {
      this.lights[i].ttl -= dt;
      if (this.lights[i].ttl <= 0) this.lights.splice(i, 1);
    }
    this.lightAcc += dt;
    if (this.lightAcc < 1 / 30) return;
    this.lightAcc = 0;
    const lamps = this.world.lamps.length + this.lights.length;
    if (lamps) {
      const arr = new Array<{ x: number; y: number; r: number; a?: number }>(lamps);
      let i = 0;
      for (const l of this.world.lamps) arr[i++] = l;
      for (const l of this.lights) arr[i++] = l;
      this.rc.renderLight(this.px, this.py, this.aim, this.darkness(), this.darkColor(), arr, this.flashOn, dt);
    } else this.rc.renderLight(this.px, this.py, this.aim, this.darkness(), this.darkColor(), [], this.flashOn, dt);
  }
  private flashOn = false;
  private toggleFlash() { this.flashOn = !this.flashOn; }
  private darkness() {
    const phase = (this.time % 900) / 900;
    const dark = 0.18 + 0.22 * clamp((phase - 0.4) / 0.6, 0, 1);
    const z = ZONES[this.zoneNow]?.dark ?? 0;
    const metro = this.zoneNow === Z.MET ? 0.16 : 0;
    // 上限 0.46：即使身处无灯区也保留可见度
    return clamp(dark + z + metro + (this.eventT >= 0 ? 0.08 : 0), 0.1, 0.46);
  }
  private darkColor() {
    const phase = (this.time % 900) / 900;
    if (phase < 0.4) return 0x16273a;
    if (phase < 0.75) return 0x241a33;
    return 0x0e1220;
  }

  // ---------- 特效 ----------
  private updateFx(dt: number) {
    const g = this.tracersG;
    g.clear();
    for (let i = this.tracer.length - 1; i >= 0; i--) {
      const t = this.tracer[i];
      t.ttl -= dt;
      if (t.ttl <= 0) { this.tracer.splice(i, 1); continue; }
      g.moveTo(t.x0, t.y0).lineTo(t.x1, t.y1).stroke({ width: 2.2, color: 0xffd98a, alpha: t.ttl / 0.09 * 0.9 });
    }
    // 挥砍弧光
    if (this.meleeT > 0) {
      const k = 1 - this.meleeT / 0.22;
      const a0 = this.aim - 1.1 + k * 2.2;
      const R = 62;
      const seg = 12;
      g.moveTo(this.px + Math.cos(a0) * R, this.py + Math.sin(a0) * R);
      for (let i = 1; i <= seg; i++) {
        const a = a0 + (2.2 * i) / seg;
        g.lineTo(this.px + Math.cos(a) * R, this.py + Math.sin(a) * R);
      }
      g.stroke({ width: 6 - k * 3, color: 0xfff0d0, alpha: (1 - k) * 0.85 });
      g.moveTo(this.px + Math.cos(a0) * R * 0.6, this.py + Math.sin(a0) * R * 0.6);
      for (let i = 1; i <= seg; i++) {
        const a = a0 + (2.2 * i) / seg;
        g.lineTo(this.px + Math.cos(a) * R * 0.6, this.py + Math.sin(a) * R * 0.6);
      }
      g.stroke({ width: 10 - k * 5, color: 0xffffff, alpha: (1 - k) * 0.35 });
    }
    this.tracersG.zIndex = 30;
    if (!this.tracersG.parent) this.rc.objLayer.addChild(this.tracersG);
  }

  // ---------- 区域 ----------
  private zoneAt(): number {
    const tx = Math.floor(this.px / TILE), ty = Math.floor(this.py / TILE);
    if (tx < 0 || ty < 0 || tx >= 96 || ty >= 96) return Z.NONE;
    return this.world.zoneId[ty * 96 + tx];
  }
  private zoneHintT = 0;
  private renderHud() {
    const z = this.zoneAt();
    if (z !== this.zoneNow) {
      this.zoneNow = z;
      this.hud.zone(ZONES[z]?.name ?? '旧城郊野');
      if (z === Z.MET) this.hud.toast('手电筒已自动打开（F 切换）', 'info');
      if (z === Z.NONE && this.zoneHintT <= 0) {
        this.zoneHintT = 18;
        this.hud.toast('荒野无人区——路灯尽头才是旧城，沿道路返回。', 'info');
      }
      this.refreshBeaconBeam();
    }
    this.zoneHintT = Math.max(0, this.zoneHintT - 1 / 30);
    this.hud.hudTick(this.st, this.save);
    // 小地图探明
  }
  private refreshBeaconBeam() {
    const powered = this.st.hasPowercell;
    this.beacon.beam.visible = powered;
    this.beacon.beam.alpha = 0.18;
  }

  // ---------- HUD / UI ----------
  private renderHotbar() {
    this.hud.setHud({ hotbar: this.st.slots, slotIdx: this.slotIdx, ammo: this.st.ammo });
  }
  private invOpen = false;
  private toggleInv() {
    if (this.done) return;
    if (this.invOpen) { this.invOpen = false; this.paused = false; this.hud.closeAll(); return; }
    if (this.paused) return;
    this.invOpen = true; this.paused = true;
    this.hud.openInv(this.st, this.world, (i) => { this.useSlot(i); }, () => { this.invOpen = false; this.paused = false; });
  }
  private togglePause() {
    if (this.done) return;
    if (this.paused) { this.hud.closeAll(); this.paused = false; this.invOpen = false; return; }
    this.openMenu();
  }
  /** 顶部菜单按钮 */
  openMenu() {
    if (this.done || this.paused) return;
    this.paused = true;
    this.hud.openMenu(
      () => { this.paused = false; },
      () => { location.reload(); },
      (k, v) => this.applySetting(k, v),
    );
  }
  private applySetting(k: string, v: number | boolean) {
    if (k === 'lightFx') { this.settings.lightFx = !!v; }
    if (k === 'shake') this.settings.shake = !!v;
    if (k === 'volume') { this.settings.volume = v as number; sfx.setVolume(v as number); }
  }
  /** 供 HUD 点击菜单 */
  menuButton() { this.openMenu(); }
  setDead() { this.dead = true; }
  private useSlot(i: number) {
    const s = this.st.slots[i];
    if (!s) return;
    const def = ITEMS[s.item];
    if (def.kind === 'consumable') {
      this.st.hp = Math.min(this.st.maxHp, this.st.hp + def.heal!);
      this.st.slots[i] = null;
      sfx.pickup();
      this.hud.toast(`🍖 吃掉了「${def.name}」 +${def.heal} HP`, 'good');
      if (i === this.slotIdx) this.replaceWeapon();
      this.renderHotbar();
    }
    this.hud.hudTick(this.st, this.save);
  }
  canUse(i: number): boolean { return !!this.st.slots[i] && ITEMS[this.st.slots[i]!.item].kind === 'consumable'; }

  // 供 UI 查询
  get ammo() { return this.st.ammo; }
  get slot() { return this.st.slots[this.slotIdx]; }
}

function fmtT(s: number) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}
