// ============ 程序化矢量美术：角色 / 锈犬 / 道具 / 拾取物 ============
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CharDef } from '../core/defs';
import { TAU } from '../core/util';

const OUT = 0x2c2620;

function g(): Graphics { return new Graphics(); }

// ---------- 角色 ----------
export interface CharSprite {
  c: Container; char: CharDef;
  body: Graphics; head: Graphics; earL: Graphics; earR: Graphics; legL: Graphics; legR: Graphics;
  armL: Graphics; armR: Graphics; weapon: Container; scarf?: Graphics; pack?: Graphics;
  shadow: Graphics;
}

export function createCharSprite(char: CharDef): CharSprite {
  const c = new Container();
  const shadow = g().ellipse(0, 20, 19, 7).fill({ color: 0x000000, alpha: 0.28 });
  shadow.zIndex = -1;
  // 腿
  const legL = g(); const legR = g();
  drawLeg(legL, -7, char.body); drawLeg(legR, 7, char.body);
  // 身体
  const body = g();
  body.roundRect(-15, -4, 30, 26, 12).fill(char.body).stroke({ width: 3, color: OUT });
  body.ellipse(0, 10, 10.5, 7.5).fill(char.belly).stroke({ width: 2, color: OUT, alpha: 0.85 });
  // 书包（猫/浣熊）
  const pack = g();
  pack.roundRect(-20, -2, 9, 16, 4).fill(0x7a5c3e).stroke({ width: 2.5, color: OUT });
  pack.roundRect(-19, 2, 7, 5, 2).fill(0x93714f);
  // 头
  const head = g();
  const earL = g(), earR = g();
  drawEars(earL, earR, head, char);
  head.circle(0, -20, 16).fill(char.body).stroke({ width: 3, color: OUT });
  head.ellipse(0, -16.5, 9, 6.5).fill(char.belly).stroke({ width: 1.5, color: OUT, alpha: 0.5 });
  // 脸
  head.circle(-6, -21, 2.4).fill(0x241d18); head.circle(6, -21, 2.4).fill(0x241d18);
  head.circle(-6.6, -21.6, 0.9).fill(0xffffff); head.circle(5.4, -21.6, 0.9).fill(0xffffff);
  head.ellipse(0, -13.5, 4.6, 3).fill(0xd97b6a).stroke({ width: 1.2, color: 0xa04a3c, alpha: .7 });
  head.moveTo(0, -13.2).lineTo(0, -11).stroke({ width: 1.4, color: 0xa04a3c });
  // 物种特征
  if (char.id === 'cat') {
    head.moveTo(-7, -11).lineTo(-12, -9); head.moveTo(7, -11).lineTo(12, -9);
    head.stroke({ width: 1.2, color: 0xffffff, alpha: .8 });
    head.circle(0, -27, 3).fill(char.accent); // 额纹
  } else if (char.id === 'rabbit') {
    const scarf = g();
    scarf.roundRect(-11, -8, 22, 5, 2.5).fill(0xc23b3b).stroke({ width: 2, color: OUT });
    scarf.poly([8, -7, 14, -2, 9, 5, 5, 0]).fill(0xc23b3b).stroke({ width: 2, color: OUT });
    head.circle(0, -25, 1.6).fill(0xffffff);
  } else if (char.id === 'raccoon') {
    head.ellipse(-7, -22, 3.4, 2.6).fill(0x4a4238); head.ellipse(7, -22, 3.4, 2.6).fill(0x4a4238);
    head.moveTo(-12, -26).lineTo(-16, -18).stroke({ width: 2, color: 0x4a4238 });
    head.moveTo(12, -26).lineTo(16, -18).stroke({ width: 2, color: 0x4a4238 });
  } else { // fowl 狐鸮
    head.moveTo(-8, -31).lineTo(-13, -41).lineTo(-4, -33).stroke({ width: 2.4, color: OUT });
    head.moveTo(8, -31).lineTo(13, -41).lineTo(4, -33).stroke({ width: 2.4, color: OUT });
    head.moveTo(-2.4, -23).lineTo(-1, -20.6).stroke({ width: 1.6, color: 0x7a5c3e });
    head.moveTo(2.4, -23).lineTo(1, -20.6).stroke({ width: 1.6, color: 0x7a5c3e });
  }
  // 手臂
  const armL = g(), armR = g();
  drawArm(armL, -13, char.body); drawArm(armR, 13, char.body);
  // 武器挂点
  const weapon = new Container();
  c.addChild(shadow, legL, legR, body, pack, armL, armR, head, earL, earR, weapon);
  const spr: CharSprite = { c, char, body, head, earL, earR, legL, legR, armL, armR, weapon, shadow, pack };
  spr.c.sortableChildren = true;
  return spr;
}

function drawLeg(gx: Graphics, x: number, color: string) {
  gx.roundRect(x - 4, 10, 8, 13, 4).fill(color).stroke({ width: 2.4, color: OUT });
  gx.roundRect(x - 5, 21, 10, 5, 2.5).fill(0x5b4632).stroke({ width: 2, color: OUT });
}
function drawArm(gx: Graphics, x: number, color: string) {
  gx.roundRect(x - 3.5, 0, 7, 13, 3.5).fill(color).stroke({ width: 2.2, color: OUT });
  gx.circle(x, 14, 3.6).fill(color).stroke({ width: 2, color: OUT });
}
function drawEars(earL: Graphics, earR: Graphics, head: Graphics, char: CharDef) {
  if (char.id === 'cat') {
    earL.poly([-16, -28, -9, -40, -3, -30]).fill(char.body).stroke({ width: 2.6, color: OUT });
    earR.poly([16, -28, 9, -40, 3, -30]).fill(char.body).stroke({ width: 2.6, color: OUT });
    earL.poly([-13, -29.4, -9.5, -36, -6.6, -29.8]).fill(0xf0a3ab);
    earR.poly([13, -29.4, 9.5, -36, 6.6, -29.8]).fill(0xf0a3ab);
  } else if (char.id === 'rabbit') {
    earL.ellipse(-9, -40, 4.4, 13).fill(char.body).stroke({ width: 2.6, color: OUT });
    earR.ellipse(9, -40, 4.4, 13).fill(char.body).stroke({ width: 2.6, color: OUT });
    earL.ellipse(-9, -40, 2.2, 9).fill(0xf0a3ab);
    earR.ellipse(9, -40, 2.2, 9).fill(0xf0a3ab);
  } else if (char.id === 'raccoon') {
    earL.circle(-11, -32, 5).fill(char.body).stroke({ width: 2.4, color: OUT });
    earR.circle(11, -32, 5).fill(char.body).stroke({ width: 2.4, color: OUT });
    earL.circle(-11, -32, 2.2).fill(0x4a4238);
    earR.circle(11, -32, 2.2).fill(0x4a4238);
  } else {
    earL.ellipse(-8, -38, 3.6, 8).fill(char.body).stroke({ width: 2.4, color: OUT });
    earR.ellipse(8, -38, 3.6, 8).fill(char.body).stroke({ width: 2.4, color: OUT });
  }
}

export function poseChar(s: CharSprite, walkT: number, moving: boolean, aimAng: number, hitT: number, sprint: boolean) {
  const sw = moving ? Math.sin(walkT * (sprint ? 16 : 11)) : 0;
  const bob = moving ? Math.abs(Math.sin(walkT * (sprint ? 16 : 11))) * 2.2 : Math.sin(walkT * 1.4) * 0.6;
  s.c.position.y = -bob;
  s.legL.y = sw * 3.4; s.legR.y = -sw * 3.4;
  s.legL.rotation = sw * 0.35; s.legR.rotation = -sw * 0.35;
  const flip = Math.cos(aimAng) < -0.1;
  s.c.scale.x = flip ? -1 : 1;
  // 手臂朝准星
  const a = flip ? Math.PI - aimAng : aimAng;
  s.armR.x = 8; s.armR.y = 2; s.armR.rotation = flip ? Math.PI - a : a;
  if (flip) s.armR.x = -8;
  s.weapon.visible = true;
  s.weapon.position.set(flip ? -16 : 16, 4);
  s.weapon.rotation = flip ? Math.PI - a : a;
  s.weapon.scale.x = flip ? -1 : 1;
  s.weapon.alpha = 1;
  // 受击白光
  const flash = hitT > 0 ? Math.min(1, hitT * 8) : 0;
  s.head.tint = flash > 0 ? 0xffc0b0 : 0xffffff;
  s.body.tint = flash > 0 ? 0xffc0b0 : 0xffffff;
}

// ---------- 武器绘制（挂到角色手上） ----------
export function makeWeapon(itemId: string): Container {
  const c = new Container();
  const w = g();
  if (itemId === 'cleaver') {
    w.roundRect(-2, -3, 14, 6, 2).fill(0xc9c9c9).stroke({ width: 1.6, color: OUT });
    w.roundRect(10, -4.5, 10, 9, 2).fill(0x999).stroke({ width: 1.6, color: OUT });
    w.roundRect(18, -3.5, 16, 7, 3).fill(0xb7b7b7).stroke({ width: 1.8, color: OUT });
    w.roundRect(33, -5, 8, 10, 1).fill(0x6a4a2e).stroke({ width: 1.6, color: OUT });
  } else if (itemId === 'p9') {
    w.roundRect(-4, -5, 30, 8, 2).fill(0x3a3a42).stroke({ width: 1.8, color: OUT });
    w.poly([4, 1, 10, 1, 8, 11, 3, 11]).fill(0x4a4a55).stroke({ width: 1.4, color: OUT });
    w.roundRect(20, -7, 6, 3, 1).fill(0x22242a);
  } else if (itemId === 'smg') {
    w.roundRect(-6, -5, 34, 8, 2).fill(0x37413a).stroke({ width: 1.8, color: OUT });
    w.roundRect(4, 1, 7, 9, 1).fill(0x2c352f).stroke({ width: 1.4, color: OUT });
    w.roundRect(-6, -1, 8, 3, 1).fill(0x22242a);
    w.roundRect(22, 2, 6, 7, 2).fill(0x2c352f).stroke({ width: 1.4, color: OUT });
    w.roundRect(24, 8, 4, 4, 1).fill(0x8a6a34).stroke({ width: 1.2, color: OUT });
  }
  c.addChild(w);
  return c;
}

// ---------- 锈犬 ----------
export interface HoundSprite { c: Container; body: Graphics; head: Graphics; legs: Graphics[]; tail: Graphics; light: Graphics; shadow: Graphics; parts: Graphics[] }
export function createHoundSprite(elite: boolean): HoundSprite {
  const c = new Container();
  const c1 = elite ? 0x8a2f2a : 0x8a5a30;
  const c2 = elite ? 0x5a1e1c : 0x6a4526;
  const body = g();
  body.ellipse(0, 0, 17, 10).fill(c1).stroke({ width: 2.6, color: OUT });
  body.ellipse(-5, 1, 10, 6).fill(c2).stroke({ width: 1.6, color: OUT, alpha: .6 });
  const head = g();
  head.circle(15, -3, 8).fill(c1).stroke({ width: 2.4, color: OUT });
  head.poly([20, -8, 30, -4, 20, 1]).fill(c1).stroke({ width: 2.2, color: OUT });
  head.circle(24, -4, 1.8).fill(0xff4a3c);
  head.circle(13, -7, 2.4).fill(0x2a2a2a);
  head.rect(11, -1, 9, 1.6).fill(0x2a2a2a);
  head.moveTo(8, -10).lineTo(10, -16).stroke({ width: 2, color: OUT });
  head.circle(10.5, -16.5, 1.6).fill(0xffa03c);
  const tail = g();
  tail.poly([-14, 0, -26, -8, -17, 4]).fill(c2).stroke({ width: 2.2, color: OUT });
  const light = g().circle(-25, -8, 2.6).fill(0xff4a3c).stroke({ width: 1.4, color: 0x5a0000 });
  const legs: Graphics[] = [];
  const legDef: [number, number, number][] = [[-9, 9, -1], [-4, 9, 1], [8, 8, -1], [12, 8, 1]];
  for (const [x, ly, sgn] of legDef) {
    const l = g().roundRect(x - 2.5, ly - 4, 5, 9, 2).fill(c2).stroke({ width: 1.8, color: OUT });
    (l as any).userData = sgn;
    legs.push(l);
  }
  const shadow = g().ellipse(0, 12, 20, 6).fill({ color: 0x000000, alpha: 0.26 });
  shadow.zIndex = -1;
  const parts = [body, head, ...legs, tail, light];
  c.addChild(shadow, body, head, tail, light, ...legs);
  c.sortableChildren = true;
  return { c, body, head, legs, tail, light, shadow, parts };
}
export function poseHound(s: HoundSprite, t: number, moving: boolean, alert: number, dead: boolean) {
  if (dead) {
    s.c.rotation = Math.PI / 2 + 0.3;
    s.c.alpha = 0.9; s.c.y = 4;
    s.light.alpha = 0; return;
  }
  const sw = moving ? Math.sin(t * 14) : 0;
  for (let i = 0; i < s.legs.length; i++) {
    const sgn = (s.legs[i] as any).userData;
    s.legs[i].y = sw * 3 * sgn;
    s.legs[i].rotation = sw * 0.4 * sgn;
  }
  s.head.y = Math.sin(t * 2.2) * 1.2 - 2;
  s.tail.rotation = Math.sin(t * 6) * 0.25;
  s.light.alpha = 0.75 + Math.sin(t * 9) * 0.25;
  const alertA = Math.min(1, alert);
  s.light.scale.set(1 + alertA * 0.6);
  s.light.tint = alertA > 0.5 ? 0xff2020 : 0xff4a3c;
}

// ---------- 道具 ----------
export function makeProp(kind: string, data?: any): Container {
  const c = new Container();
  const w = g();
  const shadow = g().ellipse(0, 10, 20, 7).fill({ color: 0x000000, alpha: 0.22 });
  switch (kind) {
    case 'crate': w.roundRect(-13, -13, 26, 26, 3).fill(0x9a6f42).stroke({ width: 2.4, color: OUT });
      w.moveTo(-13, 0).lineTo(13, 0).moveTo(0, -13).lineTo(0, 13).stroke({ width: 2, color: 0x6f4d2a }); break;
    case 'barrel': w.circle(0, 0, 11).fill(0x8a5030).stroke({ width: 2.4, color: OUT });
      w.circle(0, 0, 7.5).stroke({ width: 1.4, color: 0x623514 });
      w.circle(0, 0, 3).fill(0x623514); break;
    case 'bush': w.ellipse(-6, 4, 10, 6).fill(0x4f7a3a).stroke({ width: 2, color: OUT });
      w.ellipse(6, 2, 11, 7).fill(0x5d8c42).stroke({ width: 2, color: OUT });
      w.ellipse(0, -2, 12, 8).fill(0x6da04c).stroke({ width: 2, color: OUT }); break;
    case 'tree': w.circle(0, 2, 17).fill(0x3f6b32).stroke({ width: 2.4, color: 0x22451c });
      w.circle(-8, -6, 11).fill(0x4f7f3c).stroke({ width: 2.2, color: 0x22451c });
      w.circle(9, -4, 11).fill(0x578a42).stroke({ width: 2.2, color: 0x22451c });
      w.circle(0, -10, 12).fill(0x63a04a).stroke({ width: 2.2, color: 0x22451c }); break;
    case 'well': w.circle(0, 0, 13).fill(0x8b8b93).stroke({ width: 2.4, color: OUT });
      w.circle(0, 0, 8).fill(0x1d2a3a); w.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -8).lineTo(0, 8).stroke({ width: 2, color: 0x5a5a62 }); break;
    case 'bench': w.roundRect(-16, -7, 32, 9, 3).fill(0x8a6a42).stroke({ width: 2.2, color: OUT });
      w.roundRect(-11, 1, 4, 6, 1.4).fill(0x5f4629); w.roundRect(7, 1, 4, 6, 1.4).fill(0x5f4629); break;
    case 'car': w.roundRect(-22, -12, 44, 24, 7).fill(0x9a6a4a).stroke({ width: 2.4, color: OUT });
      w.roundRect(-13, -8, 26, 12, 4).fill(0x5d7a8a).stroke({ width: 1.6, color: OUT });
      w.roundRect(-16, 10, 8, 3, 1.4).fill(0x333); w.roundRect(8, 10, 8, 3, 1.4).fill(0x333);
      w.circle(-20, -7, 2.5).fill(0xffd98a); w.circle(20, -7, 2.5).fill(0xffd98a);
      w.ellipse(2, -6, 8, 3).fill({ color: 0x6f4a33, alpha: .8 }); break;
    case 'truck': w.roundRect(-30, -13, 60, 26, 5).fill(0x7a5f42).stroke({ width: 2.6, color: OUT });
      w.roundRect(-30, -9, 22, 18, 3).fill(0x93876f).stroke({ width: 2, color: OUT });
      w.roundRect(6, -7, 12, 10, 3).fill(0x5d7a8a).stroke({ width: 1.6, color: OUT });
      w.roundRect(-22, 12, 10, 3, 1.4).fill(0x333); w.roundRect(8, 12, 10, 3, 1.4).fill(0x333);
      if (data) {
        const t = new Text({ text: data.plate ?? '', style: new TextStyle({ fontSize: 9, fill: '#ffe9b0', fontFamily: 'monospace', fontWeight: '700' }) });
        t.position.set(-28, -8); w.addChild(t as any);
      }
      break;
    case 'container': w.roundRect(-30, -12, 60, 24, 4).fill(0xa85838).stroke({ width: 2.6, color: OUT });
      for (let i = -26; i < 28; i += 6) w.moveTo(i, -9).lineTo(i, 9).stroke({ width: 1.2, color: 0x7c3d26 });
      w.roundRect(-30, -6, 60, 3, 1).fill({ color: 0x6d3320, alpha: .7 }); break;
    case 'lamp': w.roundRect(-2, -14, 4, 20, 2).fill(0x4a4a52).stroke({ width: 1.8, color: OUT });
      w.circle(0, -16, 6).fill(0xffd98a).stroke({ width: 2, color: 0x8a6a34 });
      w.circle(0, -16, 3).fill(0xfff2c0); break;
    case 'bike': w.circle(-8, 2, 6).stroke({ width: 2.2, color: OUT }); w.circle(8, 2, 6).stroke({ width: 2.2, color: OUT });
      w.moveTo(-8, 2).lineTo(0, -6).lineTo(8, 2).moveTo(0, -6).lineTo(-1, 2).moveTo(0, -6).lineTo(2, 2).stroke({ width: 1.8, color: 0x8a5a30 }); break;
    case 'kiosk': w.roundRect(-16, -8, 32, 16, 4).fill(0x8a6a4a).stroke({ width: 2.4, color: OUT });
      w.roundRect(-18, -14, 36, 8, 3).fill(0xb04434).stroke({ width: 2.2, color: OUT });
      for (let i = -12; i <= 12; i += 6) w.moveTo(i, -14).lineTo(i - 3, -6).stroke({ width: 1.2, color: 0x7c2c24 }); break;
    case 'fridge': w.roundRect(-12, -14, 24, 28, 5).fill(0xbcd0d4).stroke({ width: 2.4, color: OUT });
      w.moveTo(-12, -2).lineTo(12, -2).stroke({ width: 1.6, color: 0x8aa0a4 });
      w.roundRect(-8, -10, 5, 2, 1).fill(0x5a6a6e); break;
    case 'bed': w.roundRect(-18, -8, 36, 18, 5).fill(0xc9c2b0).stroke({ width: 2.4, color: OUT });
      w.roundRect(10, -8, 8, 18, 3).fill(0x8a8375).stroke({ width: 2, color: OUT });
      w.roundRect(-14, -7, 22, 7, 3).fill(0x9fb8c9); break;
    case 'shelf': w.roundRect(-11, -12, 22, 24, 3).fill(0x8a6f4d).stroke({ width: 2.4, color: OUT });
      w.moveTo(-11, -4).lineTo(11, -4).moveTo(-11, 4).lineTo(11, 4).stroke({ width: 1.6, color: 0x5f4630 });
      w.circle(-5, -8, 2).fill(0x5a9a5a); w.circle(4, 0, 2).fill(0xc9c9c9); w.rect(-3, 6, 3, 3).fill(0xe8d8b0); break;
    case 'counter': w.roundRect(-16, -8, 32, 16, 4).fill(0x96a8a8).stroke({ width: 2.4, color: OUT });
      w.roundRect(-16, -8, 32, 5, 2).fill(0xb8c8c8).stroke({ width: 1.6, color: OUT }); break;
    case 'hydrant': w.circle(0, 0, 7).fill(0xc05a32).stroke({ width: 2.2, color: OUT });
      w.roundRect(-3, -12, 6, 8, 2).fill(0xb04a28).stroke({ width: 1.8, color: OUT }); break;
    case 'tower': {
      w.roundRect(-6, 8, 12, 10, 3).fill(0x4a3f56).stroke({ width: 2, color: OUT });
      w.moveTo(0, 8).lineTo(-22, -26).moveTo(0, 8).lineTo(22, -26).moveTo(-11, -9).lineTo(11, -9)
        .moveTo(-5, -17).lineTo(5, -17).stroke({ width: 3, color: 0x4a3f56 });
      w.circle(0, -28, 5).fill(0x6a3d72).stroke({ width: 2, color: OUT });
      w.circle(0, -30, 8).stroke({ width: 1.6, color: 0x8a5d92 });
      w.circle(0, -30, 2).fill(0xff4a3c);
      const glow = g().circle(0, -30, 10).fill({ color: 0xff4a3c, alpha: 0.25 });
      c.addChild(glow);
      break;
    }
    case 'jukebox': w.roundRect(-13, -11, 26, 26, 6).fill(0xb04434).stroke({ width: 2.6, color: OUT });
      w.roundRect(-13, -17, 26, 8, 4).fill(0x8a2f2a).stroke({ width: 2, color: OUT });
      w.circle(0, -13, 5).fill(0xf5c86a).stroke({ width: 2, color: 0x8a6a34 });
      w.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -6).lineTo(0, 8).stroke({ width: 1.8, color: 0x7c2c24 }); break;
    case 'train': {
      w.roundRect(-110, -16, 220, 34, 10).fill(0x4a6a7c).stroke({ width: 3, color: OUT });
      for (let i = -96; i < 104; i += 24) {
        w.roundRect(i, -8, 16, 10, 3).fill(0x9fc3d4).stroke({ width: 1.4, color: OUT });
      }
      w.roundRect(-110, 10, 220, 6, 3).fill(0x2c3a44);
      for (let i = -100; i < 100; i += 24) w.roundRect(i, 6, 10, 4, 2).fill(0x222a2e);
      break;
    }
  }
  c.addChild(shadow, w);
  return c;
}

// ---------- 拾取物（本体 + 发光描边徽章） ----------
export interface PickupSprite { c: Container; ring: Graphics; icon: Text; glow: Graphics }
export function makePickupSprite(name: string, icon: string, color: string): PickupSprite {
  const c = new Container();
  const glow = g().circle(0, 0, 20).fill({ color: 0xffffff, alpha: 0 }).circle(0, 0, 13).fill({ color, alpha: 0.16 });
  const ring = g().circle(0, 0, 15).stroke({ width: 2.6, color });
  const badge = g().circle(0, 0, 13).fill(0x141a24).stroke({ width: 2.2, color });
  const iconText = new Text({ text: icon, style: new TextStyle({ fontSize: 16, align: 'center' }) });
  iconText.anchor.set(0.5);
  const label = new Text({ text: name, style: new TextStyle({ fontSize: 10, fill: '#ffedc9', stroke: { color: '#000', width: 3 }, fontWeight: '600' }) });
  label.anchor.set(0.5, 0); label.position.set(0, 18);
  c.addChild(glow, ring, badge, iconText, label);
  return { c, ring, icon: iconText, glow };
}
export function pulsePickup(p: PickupSprite, t: number, near: boolean) {
  const s = 1 + Math.sin(t * 3.4) * 0.06;
  p.c.scale.set(s);
  p.c.y = -Math.abs(Math.sin(t * 2.2)) * 3;
  p.ring.alpha = near ? 0.95 : 0.7;
  p.glow.alpha = near ? 0.9 : 0.55 + Math.sin(t * 3.4) * 0.2;
  p.icon.rotation = 0;
}

// ---------- 信标/交互标记 ----------
export function makeExtractSprite(): { c: Container; beam: Graphics; pad: Graphics } {
  const c = new Container();
  const pad = g().roundRect(-46, -46, 92, 92, 10).fill(0x2c3438).stroke({ width: 3, color: 0x59c46a });
  pad.roundRect(-34, -34, 68, 68, 6).fill(0x39444a).stroke({ width: 2.4, color: 0x4a8a5a });
  const beam = g().poly([0, -10, -14, -150, 14, -150]).fill({ color: 0x59c46a, alpha: 0.18 });
  const pole = g().roundRect(-4, -42, 8, 42, 3).fill(0x4a555c).stroke({ width: 2, color: OUT });
  pole.circle(0, -46, 7).fill(0x59c46a).stroke({ width: 2, color: 0x2a5a3a });
  pole.circle(0, -46, 3).fill(0xc8ffd8);
  c.addChild(pad, beam, pole);
  return { c, beam, pad };
}
export function makeDoorSprite(open: boolean, kind: string): Container {
  const c = new Container();
  const w = g();
  if (kind === 'puzzle') {
    w.roundRect(-13, -19, 26, 38, 3).fill(0x4a4238).stroke({ width: 2.4, color: OUT });
    w.circle(8, 0, 2).fill(0xd8a43c);
    w.moveTo(-8, -10).lineTo(8, 10).moveTo(8, -10).lineTo(-8, 10).stroke({ width: 1.2, color: 0x6f6250, alpha: .6 });
  } else {
    w.roundRect(-13, -17, 26, 34, 3).fill(0x5a525a).stroke({ width: 2.4, color: OUT });
    w.moveTo(0, -13).lineTo(0, 13).stroke({ width: 1.6, color: 0x3a343a });
    w.circle(8, 0, 1.8).fill(0xd8a43c);
  }
  c.addChild(w);
  c.visible = !open;
  return c;
}
