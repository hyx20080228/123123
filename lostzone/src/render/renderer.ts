// ============ 渲染器 v2：无缝瓦片 / 伪3D墙 / 光影 / 小地图 / 镜头 ============
import { Application, Container, Graphics, Sprite, Texture, RenderTexture } from 'pixi.js';
import { World, T, Z, TILE, W, H, ZONES, isSolidTile } from '../world/mapgen';
import { gget, clamp, lerp } from '../core/util';

function hash2(x: number, y: number, salt = 0): number {
  let h = (x * 374761393 + y * 668265263 + salt * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 地面/墙 基础色 */
function tileBaseColor(id: number): number {
  switch (id) {
    case T.GRASS: return 0x6f8f52;
    case T.ROAD: return 0x5a6472;
    case T.PLAZA: return 0xb3a88f;
    case T.YARD: return 0xb09a6a;
    case T.TRACK: return 0x2b3238;
    case T.RES_F: return 0xc8a06a; case T.RES_W: return 0xd9c294;
    case T.HOS_F: return 0xcfe0e4; case T.HOS_W: return 0xd3dde0;
    case T.WH_F: return 0x8f9287; case T.WH_W: return 0xa26a44;
    case T.MET_F: return 0x2f5a66; case T.MET_W: return 0x3d4a58;
    case T.RAD_F: return 0x6a5a72; case T.RAD_W: return 0x574760;
    case T.CEL_F: return 0x7a6a52; case T.CEL_W: return 0x4a3f38;
    default: return 0x888888;
  }
}

/** 墙：顶面 + 立面 + 底边（伪 3D） */
function paintWall(g: Graphics, x: number, y: number, id: number, belowIsFloor: boolean) {
  const base = tileBaseColor(id);
  const topC = base;
  const faceC = Math.max(0, Math.min(0xffffff, ((base >> 16 & 255) * 0.62 << 16) | ((base >> 8 & 255) * 0.62) | ((base & 255) * 0.62)));
  const px = x * TILE, py = y * TILE;
  // 顶面（上 55%）
  g.rect(px, py, TILE, 18).fill(topC);
  // 立面（下 45%）
  g.rect(px, py + 18, TILE, 14).fill(faceC);
  // 顶面高光线 / 立面纹理
  g.rect(px + 2, py + 2, TILE - 4, 2).fill({ color: 0xffffff, alpha: 0.18 });
  g.moveTo(px + 0.5, py + 17).lineTo(px + TILE - 0.5, py + 17).stroke({ width: 1, color: 0x000000, alpha: 0.25 });
  if (belowIsFloor) {
    // 面向玩家的立面底部投影（立体感）
    g.rect(px, py + 30, TILE, 4).fill({ color: 0x000000, alpha: 0.22 });
    g.rect(px, py + 26, TILE, 2).fill({ color: 0xffffff, alpha: 0.10 });
  }
  // 底部描边
  g.rect(px, py + TILE - 1.6, TILE, 1.6).fill({ color: 0x1e1a16, alpha: 0.85 });
  // 随机砖缝
  const r = hash2(x, y, 9);
  if (r < 0.4) g.moveTo(px + 10, py + 19).lineTo(px + 10, py + 31).stroke({ width: 1, color: 0x000000, alpha: 0.15 });
  else if (r < 0.7) g.moveTo(px + 22, py + 19).lineTo(px + 22, py + 31).stroke({ width: 1, color: 0x000000, alpha: 0.15 });
}

function paintDecor(g: Graphics, id: number, x: number, y: number) {
  const r1 = hash2(x, y, 1), r2 = hash2(x, y, 2), r3 = hash2(x, y, 3);
  const cx = x * TILE + r1 * 28 + 2, cy = y * TILE + r2 * 28 + 2;
  if (id === T.GRASS) {
    if (r3 < 0.65) g.circle(cx, cy, 0.8 + r2 * 1.5).fill({ color: r1 < .5 ? 0x5c7c42 : 0x7da05a, alpha: .5 });
    if (r3 < 0.18) { g.moveTo(cx, cy + 3).lineTo(cx - 1.5, cy - 3).moveTo(cx, cy + 3).lineTo(cx + 1.5, cy - 3).moveTo(cx, cy + 3).lineTo(cx, cy - 4).stroke({ width: 1, color: 0x3f6230, alpha: .8 }); }
    if (r3 > 0.965) g.ellipse(cx - 8, cy + 6, 6, 3).fill({ color: 0x5c7c42, alpha: .4 });
  } else if (id === T.ROAD) {
    if (r3 < 0.45) g.circle(cx, cy, 0.7 + r1 * 1.1).fill({ color: 0x4a525e, alpha: .45 });
    if (r3 < 0.1) { g.moveTo(cx, cy).lineTo(cx + (r2 - .5) * 18, cy + (r1 - .5) * 18).stroke({ width: 1, color: 0x3c434e, alpha: .65 }); }
    if (r2 > 0.955) g.circle(cx, cy, 3).fill({ color: 0x424a55, alpha: .55 });
  } else if (id === T.PLAZA) {
    g.moveTo(x * TILE, y * TILE + 1).lineTo(x * TILE + TILE, y * TILE + 1).stroke({ width: 1, color: 0x998f78, alpha: .5 });
    g.moveTo(x * TILE + 1, y * TILE).lineTo(x * TILE + 1, y * TILE + TILE).stroke({ width: 1, color: 0x998f78, alpha: .5 });
    if (r3 < 0.2) g.circle(cx, cy, 1 + r1 * 2).fill({ color: 0x8e8570, alpha: .45 });
  } else if (id === T.YARD) {
    if (r3 < 0.45) g.circle(cx, cy, 0.8 + r2).fill({ color: 0x97805a, alpha: .55 });
    if (r3 < 0.1) { g.moveTo(cx, cy + 4).lineTo(cx, cy - 4).stroke({ width: 1, color: 0x7a8c4a, alpha: .7 }); }
  } else if (id === T.RES_F) {
    g.moveTo(x * TILE, y * TILE + 10).lineTo(x * TILE + TILE, y * TILE + 10).stroke({ width: 1, color: 0x9a7848, alpha: .5 });
    g.moveTo(x * TILE, y * TILE + 21).lineTo(x * TILE + TILE, y * TILE + 21).stroke({ width: 1, color: 0x9a7848, alpha: .5 });
    if (r3 < 0.18) g.circle(cx, cy, 1).fill({ color: 0x8a6a40, alpha: .45 });
  } else if (id === T.HOS_F) {
    g.moveTo(x * TILE + 16, y * TILE).lineTo(x * TILE + 16, y * TILE + TILE).stroke({ width: 1, color: 0xa8bfc4, alpha: .45 });
    g.moveTo(x * TILE, y * TILE + 16).lineTo(x * TILE + TILE, y * TILE + 16).stroke({ width: 1, color: 0xa8bfc4, alpha: .45 });
    if (r3 < 0.1) g.circle(cx, cy, 1.4).fill({ color: 0x9ab4ba, alpha: .35 });
  } else if (id === T.WH_F) {
    g.moveTo(x * TILE, y * TILE + 8).lineTo(x * TILE + TILE, y * TILE + 8).stroke({ width: 1, color: 0x76796f, alpha: .45 });
    if (r3 < 0.16) { g.moveTo(cx, cy).lineTo(cx + 12, cy + 4).stroke({ width: 1, color: 0x6d7066, alpha: .55 }); }
  } else if (id === T.MET_F) {
    g.moveTo(x * TILE + 16, y * TILE).lineTo(x * TILE + 16, y * TILE + TILE).stroke({ width: 1, color: 0x24444f, alpha: .55 });
    g.moveTo(x * TILE, y * TILE + 16).lineTo(x * TILE + TILE, y * TILE + 16).stroke({ width: 1, color: 0x24444f, alpha: .55 });
    if (r3 < 0.22) g.ellipse(cx, cy, 4, 2).fill({ color: 0x1f3944, alpha: .3 });
  } else if (id === T.RAD_F) {
    g.moveTo(x * TILE + 16, y * TILE).lineTo(x * TILE + 16, y * TILE + TILE).stroke({ width: 1, color: 0x51445c, alpha: .55 });
    if (r3 < 0.18) g.circle(cx, cy, 1.2).fill({ color: 0x4a3e54, alpha: .45 });
  } else if (id === T.CEL_F) {
    if (r3 < 0.45) g.circle(cx, cy, 1 + r1 * 1.6).fill({ color: 0x5d4f3e, alpha: .55 });
    if (r3 < 0.12) g.moveTo(cx, cy).lineTo(cx + 10, cy + 8).stroke({ width: 1, color: 0x544836, alpha: .65 });
  }
}

// ============================================================
export class RendererCtx {
  tileLayer = new Container();
  objLayer = new Container();
  fxLayer = new Container();
  private lightRT!: RenderTexture;
  private lightC = new Container();
  private overlay!: Sprite;
  private gradTex!: Texture;
  private coneTex!: Texture;
  private camera = { x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0 };

  private settings: { lightFx: boolean; shake?: boolean };
  constructor(private app: Application, private world: World, settings: { lightFx: boolean; shake?: boolean } = { lightFx: true }) {
    this.settings = settings;
    this.buildTiles();
    this.buildLighting();
    this.objLayer.sortableChildren = true;
    this.fxLayer.sortableChildren = true;
    app.stage.addChild(this.tileLayer, this.objLayer, this.fxLayer);
    window.addEventListener('resize', () => this.resizeLight());
    this.resizeLight();
    // 初始渲染一次光影，避免首帧黑屏
    this.renderLight(world.spawn.x, world.spawn.y, 0, 0.35, 0x16273a, [], false, 0.016);
  }

  get cam() { return this.camera; }

  // ---------- 瓦片分块（4 大块，边缘外扩 1px 防黑缝） ----------
  private buildTiles() {
    const { grid } = this.world;
    const CS = 48; // 每块 48x48 瓦 = 1536px
    const PAD = 1;
    for (let cy = 0; cy < H / CS; cy++) for (let cx = 0; cx < W / CS; cx++) {
      const g = new Graphics();
      for (let y = cy * CS; y < (cy + 1) * CS; y++) for (let x = cx * CS; x < (cx + 1) * CS; x++) {
        const id = gget(grid, x, y);
        const r = hash2(x, y, 7);
        const below = gget(grid, x, y + 1);
        const belowIsFloor = !isSolidTile(below);
        if (isSolidTile(id)) {
          paintWall(g, x, y, id, belowIsFloor);
        } else {
          const base = tileBaseColor(id);
          const shade = 1 - Math.floor(r * 3) * 0.03;
          const c = ((base >> 16 & 255) * shade) << 16 | ((base >> 8 & 255) * shade) << 8 | ((base & 255) * shade);
          // 外扩 PAD 消除瓦片间黑缝
          g.rect(x * TILE - PAD, y * TILE - PAD, TILE + PAD * 2, TILE + PAD * 2).fill(c);
          paintDecor(g, id, x, y);
        }
      }
      // 生成纹理（带 clearColor 与抗锯齿，彻底消除边缘黑缝）
      let spr: Sprite | null = null;
      let gDestroyed = false;
      try {
        const tex = this.app.renderer.generateTexture({ target: g, clearColor: '#00000000', antialias: true });
        spr = new Sprite(tex);
        spr.position.set(cx * CS * TILE - PAD, cy * CS * TILE - PAD);
        g.destroy(); gDestroyed = true;
      } catch {
        g.position.set(cx * CS * TILE - PAD, cy * CS * TILE - PAD);
      }
      if (spr) this.tileLayer.addChild(spr);
      else if (!gDestroyed) this.tileLayer.addChild(g);
    }
  }

  // ---------- 光影 ----------
  private buildLighting() {
    const mk = (fn: (ctx: CanvasRenderingContext2D) => void) => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256;
      const ctx = c.getContext('2d')!;
      fn(ctx);
      return Texture.from(c);
    };
    this.gradTex = mk(ctx => {
      const gr = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.55, 'rgba(255,255,255,0.75)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, 256, 256);
    });
    this.coneTex = mk(ctx => {
      const g2 = ctx.createLinearGradient(0, 128, 256, 128);
      g2.addColorStop(0, 'rgba(255,255,255,0)');
      g2.addColorStop(0.3, 'rgba(255,255,255,0.85)');
      g2.addColorStop(0.7, 'rgba(255,255,255,0.85)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2; ctx.fillRect(0, 0, 256, 256);
      const grd = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.fillStyle = grd; ctx.fillRect(0, 0, 256, 256);
    });
    this.resizeLight();
  }

  private resizeLight() {
    const w = this.app.screen.width, h = this.app.screen.height;
    this.lightRT = RenderTexture.create({ width: Math.max(2, Math.ceil(w)), height: Math.max(2, Math.ceil(h)) });
    if (!this.overlay) {
      this.overlay = new Sprite(this.lightRT);
      this.overlay.zIndex = 100;
      this.app.stage.addChild(this.overlay);
    } else this.overlay.texture = this.lightRT;
  }

  renderLight(px: number, py: number, aim: number, dark: number, tint: number,
    lights: { x: number; y: number; r: number; a?: number }[], flashlight: boolean, dt: number) {
    if (!this.settings.lightFx) { if (this.overlay) this.overlay.visible = false; return; }
    try {
      const sx = this.app.screen.width / 2, sy = this.app.screen.height / 2;
      this.lightC.removeChildren();
      const darkRect = new Graphics();
      darkRect.rect(0, 0, this.app.screen.width, this.app.screen.height).fill({ color: tint, alpha: Math.min(0.6, dark) });
      this.lightC.addChild(darkRect);
      const add = (wx: number, wy: number, r: number, a: number) => {
        const s = new Sprite(this.gradTex);
        s.position.set(wx - this.camera.x + sx, wy - this.camera.y + sy);
        s.blendMode = 'erase';
        s.scale.set(r / 128 * (a || 1));
        this.lightC.addChild(s);
      };
      add(px, py, flashlight ? 300 : 265, 1);
      for (const l of lights) add(l.x, l.y, l.r, l.a ?? 1);
      if (flashlight) {
        const cone = new Sprite(this.coneTex);
        cone.position.set(px - this.camera.x + sx, py - this.camera.y + sy);
        cone.rotation = aim;
        cone.blendMode = 'erase';
        cone.scale.set(3.2, 3.2);
        this.lightC.addChild(cone);
      }
      this.app.renderer.render({ container: this.lightC, target: this.lightRT });
      this.overlay.visible = true;
    } catch { if (this.overlay) this.overlay.visible = false; }
  }

  // ---------- 镜头（整数对齐消除半像素缝隙） ----------
  follow(dt: number, tx: number, ty: number) {
    this.camera.x = lerp(this.camera.x, tx, Math.min(1, dt * 6));
    this.camera.y = lerp(this.camera.y, ty, Math.min(1, dt * 6));
    if (this.camera.shake > 0) {
      this.camera.shake -= dt * 3;
      this.camera.shakeX = (Math.random() - 0.5) * this.camera.shake * 14;
      this.camera.shakeY = (Math.random() - 0.5) * this.camera.shake * 14;
    } else { this.camera.shakeX = 0; this.camera.shakeY = 0; }
    const sx = this.app.screen.width / 2, sy = this.app.screen.height / 2;
    const ox = Math.round(sx - this.camera.x + this.camera.shakeX);
    const oy = Math.round(sy - this.camera.y + this.camera.shakeY);
    this.tileLayer.position.set(ox, oy);
    this.objLayer.position.copyFrom(this.tileLayer.position);
    this.fxLayer.position.copyFrom(this.tileLayer.position);
  }

  addShake(n: number) { this.camera.shake = Math.min(1.2, this.camera.shake + n); }
  worldToScreen(x: number, y: number) {
    return { x: x - this.camera.x + this.app.screen.width / 2, y: y - this.camera.y + this.app.screen.height / 2 };
  }
}
