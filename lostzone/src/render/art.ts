// ============ 程序化矢量美术 v2：精细角色 / 锈犬 / 武器 / 道具 ============
import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { CharDef } from '../core/defs';
import { TAU } from '../core/util';

const OUT = 0x2b2520;
const OUT_W = 3;

function g(): Graphics { return new Graphics(); }

/** 柔和高光（叠加在主体上） */
function shine(gr: Graphics, color: string, alpha = 0.35) {
  gr.circle(-0, -30, 14).fill({ color: 0xffffff, alpha: 0 });
}

// ============================================================
//  角色（2.5 头身 · 8 向翻转向量 · 呼吸/行走/攻击/受击/死亡）
// ============================================================
export interface CharSprite {
  c: Container; char: CharDef;
  body: Graphics; head: Graphics; earL: Graphics; earR: Graphics;
  legL: Graphics; legR: Graphics; armL: Graphics; armR: Graphics;
  tail: Graphics; weapon: Container; pack: Graphics; scarf: Graphics;
  shadow: Graphics; weaponFx: Graphics;
}

export function createCharSprite(char: CharDef): CharSprite {
  const c = new Container();
  const shadow = g().ellipse(0, 22, 21, 8).fill({ color: 0x000000, alpha: 0.3 });
  shadow.zIndex = -2;

  const legL = g(), legR = g();
  drawLeg(legL, -7.5, char.body); drawLeg(legR, 7.5, char.body);

  // 尾巴（猫/浣熊）
  const tail = g();
  if (char.id === 'cat' || char.id === 'raccoon') {
    const col = char.id === 'cat' ? char.body : 0x6d5f50;
    tail.roundRect(-20, -12, 7, 18, 3.5).fill(col).stroke({ width: 2.4, color: OUT });
    tail.circle(-16.5, -13, 4).fill(0xe8e0d4).stroke({ width: 2, color: OUT });
  } else if (char.id === 'rabbit') {
    tail.circle(0, 11, 5.5).fill(0xf2f4fa).stroke({ width: 2, color: 0xc9d2e0 });
  } else {
    tail.poly([-12, 4, -24, -2, -13, -3]).fill(0x7e93ac).stroke({ width: 2, color: OUT });
  }

  // 身体（圆润 + 高光 + 肚皮）
  const body = g();
  body.roundRect(-16, -6, 32, 28, 13).fill(char.body).stroke({ width: OUT_W, color: OUT });
  body.ellipse(0, 12, 11, 8).fill(char.belly).stroke({ width: 2, color: OUT, alpha: 0.5 });
  body.ellipse(-5, -1, 6, 10).fill({ color: 0xffffff, alpha: 0.16 }); // 高光

  // 背包
  const pack = g();
  pack.roundRect(-22, -4, 10, 18, 4).fill(0x7a5c3e).stroke({ width: 2.6, color: OUT });
  pack.roundRect(-21.5, 1, 9, 6, 3).fill(0x93714f);
  pack.circle(-16.5, -6, 2).fill(0xd8a43c).stroke({ width: 1.6, color: OUT });

  // 头 + 耳朵
  let scarf: Graphics | null = null;
  const head = g(), earL = g(), earR = g();
  drawEars(earL, earR, char);
  head.circle(0, -21, 17).fill(char.body).stroke({ width: OUT_W, color: OUT });
  head.ellipse(0, -17.5, 10, 7).fill(char.belly).stroke({ width: 1.6, color: OUT, alpha: 0.45 });
  head.ellipse(-6, -27, 5, 3.4).fill({ color: 0xffffff, alpha: 0.22 }); // 头顶高光
  // 眼睛（大 + 高光）
  head.circle(-6.4, -21.5, 3.1).fill(0xffffff).stroke({ width: 1.2, color: OUT });
  head.circle(6.4, -21.5, 3.1).fill(0xffffff).stroke({ width: 1.2, color: OUT });
  head.circle(-6.2, -21.3, 2.1).fill(0x2a231d);
  head.circle(6.6, -21.3, 2.1).fill(0x2a231d);
  head.circle(-5.6, -22, 0.8).fill(0xffffff);
  head.circle(7.2, -22, 0.8).fill(0xffffff);
  // 腮红/嘴/鼻
  head.ellipse(-10, -16.5, 2.6, 1.7).fill({ color: 0xf0a3ab, alpha: 0.65 });
  head.ellipse(10, -16.5, 2.6, 1.7).fill({ color: 0xf0a3ab, alpha: 0.65 });
  head.ellipse(0, -14.5, 3.4, 2.4).fill(0xe98a76).stroke({ width: 1.2, color: 0xa04a3c, alpha: .6 });
  head.moveTo(0, -14).lineTo(0, -11.5).stroke({ width: 1.4, color: 0xa04a3c });

  // 物种特征
  if (char.id === 'cat') {
    head.moveTo(-8, -12.5).lineTo(-13, -10.5); head.moveTo(8, -12.5).lineTo(13, -10.5);
    head.stroke({ width: 1.4, color: 0xffffff, alpha: .9 });
    head.circle(0, -30, 3.2).fill(char.ear); // 额纹
    head.moveTo(-2, -33).lineTo(-4, -37).moveTo(2, -33).lineTo(4, -37).stroke({ width: 2, color: char.ear });
  } else if (char.id === 'rabbit') {
    scarf = g();
    (scarf as any).__scarf = true;
    scarf.roundRect(-12, -9, 24, 6, 3).fill(0xc23b3b).stroke({ width: 2.2, color: OUT });
    scarf.poly([9, -8, 16, -1, 11, 7, 6, 0]).fill(0xc23b3b).stroke({ width: 2.2, color: OUT });
    scarf.roundRect(9, 2, 5, 3, 1.5).fill(0xa52f2f);
    head.circle(-3, -11.5, 1).fill(0xffffff); head.circle(3, -11.5, 1).fill(0xffffff);
  } else if (char.id === 'raccoon') {
    head.ellipse(-7.5, -22, 3.8, 3).fill(0x463f36); head.ellipse(7.5, -22, 3.8, 3).fill(0x463f36);
    head.moveTo(-13.5, -27).lineTo(-17.5, -19).stroke({ width: 2.4, color: 0x463f36 });
    head.moveTo(13.5, -27).lineTo(17.5, -19).stroke({ width: 2.4, color: 0x463f36 });
    head.moveTo(-3.5, -17).lineTo(-1.5, -20).moveTo(3.5, -17).lineTo(1.5, -20).stroke({ width: 1, color: 0x2a231d });
    // 独眼罩的皮带
    head.moveTo(-17, -20).lineTo(17, -20).stroke({ width: 2, color: 0x3a3228, alpha: .9 });
  } else { // 狐鸮
    head.moveTo(-9, -32).lineTo(-14, -43).lineTo(-4, -34).stroke({ width: 2.6, color: OUT });
    head.moveTo(9, -32).lineTo(14, -43).lineTo(4, -34).stroke({ width: 2.6, color: OUT });
    head.moveTo(-14, -43).lineTo(-9, -32).fill(char.body).stroke({ width: 2.2, color: OUT });
    head.moveTo(14, -43).lineTo(9, -32).fill(char.body).stroke({ width: 2.2, color: OUT });
    head.poly([-2.6, -24, -0.8, -21.4, -4.4, -21.4]).fill(0xffb84a).stroke({ width: 1, color: 0xa06a20 });
    head.poly([2.6, -24, 0.8, -21.4, 4.4, -21.4]).fill(0xffb84a).stroke({ width: 1, color: 0xa06a20 });
  }

  // 相机（灰鸮）
  const camera = g();
  if (char.id === 'fowl') {
    camera.roundRect(-7, -10, 12, 8, 2).fill(0x4a4a52).stroke({ width: 1.8, color: OUT });
    camera.circle(-1, -6, 2.6).fill(0x9fc3d4).stroke({ width: 1.6, color: OUT });
  }

  // 手臂
  const armL = g(), armR = g();
  drawArm(armL, -14, char.body); drawArm(armR, 14, char.body);

  // 武器 + 挥砍特效挂点
  const weapon = new Container();
  const weaponFx = new Graphics();

  c.addChild(shadow, tail, legL, legR, body, pack, armL, armR, head, earL, earR, camera);
  if (scarf) c.addChild(scarf);
  c.addChild(weapon, weaponFx);
  c.sortableChildren = true;

  return { c, char, body, head, earL, earR, legL, legR, armL, armR, tail, weapon, pack,
    scarf: (c.children.find(x => (x as any).__scarf) as any) ?? undefined,
    shadow, weaponFx };
}

function drawLeg(gx: Graphics, x: number, color: string) {
  gx.roundRect(x - 4.4, 11, 8.8, 14, 4.4).fill(color).stroke({ width: 2.6, color: OUT });
  gx.roundRect(x - 5.4, 23, 10.8, 5, 2.5).fill(0x5b4632).stroke({ width: 2.2, color: OUT });
  gx.roundRect(x - 3.4, 24, 2.4, 3.4, 1).fill({ color: 0xb8a890, alpha: .8 }); // 鞋高光
}
function drawArm(gx: Graphics, x: number, color: string) {
  gx.roundRect(x - 3.8, 0, 7.6, 14, 3.8).fill(color).stroke({ width: 2.4, color: OUT });
  gx.circle(x, 15, 4).fill(color).stroke({ width: 2.2, color: OUT });
}
function drawEars(earL: Graphics, earR: Graphics, char: CharDef) {
  if (char.id === 'cat') {
    earL.poly([-17, -28, -10, -42, -3, -30]).fill(char.body).stroke({ width: 2.8, color: OUT });
    earR.poly([17, -28, 10, -42, 3, -30]).fill(char.body).stroke({ width: 2.8, color: OUT });
    earL.poly([-13.6, -29.6, -10, -37, -6.6, -30]).fill(0xf0a3ab);
    earR.poly([13.6, -29.6, 10, -37, 6.6, -30]).fill(0xf0a3ab);
  } else if (char.id === 'rabbit') {
    earL.ellipse(-10, -42, 5, 14.5).fill(char.body).stroke({ width: 2.8, color: OUT });
    earR.ellipse(10, -42, 5, 14.5).fill(char.body).stroke({ width: 2.8, color: OUT });
    earL.ellipse(-10, -42, 2.4, 10).fill(0xf0a3ab);
    earR.ellipse(10, -42, 2.4, 10).fill(0xf0a3ab);
    earL.ellipse(-12, -46, 1.6, 3).fill({ color: 0xffffff, alpha: .4 });
    earR.ellipse(12, -46, 1.6, 3).fill({ color: 0xffffff, alpha: .4 });
  } else if (char.id === 'raccoon') {
    earL.circle(-11.5, -33, 5.6).fill(char.body).stroke({ width: 2.6, color: OUT });
    earR.circle(11.5, -33, 5.6).fill(char.body).stroke({ width: 2.6, color: OUT });
    earL.circle(-11.5, -33, 2.4).fill(0x463f36);
    earR.circle(11.5, -33, 2.4).fill(0x463f36);
  } else {
    earL.ellipse(-8.5, -39, 3.8, 8.5).fill(char.body).stroke({ width: 2.6, color: OUT });
    earR.ellipse(8.5, -39, 3.8, 8.5).fill(char.body).stroke({ width: 2.6, color: OUT });
    earL.ellipse(-8.5, -39, 1.6, 5).fill(0x6b7f96);
    earR.ellipse(8.5, -39, 1.6, 5).fill(0x6b7f96);
  }
}

/** 角色姿势动画（walkT 行走相位 / aim 瞄准角 / attack 0..1 挥砍 / hitT 受击 / dead） */
export function poseChar(s: CharSprite, walkT: number, moving: boolean, aimAng: number,
  hitT: number, sprint: boolean, attackT = 0, dead = false) {
  if (dead) {
    s.c.rotation = Math.PI / 2 + 0.28;
    s.c.y = 8;
    s.c.alpha = 0.92;
    s.weapon.visible = false;
    return;
  }
  s.c.rotation = 0; s.c.alpha = 1; s.c.y = 0;
  const freq = sprint ? 15 : 10.5;
  const sw = moving ? Math.sin(walkT * freq) : 0;
  const bob = moving ? Math.abs(Math.sin(walkT * freq)) * 2.6 : Math.sin(walkT * 1.6) * 0.8;
  s.c.position.y = -bob;
  s.legL.y = sw * 4; s.legR.y = -sw * 4;
  s.legL.rotation = sw * 0.4; s.legR.rotation = -sw * 0.4;
  s.earL.rotation = sw * 0.13 - 0.06; s.earR.rotation = -sw * 0.13 + 0.06;
  // 尾巴摆动
  if (s.tail && s.char.id !== 'fowl') s.tail.rotation = Math.sin(walkT * 5) * 0.18;
  // 朝向翻转
  const flip = Math.cos(aimAng) < -0.1;
  s.c.scale.x = flip ? -1 : 1;
  const a = flip ? Math.PI - aimAng : aimAng;
  // 手臂（朝准星）
  s.armR.x = flip ? -10 : 10; s.armR.y = 2;
  s.armL.x = flip ? -14 : 14; s.armL.y = 4;
  s.armL.rotation = 0.2;
  s.armR.rotation = flip ? Math.PI - a : a;
  // 武器
  s.weapon.visible = true;
  s.weapon.position.set(flip ? -17 : 17, 5);
  s.weapon.rotation = flip ? Math.PI - a : a;
  s.weapon.scale.x = flip ? -1 : 1;
  // 挥砍动画：武器从后往前扫
  if (attackT > 0) {
    const sw2 = Math.sin(attackT * Math.PI);
    s.weapon.rotation += (flip ? -1 : 1) * (attackT * 2.4 - 1.2) * 1.5;
    s.weapon.y = -sw2 * 10;
  }
  // 受击
  const flash = hitT > 0 ? Math.min(1, hitT * 8) : 0;
  s.head.tint = flash > 0 ? 0xffc0b0 : 0xffffff;
  s.body.tint = flash > 0 ? 0xffc8b8 : 0xffffff;
}

// ============================================================
//  武器
// ============================================================
export function makeWeapon(itemId: string): Container {
  const c = new Container();
  const w = g();
  if (itemId === 'cleaver') {
    // 刀刃（带高光）+ 握柄
    w.poly([0, -3.5, 22, -2.5, 30, 0, 22, 3.5, 0, 3.5]).fill(0xd9dde2).stroke({ width: 1.8, color: OUT });
    w.poly([3, -2, 21, -1.6, 27, 0, 21, 1.8, 3, 1.8]).fill({ color: 0xffffff, alpha: .55 });
    w.roundRect(-8, -3, 9, 6, 2).fill(0x6a4a2e).stroke({ width: 1.6, color: OUT });
    w.circle(-6, 0, 1.2).fill(0xc9c9c9).stroke({ width: 1, color: OUT });
    w.circle(30, 0.4, 1).fill(0x9a3a2e);
  } else if (itemId === 'p9') {
    w.roundRect(-5, -6, 32, 9, 2.5).fill(0x3c3c46).stroke({ width: 1.8, color: OUT });
    w.roundRect(-5, -6, 32, 3.5, 1.5).fill({ color: 0x6a6a78, alpha: .7 });
    w.poly([5, 1, 12, 1, 9, 12, 3.5, 12]).fill(0x4c4c58).stroke({ width: 1.4, color: OUT });
    w.roundRect(21, -9, 7, 3.4, 1).fill(0x22242a);
    w.roundRect(26, -1, 4, 2, 1).fill(0x8a8a96);
  } else if (itemId === 'smg') {
    w.roundRect(-7, -6, 36, 9, 2.5).fill(0x39463e).stroke({ width: 1.8, color: OUT });
    w.roundRect(-7, -6, 36, 3, 1.5).fill({ color: 0x6d8a72, alpha: .6 });
    w.roundRect(4, 1, 8, 10, 1.5).fill(0x2e3a32).stroke({ width: 1.4, color: OUT });
    w.roundRect(-7, -1.5, 9, 3, 1).fill(0x22242a);
    w.roundRect(24, 2, 7, 8, 2).fill(0x2e3a32).stroke({ width: 1.4, color: OUT });
    w.roundRect(25, 9, 5, 5, 1).fill(0x8a6a34).stroke({ width: 1.2, color: OUT });
    w.circle(31, -3.5, 2.5).fill(0x39463e).stroke({ width: 1.4, color: OUT });
  }
  // 武器底部小投影
  const sh = g().ellipse(10, 12, 18, 3).fill({ color: 0x000000, alpha: 0.15 });
  c.addChild(sh, w);
  return c;
}

// ============================================================
//  锈犬（金属巡逻犬 · 精细版）
// ============================================================
export interface HoundSprite {
  c: Container; body: Graphics; head: Graphics; legs: Graphics[]; tail: Graphics;
  light: Graphics; shadow: Graphics; parts: Graphics[]; glowC: Graphics
}
export function createHoundSprite(elite: boolean): HoundSprite {
  const c = new Container();
  const steel = elite ? 0x9a322c : 0x96632c;
  const steel2 = elite ? 0x6a211e : 0x74481f;
  const steelDark = elite ? 0x4a1715 : 0x57361a;

  const shadow = g().ellipse(0, 13, 22, 7).fill({ color: 0x000000, alpha: 0.3 });
  shadow.zIndex = -2;
  const glowC = g().circle(0, -2, 26).fill({ color: 0xff4030, alpha: 0 });
  glowC.zIndex = -1;

  const body = g();
  body.ellipse(0, 0, 19, 12).fill(steel).stroke({ width: 2.8, color: OUT });
  body.ellipse(-4, 2, 11, 7).fill(steel2).stroke({ width: 1.8, color: OUT, alpha: .7 });
  body.ellipse(-7, -4, 8, 4.4).fill({ color: 0xffffff, alpha: .18 }); // 金属高光
  // 铆钉与锈斑
  for (const [rx, ry] of [[-9, -4], [-2, -7], [5, -6], [10, -2], [-13, 2], [0, 4], [8, 6]]) {
    body.circle(rx, ry, 1.4).fill(steelDark).stroke({ width: 0.8, color: OUT, alpha: .4 });
  }
  body.circle(-3, 5, 2.6).fill({ color: 0x8a5a30, alpha: .8 });
  body.circle(6, -4.5, 1.8).fill({ color: 0x8a5a30, alpha: .7 });
  body.rect(-14, -5, 4, 3).fill({ color: 0xc0c4c8, alpha: 0.4 });

  const head = g();
  head.circle(16, -4, 9).fill(steel).stroke({ width: 2.6, color: OUT });
  head.poly([21, -9, 33, -4, 21, 2]).fill(steel).stroke({ width: 2.4, color: OUT });
  head.poly([22, -7.5, 30.5, -4.2, 22, 0.4]).fill({ color: 0xffffff, alpha: .2 });
  head.circle(26, -4, 2.2).fill(0xff4a3c).stroke({ width: 1.2, color: 0x5a0000 }); // 信号眼
  head.circle(13.5, -8.5, 2.8).fill(0x2a2a2a).stroke({ width: 1, color: OUT });
  head.rect(11.5, -1.6, 10, 1.8).fill(0x2a2a2a);
  head.moveTo(9, -11).lineTo(11.5, -18).stroke({ width: 2.2, color: OUT }); // 天线杆
  head.circle(11.8, -19, 2).fill(0xffa03c).stroke({ width: 1.4, color: OUT });
  head.roundRect(-2, -11, 6, 4, 1.5).fill(0x5a5138).stroke({ width: 1.4, color: OUT }); // 面板

  const tail = g();
  tail.poly([-16, 1, -28, -9, -19, 5]).fill(steel2).stroke({ width: 2.4, color: OUT });
  tail.roundRect(-26, -10, 5, 4, 1.5).fill(0x2a2a2a);
  const light = g().circle(-27, -9.5, 3.2).fill(0xff4a3c).stroke({ width: 1.6, color: 0x5a0000 });
  light.circle(-27, -9.5, 1.2).fill(0xffe0c0);

  const legs: Graphics[] = [];
  for (const [x, sgn] of [[-10, -1], [-5, 1], [8, -1], [13, 1]] as [number, number][]) {
    const l = g().roundRect(x - 2.8, 5, 5.6, 10, 2.4).fill(steel2).stroke({ width: 1.8, color: OUT });
    l.roundRect(x - 3.2, 13.5, 6.4, 3, 1.5).fill(0x3a3a3a).stroke({ width: 1.6, color: OUT });
    (l as any).userData = sgn;
    legs.push(l);
  }

  c.addChild(shadow, glowC, body, head, tail, light, ...legs);
  c.sortableChildren = true;
  return { c, body, head, legs, tail, light, shadow, parts: [body, head, tail, light], glowC };
}

export function poseHound(s: HoundSprite, t: number, moving: boolean, alert: number, dead: boolean, attackPhase = -1) {
  if (dead) {
    s.c.rotation = Math.PI / 2 + 0.35;
    s.c.y = 6; s.c.alpha = 0.92;
    s.light.alpha = 0;
    s.glowC.alpha = 0;
    return;
  }
  s.c.rotation = 0; s.c.alpha = 1; s.c.y = 0;
  const sw = moving ? Math.sin(t * 15) : 0;
  for (let i = 0; i < s.legs.length; i++) {
    const sg = (s.legs[i] as any).userData;
    s.legs[i].y = sw * 4 * sg;
    s.legs[i].rotation = sw * 0.45 * sg;
  }
  s.head.y = Math.sin(t * 2.4) * 1.4 - 3;
  s.tail.rotation = Math.sin(t * 7) * 0.3;
  s.light.alpha = 0.75 + Math.sin(t * 9) * 0.25;
  const alertA = Math.min(1, alert);
  s.light.scale.set(1 + alertA * 0.7);
  s.light.tint = alertA > 0.4 ? 0xff2020 : 0xff4a3c;
  // 警戒光圈
  if (alertA > 0.05) {
    s.glowC.alpha = alertA * (0.18 + Math.sin(t * 10) * 0.06);
    s.glowC.scale.set(1 + alertA * 0.3);
  } else s.glowC.alpha = 0;
  // 攻击前摇：身体下沉、发光
  if (attackPhase >= 0 && attackPhase < 0.5) {
    s.body.y = Math.sin(attackPhase * Math.PI * 2) * 2.4;
    s.head.y = -4 - attackPhase * 8;
    s.glowC.alpha = 0.4;
    s.body.tint = 0xffb0a0;
  } else if (attackPhase >= 0.5 && attackPhase < 0.75) {
    s.body.tint = 0xffd8c8;
  } else {
    s.body.tint = 0xffffff;
  }
}

// ============================================================
//  道具（精细版）
// ============================================================
export function makeProp(kind: string, data?: any): Container {
  const c = new Container();
  const w = g();
  const shadow = g().ellipse(0, 11, 21, 7).fill({ color: 0x000000, alpha: 0.24 });
  shadow.zIndex = -1;
  switch (kind) {
    case 'crate': w.roundRect(-13, -13, 26, 26, 3).fill(0x9a6f42).stroke({ width: 2.6, color: OUT });
      w.moveTo(-13, 0).lineTo(13, 0).moveTo(0, -13).lineTo(0, 13).stroke({ width: 2, color: 0x6f4d2a });
      w.moveTo(-11, -11).lineTo(11, 11).stroke({ width: 1.4, color: 0x7a5a36, alpha: .7 });
      w.rect(-12, -12.5, 24, 3).fill({ color: 0xffffff, alpha: .12 }); break;
    case 'barrel': w.circle(0, 0, 11.5).fill(0x8a5030).stroke({ width: 2.6, color: OUT });
      w.circle(0, 0, 8).stroke({ width: 1.6, color: 0x623514 });
      w.circle(0, -4, 7.6).fill({ color: 0xffffff, alpha: .14 });
      w.circle(0, 0, 3).fill(0x623514);
      w.circle(-4, -4, 1.2).fill(0x5a2f18); break;
    case 'bush': w.ellipse(-6, 5, 10, 6).fill(0x4a7438).stroke({ width: 2.2, color: 0x2c4a22 });
      w.ellipse(6, 3, 11, 7).fill(0x558242).stroke({ width: 2.2, color: 0x2c4a22 });
      w.ellipse(0, -2, 12, 8).fill(0x639650).stroke({ width: 2.2, color: 0x2c4a22 });
      w.ellipse(-3, -4, 4, 2.6).fill({ color: 0x8cc46a, alpha: .8 });
      w.circle(7, -6, 2.6).fill({ color: 0xd8615a, alpha: .9 }); break;
    case 'tree': w.circle(0, 3, 17).fill(0x3f6b32).stroke({ width: 2.6, color: 0x22451c });
      w.circle(-8, -6, 11).fill(0x4f7f3c).stroke({ width: 2.4, color: 0x22451c });
      w.circle(9, -4, 11).fill(0x578a42).stroke({ width: 2.4, color: 0x22451c });
      w.circle(0, -10, 12).fill(0x63a04a).stroke({ width: 2.4, color: 0x22451c });
      w.ellipse(-4, -14, 4, 2.5).fill({ color: 0x86bc62, alpha: .8 }); break;
    case 'well': w.circle(0, 0, 13.5).fill(0x8b8b93).stroke({ width: 2.6, color: OUT });
      w.circle(0, -3, 12).fill({ color: 0xd0d0d8, alpha: .6 });
      w.circle(0, 0, 8).fill(0x1d2a3a);
      w.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -8).lineTo(0, 8).stroke({ width: 2, color: 0x5a5a62 }); break;
    case 'bench': w.roundRect(-16, -7, 32, 9, 3).fill(0x8a6a42).stroke({ width: 2.4, color: OUT });
      w.roundRect(-15, -7.5, 30, 4, 2).fill({ color: 0xb08a58, alpha: .6 });
      w.roundRect(-11, 1, 4, 6, 1.4).fill(0x5f4629); w.roundRect(7, 1, 4, 6, 1.4).fill(0x5f4629); break;
    case 'car': w.roundRect(-22, -12, 44, 24, 7).fill(0x9a6a4a).stroke({ width: 2.6, color: OUT });
      w.roundRect(-20, -9, 40, 5, 2).fill({ color: 0xffffff, alpha: .12 });
      w.roundRect(-13, -8, 26, 12, 4).fill(0x5d7a8a).stroke({ width: 1.8, color: OUT });
      w.roundRect(-11, -7, 22, 5, 2).fill({ color: 0xffffff, alpha: .18 });
      w.roundRect(-16, 10, 8, 3, 1.4).fill(0x333); w.roundRect(8, 10, 8, 3, 1.4).fill(0x333);
      w.circle(-20, -7, 2.5).fill(0xffd98a).stroke({ width: 1.2, color: 0x8a6a34 });
      w.circle(20, -7, 2.5).fill(0xffd98a).stroke({ width: 1.2, color: 0x8a6a34 });
      w.ellipse(2, -6, 8, 3).fill({ color: 0x6f4a33, alpha: .85 }); break;
    case 'truck': w.roundRect(-30, -13, 60, 26, 5).fill(0x7a5f42).stroke({ width: 2.8, color: OUT });
      w.roundRect(-28, -10, 56, 4, 2).fill({ color: 0xffffff, alpha: .12 });
      w.roundRect(-30, -9, 22, 18, 3).fill(0x93876f).stroke({ width: 2, color: OUT });
      w.roundRect(-28, -7, 18, 6, 2).fill({ color: 0xcac0aa, alpha: .5 });
      w.roundRect(6, -7, 12, 10, 3).fill(0x5d7a8a).stroke({ width: 1.8, color: OUT });
      w.roundRect(-22, 12, 10, 3, 1.4).fill(0x333); w.roundRect(8, 12, 10, 3, 1.4).fill(0x333);
      if (data) {
        const t = new Text({ text: data.plate ?? '', style: new TextStyle({ fontSize: 9, fill: '#ffe9b0', fontFamily: 'monospace', fontWeight: '700' }) });
        t.position.set(-28, -8); c.addChild(t as any);
      }
      break;
    case 'container': w.roundRect(-30, -12, 60, 24, 4).fill(0xa85838).stroke({ width: 2.8, color: OUT });
      w.roundRect(-28, -9, 56, 3.4, 1).fill({ color: 0xd87a4a, alpha: .5 });
      for (let i = -26; i < 28; i += 6) w.moveTo(i, -9).lineTo(i, 9).stroke({ width: 1.3, color: 0x7c3d26 });
      w.roundRect(-30, -6, 60, 3, 1).fill({ color: 0x6d3320, alpha: .7 });
      w.circle(-24, -6, 2.4).fill(0x6d3320).stroke({ width: 1.4, color: OUT }); break;
    case 'lamp': w.roundRect(-2.4, -14, 4.8, 21, 2).fill(0x4a4a52).stroke({ width: 1.8, color: OUT });
      w.circle(0, -17, 6.6).fill(0xffd98a).stroke({ width: 2.2, color: 0x8a6a34 });
      w.circle(0, -17, 3.4).fill(0xfff4cc);
      w.roundRect(-5, -24, 10, 2.2, 1).fill(0x4a4a52).stroke({ width: 1.4, color: OUT }); break;
    case 'bike': w.circle(-8, 2, 6).stroke({ width: 2.4, color: OUT }); w.circle(8, 2, 6).stroke({ width: 2.4, color: OUT });
      w.moveTo(-8, 2).lineTo(0, -6).lineTo(8, 2).moveTo(0, -6).lineTo(-1, 2).moveTo(0, -6).lineTo(2, 2).stroke({ width: 1.8, color: 0x8a5a30 });
      w.circle(-8, 2, 1.4).fill(0x8a5a30); w.circle(8, 2, 1.4).fill(0x8a5a30); break;
    case 'kiosk': w.roundRect(-16, -8, 32, 16, 4).fill(0x8a6a4a).stroke({ width: 2.6, color: OUT });
      w.roundRect(-14, -5, 28, 10, 3).fill({ color: 0xa88a64, alpha: .5 });
      w.roundRect(-18, -14, 36, 8, 3).fill(0xb04434).stroke({ width: 2.4, color: OUT });
      for (let i = -12; i <= 12; i += 6) w.moveTo(i, -14).lineTo(i - 3, -6).stroke({ width: 1.3, color: 0x7c2c24 }); break;
    case 'fridge': w.roundRect(-12, -14, 24, 28, 5).fill(0xbcd0d4).stroke({ width: 2.6, color: OUT });
      w.roundRect(-10, -12, 20, 8, 2).fill({ color: 0xffffff, alpha: .25 });
      w.moveTo(-12, -2).lineTo(12, -2).stroke({ width: 1.6, color: 0x8aa0a4 });
      w.roundRect(-8, -10, 5, 2, 1).fill(0x5a6a6e); break;
    case 'bed': w.roundRect(-18, -8, 36, 18, 5).fill(0xc9c2b0).stroke({ width: 2.6, color: OUT });
      w.roundRect(-16, -6, 32, 6, 3).fill({ color: 0xffffff, alpha: .2 });
      w.roundRect(10, -8, 8, 18, 3).fill(0x8a8375).stroke({ width: 2, color: OUT });
      w.roundRect(-14, -7, 22, 7, 3).fill(0x9fb8c9).stroke({ width: 1.6, color: 0x6a8296 }); break;
    case 'shelf': w.roundRect(-11, -12, 22, 24, 3).fill(0x8a6f4d).stroke({ width: 2.6, color: OUT });
      w.moveTo(-11, -4).lineTo(11, -4).moveTo(-11, 4).lineTo(11, 4).stroke({ width: 1.6, color: 0x5f4630 });
      w.circle(-5, -8, 2).fill(0x5a9a5a).stroke({ width: 1, color: OUT }); w.circle(4, 0, 2).fill(0xc9c9c9).stroke({ width: 1, color: OUT });
      w.roundRect(-3, 5.5, 3.5, 3, 0.8).fill(0xe8d8b0).stroke({ width: 1, color: 0x8a6f4d }); break;
    case 'counter': w.roundRect(-16, -8, 32, 16, 4).fill(0x96a8a8).stroke({ width: 2.6, color: OUT });
      w.roundRect(-16, -8, 32, 5, 2).fill(0xb8c8c8).stroke({ width: 1.8, color: OUT });
      w.rect(-14, -7, 6, 2.4).fill({ color: 0xffffff, alpha: .3 });
      w.circle(-9, 2.6, 1.6).fill(0x6a8a8a); w.circle(0, 3.2, 1.6).fill(0x9ab0b0); w.circle(9, 2.2, 1.6).fill(0x7a9a9a); break;
    case 'hydrant': w.circle(0, 0, 7.4).fill(0xc05a32).stroke({ width: 2.4, color: OUT });
      w.circle(-2.4, -2.4, 2.4).fill({ color: 0xffffff, alpha: .2 });
      w.roundRect(-3, -12.5, 6, 8, 2).fill(0xb04a28).stroke({ width: 2, color: OUT });
      w.circle(0, -9.5, 1.6).fill(0x8a3a20); break;
    case 'tower': {
      w.roundRect(-6, 8, 12, 10, 3).fill(0x4a3f56).stroke({ width: 2, color: OUT });
      w.moveTo(0, 8).lineTo(-22, -26).moveTo(0, 8).lineTo(22, -26).moveTo(-11, -9).lineTo(11, -9)
        .moveTo(-5, -17).lineTo(5, -17).stroke({ width: 3, color: 0x4a3f56 });
      w.circle(0, -28, 5).fill(0x6a3d72).stroke({ width: 2, color: OUT });
      w.circle(0, -30, 8).stroke({ width: 1.6, color: 0x8a5d92 });
      w.circle(0, -30, 2).fill(0xff4a3c);
      const glow = g().circle(0, -30, 11).fill({ color: 0xff4a3c, alpha: 0.22 });
      c.addChild(glow);
      break;
    }
    case 'jukebox': w.roundRect(-13, -11, 26, 26, 6).fill(0xb04434).stroke({ width: 2.8, color: OUT });
      w.roundRect(-11, -9, 22, 20, 4).fill({ color: 0xd05a44, alpha: .35 });
      w.roundRect(-13, -17, 26, 8, 4).fill(0x8a2f2a).stroke({ width: 2.2, color: OUT });
      w.circle(0, -13, 5).fill(0xf5c86a).stroke({ width: 2, color: 0x8a6a34 });
      w.circle(0, -13, 2.4).fill(0xfff2c0);
      w.moveTo(-8, 0).lineTo(8, 0).moveTo(0, -6).lineTo(0, 8).stroke({ width: 1.8, color: 0x7c2c24 }); break;
    case 'train': {
      w.roundRect(-110, -16, 220, 34, 10).fill(0x4a6a7c).stroke({ width: 3, color: OUT });
      w.roundRect(-106, -13, 212, 6, 3).fill({ color: 0x7a9aac, alpha: .5 });
      for (let i = -96; i < 104; i += 24) {
        w.roundRect(i, -8, 16, 10, 3).fill(0x9fc3d4).stroke({ width: 1.5, color: OUT });
        w.roundRect(i + 2, -6.5, 12, 3, 1.2).fill({ color: 0xffffff, alpha: .25 });
      }
      w.roundRect(-110, 10, 220, 6, 3).fill(0x2c3a44);
      for (let i = -100; i < 100; i += 24) w.roundRect(i, 6, 10, 4, 2).fill(0x222a2e);
      break;
    }
  }
  c.addChild(shadow, w);
  return c;
}

// ============================================================
//  拾取物（本体 + 发光描边徽章）
// ============================================================
export interface PickupSprite { c: Container; ring: Graphics; icon: Text; glow: Graphics }
export function makePickupSprite(name: string, icon: string, color: string): PickupSprite {
  const c = new Container();
  const glow = g().circle(0, 0, 22).fill({ color: 0xffffff, alpha: 0 }).circle(0, 0, 14).fill({ color, alpha: 0.15 });
  const ring = g().circle(0, 0, 15.5).stroke({ width: 3, color });
  const badge = g().circle(0, 0, 13.4).fill(0x141a24).stroke({ width: 2.4, color });
  const iconText = new Text({ text: icon, style: new TextStyle({ fontSize: 15, align: 'center' }) });
  iconText.anchor.set(0.5);
  const label = new Text({ text: name, style: new TextStyle({ fontSize: 10, fill: '#ffedc9', stroke: { color: '#000', width: 3 }, fontWeight: '600' }) });
  label.anchor.set(0.5, 0); label.position.set(0, 19);
  c.addChild(glow, ring, badge, iconText, label);
  return { c, ring, icon: iconText, glow };
}
export function pulsePickup(p: PickupSprite, t: number, near: boolean) {
  const s = 1 + Math.sin(t * 3.4) * 0.06;
  p.c.scale.set(s);
  p.c.y = -Math.abs(Math.sin(t * 2.2)) * 3.5;
  p.ring.alpha = near ? 1 : 0.75;
  p.glow.alpha = near ? 1 : 0.6 + Math.sin(t * 3.4) * 0.2;
}

// ============================================================
//  信标 / 门贴图
// ============================================================
export function makeExtractSprite(): { c: Container; beam: Graphics; pad: Graphics } {
  const c = new Container();
  const pad = g().roundRect(-46, -46, 92, 92, 10).fill(0x2c3438).stroke({ width: 3, color: 0x59c46a });
  pad.roundRect(-34, -34, 68, 68, 6).fill(0x39444a).stroke({ width: 2.4, color: 0x4a8a5a });
  pad.circle(0, 0, 20).stroke({ width: 2, color: 0x59c46a, alpha: .6 });
  const beam = g().poly([0, -10, -14, -150, 14, -150]).fill({ color: 0x59c46a, alpha: 0.18 });
  const pole = g().roundRect(-4, -42, 8, 42, 3).fill(0x4a555c).stroke({ width: 2, color: OUT });
  pole.circle(0, -47, 7.5).fill(0x59c46a).stroke({ width: 2, color: 0x2a5a3a });
  pole.circle(0, -47, 3.2).fill(0xc8ffd8);
  c.addChild(pad, beam, pole);
  return { c, beam, pad };
}

export function makeDoorSprite(open: boolean, kind: string): Container {
  const c = new Container();
  const w = g();
  if (kind === 'puzzle') {
    w.roundRect(-14, -20, 28, 40, 3).fill(0x4a4238).stroke({ width: 2.6, color: OUT });
    w.roundRect(-11, -17, 22, 34, 2).fill({ color: 0x5c5448, alpha: .4 });
    w.circle(9, 0, 2.2).fill(0xd8a43c).stroke({ width: 1, color: OUT });
    w.moveTo(-8, -10).lineTo(8, 10).moveTo(8, -10).lineTo(-8, 10).stroke({ width: 1.4, color: 0x6f6250, alpha: .6 });
  } else {
    w.roundRect(-14, -18, 28, 36, 3).fill(0x5a525a).stroke({ width: 2.6, color: OUT });
    w.roundRect(-11, -15, 22, 30, 2).fill({ color: 0x6a626a, alpha: .3 });
    w.moveTo(0, -14).lineTo(0, 14).stroke({ width: 1.6, color: 0x3a343a });
    w.circle(8.5, 0, 2).fill(0xd8a43c).stroke({ width: 1, color: OUT });
  }
  c.addChild(w);
  c.visible = !open;
  return c;
}
