// ============ 旧城区地图生成 v2（96x96，六区域 + 隐藏地窖，资源按建筑内分布） ============
import { Grid, gget, gset, mulberry32 } from '../core/util';

export const TILE = 32;
export const W = 96, H = 96;

export const T = {
  GRASS: 0, ROAD: 1, PLAZA: 2, TRACK: 3,
  RES_F: 10, RES_W: 11,
  HOS_F: 12, HOS_W: 13,
  WH_F: 14, WH_W: 15,
  MET_F: 16, MET_W: 17,
  RAD_F: 18, RAD_W: 19,
  CEL_F: 20, CEL_W: 21,
  YARD: 22,
} as const;

export const Z = {
  NONE: 0, RES: 1, HOS: 2, WH: 3, MET: 4, CEN: 5, RAD: 6, EXT: 7, CEL: 8,
} as const;

export interface PropDef {
  kind: 'crate' | 'barrel' | 'car' | 'truck' | 'tree' | 'bush' | 'well' | 'bench'
       | 'container' | 'lamp' | 'bike' | 'kiosk' | 'train' | 'tower' | 'jukebox' | 'fridge' | 'bed' | 'shelf' | 'counter' | 'hydrant';
  x: number; y: number; r: number; solid: boolean; zone: number; data?: any;
}
export interface PickupDef { item: string; count?: number; x: number; y: number; zone: number; locked?: boolean }
export interface EnemyDef { x: number; y: number; elite: boolean; patrol: { x: number; y: number }[]; zone: number }
export interface DoorDef { id: string; tx: number; ty: number; name: string; open: boolean;
  kind: 'key' | 'code' | 'puzzle' | 'flag'; lock?: string }
export interface InteractDef { id: string; x: number; y: number; r: number; label: string; act: string }

export interface ZoneInfo { id: number; name: string; color: number; dark: number; tint: number }
export const ZONES: Record<number, ZoneInfo> = {
  [Z.NONE]: { id: Z.NONE, name: '旧城郊野', color: 0x55703f, dark: 0, tint: 0x000000 },
  [Z.RES]:  { id: Z.RES,  name: '居民区', color: 0xe8b25a, dark: 0.02, tint: 0xffc06a },
  [Z.HOS]:  { id: Z.HOS,  name: '废弃医院', color: 0xd8e2e4, dark: 0.08, tint: 0x9fd0d8 },
  [Z.WH]:   { id: Z.WH,   name: '仓库区', color: 0xc05a32, dark: 0.02, tint: 0xffb06a },
  [Z.MET]:  { id: Z.MET,  name: '地铁站', color: 0x26505e, dark: 0.22, tint: 0x3a6c88 },
  [Z.CEN]:  { id: Z.CEN,  name: '中央街区', color: 0xc4634a, dark: 0.0, tint: 0xffb27a },
  [Z.RAD]:  { id: Z.RAD,  name: '北部广播站', color: 0x6a3d72, dark: 0.08, tint: 0xc46ad2 },
  [Z.EXT]:  { id: Z.EXT,  name: '撤离点', color: 0x59c46a, dark: 0.02, tint: 0x8affa8 },
  [Z.CEL]:  { id: Z.CEL,  name: '钟楼地窖', color: 0x9a856a, dark: 0.3, tint: 0xc9a86a },
};

export interface World {
  grid: Grid; zoneId: Uint8Array;
  props: PropDef[]; pickups: PickupDef[]; enemies: EnemyDef[];
  doors: Record<string, DoorDef>; interacts: InteractDef[];
  lamps: { x: number; y: number; r: number }[];
  clock: { x: number; y: number };
  extraction: { x: number; y: number };
  jukebox: { x: number; y: number };
  spawn: { x: number; y: number };
  exits: { north: [number, number]; south: [number, number] };
}

const SOLID_TILES: Set<number> = new Set([T.RES_W, T.HOS_W, T.WH_W, T.MET_W, T.RAD_W, T.CEL_W]);
export const isSolidTile = (t: number) => SOLID_TILES.has(t);

export function generateWorld(): World {
  const rng = mulberry32(20260901);
  const grid: Grid = { w: W, h: H, cells: new Uint8Array(W * H) };
  const zoneId = new Uint8Array(W * H);
  const props: PropDef[] = [], pickups: PickupDef[] = [], enemies: EnemyDef[] = [];
  const doors: Record<string, DoorDef> = {}, interacts: InteractDef[] = [], lamps: {x:number;y:number;r:number}[] = [];

  const zset = (x: number, y: number, z: number) => { if (x>=0&&y>=0&&x<W&&y<H) zoneId[y*W+x] = z; };
  const zget = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : zoneId[y*W+x]);

  // ---------- 基底 ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) gset(grid, x, y, T.GRASS);

  const fillRect = (x0: number, y0: number, x1: number, y1: number, t: number, z: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { gset(grid, x, y, t); zset(x, y, z); }
  };
  fillRect(4, 4, 31, 31, T.GRASS, Z.RES);
  fillRect(35, 3, 54, 23, T.GRASS, Z.HOS);
  fillRect(57, 3, 77, 17, T.GRASS, Z.RAD);
  fillRect(34, 29, 61, 53, T.PLAZA, Z.CEN);
  fillRect(63, 24, 93, 53, T.GRASS, Z.WH);
  fillRect(56, 54, 89, 87, T.GRASS, Z.MET);
  fillRect(41, 83, 55, 93, T.YARD, Z.EXT);

  // ---------- 道路 ----------
  const carveH = (y0: number, y1: number, x0: number, x1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (gget(grid, x, y) !== T.PLAZA) gset(grid, x, y, T.ROAD);
    }
  };
  carveH(40, 43, 6, 92);       // 东西主路
  carveH(32, 35, 46, 49);      // 中央→撤离 上段
  carveH(56, 59, 46, 49);      // 中央→撤离 中段
  carveH(74, 77, 46, 49);      // 中央→撤离 下段
  carveH(30, 33, 16, 19);      // 中央→居民区
  carveH(22, 25, 44, 47);      // 中央→医院
  carveH(14, 17, 52, 55); carveH(12, 15, 52, 67); // 中央→广播站
  carveH(52, 55, 56, 59);      // 中央→地铁
  // 垂直支路
  for (const [x0, x1] of [[46, 49], [16, 19], [56, 59], [44, 47]]) {
    // 已经在上面的水平矩形里做，这里补垂直连接
  }
  // 竖路（连接各水平路）
  const carveV = (x0: number, x1: number, y0: number, y1: number) => carveH(y0, y1, x0, x1);
  carveV(46, 49, 30, 88);      // 中央→撤离 全程
  carveV(16, 19, 28, 45);      // 居民区入口
  carveV(56, 59, 30, 60);      // 地铁入口 → 中央
  carveV(44, 47, 16, 26);      // 医院入口

  // ---------- 建筑工具 ----------
  const wallRect = (x0: number, y0: number, x1: number, y1: number, wt: number, ft: number) => {
    for (let x = x0; x <= x1; x++) { gset(grid, x, y0, wt); gset(grid, x, y1, wt); }
    for (let y = y0; y <= y1; y++) { gset(grid, x0, y, wt); gset(grid, x1, y, wt); }
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) gset(grid, x, y, ft);
  };
  const doorGap = (x: number, y: number, ft: number) => { gset(grid, x, y, ft); };
  /** 在墙边开 2 格宽的门（更易进入） */
  const bigDoorH = (x: number, y: number, ft: number) => { doorGap(x, y, ft); doorGap(x + 1, y, ft); };
  const bigDoorV = (x: number, y: number, ft: number) => { doorGap(x, y, ft); doorGap(x, y + 1, ft); };

  // ================= 居民区（9 座院落 = 2 座可进房 + 院落） =================
  const resHouse = (x0: number, y0: number, w: number, h: number, doorSide: 'S'|'E') => {
    wallRect(x0, y0, x0 + w, y0 + h, T.RES_W, T.RES_F);
    if (doorSide === 'S') bigDoorH(x0 + Math.floor(w / 2) - 1, y0 + h, T.RES_F);
    else bigDoorV(x0 + w, y0 + Math.floor(h / 2) - 1, T.RES_F);
  };
  // 14 号院药铺（可进）
  resHouse(10, 8, 11, 9, 'S');
  // 其余院落
  const resHouses: [number, number, number, number][] = [
    [5, 5, 7, 6], [14, 5, 7, 6], [23, 5, 7, 6],
    [5, 20, 7, 6], [23, 20, 7, 6], [26, 12, 5, 6],
    [20, 22, 7, 6], [7, 13, 5, 6],
  ];
  for (const [x, y, w, h] of resHouses) resHouse(x, y, w, h, rng() > .5 ? 'S' : 'E');
  // 花盆（月季）→ 钥匙
  gset(grid, 16, 19, T.YARD);
  props.push({ kind: 'bush', x: 16.5 * TILE, y: 19.5 * TILE, r: 10, solid: false, zone: Z.RES });
  interacts.push({ id: 'flowerpot', x: 16.5 * TILE, y: 19.5 * TILE, r: 42, label: '查看月季花盆', act: 'flowerpot' });
  pickups.push({ item: 'note1', x: 14 * TILE, y: 12 * TILE, zone: Z.RES });
  pickups.push({ item: 'p9', x: 13 * TILE + 10, y: 15 * TILE + 8, zone: Z.RES });
  // 院内杂物
  scatter(props, grid, 5, 30, 5, 30, ['crate', 'barrel', 'bike', 'well', 'bench', 'bush'], 18, rng, Z.RES);
  scatter(props, grid, 11, 20, 9, 16, ['shelf', 'crate', 'fridge', 'counter'], 6, rng, Z.RES);

  // ================= 废弃医院 =================
  wallRect(37, 5, 53, 22, T.HOS_W, T.HOS_F);
  bigDoorH(44, 22, T.HOS_F);        // 南大门（2 格）
  bigDoorV(53, 12, T.HOS_F);        // 东门
  // 内部隔断（留 2 格门洞）
  for (let x = 42; x <= 48; x++) gset(grid, x, 11, T.HOS_W);
  bigDoorH(44, 11, T.HOS_F);
  for (let y = 6; y <= 10; y++) gset(grid, 48, y, T.HOS_W);
  bigDoorV(48, 7, T.HOS_F);
  for (let y = 12; y <= 16; y++) gset(grid, 42, y, T.HOS_W);
  bigDoorV(42, 13, T.HOS_F);
  for (let y = 17; y <= 21; y++) gset(grid, 47, y, T.HOS_W);
  bigDoorV(47, 18, T.HOS_F);
  // 护士站内间（39..43, 6..10）
  wallRect(37, 5, 43, 10, T.HOS_W, T.HOS_F);
  bigDoorV(43, 8, T.HOS_F);
  props.push({ kind: 'counter', x: 40.5 * TILE, y: 7 * TILE, r: 26, solid: true, zone: Z.HOS });
  interacts.push({ id: 'drawer', x: 39.5 * TILE, y: 9.5 * TILE, r: 46, label: '翻找护士站抽屉', act: 'drawer' });
  // 接种室（49..52, 6..9）
  wallRect(49, 5, 52, 9, T.HOS_W, T.HOS_F);
  bigDoorH(49, 9, T.HOS_F);
  pickups.push({ item: 'note2', x: 50 * TILE + 10, y: 7 * TILE + 10, zone: Z.HOS });
  pickups.push({ item: 'vest', x: 50 * TILE + 24, y: 18 * TILE + 6, zone: Z.HOS });
  props.push({ kind: 'bed', x: 47 * TILE, y: 18 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'bed', x: 50 * TILE, y: 14 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'bed', x: 44 * TILE, y: 15 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'shelf', x: 39 * TILE, y: 13 * TILE, r: 14, solid: true, zone: Z.HOS });
  props.push({ kind: 'shelf', x: 51 * TILE, y: 16 * TILE, r: 14, solid: true, zone: Z.HOS });
  // 地下药房（36..41, 17..21）门在东
  wallRect(36, 17, 41, 21, T.HOS_W, T.HOS_F);
  doors.pHarma = { id: 'pHarma', tx: 41, ty: 19, name: '地下药房', open: false, kind: 'key', lock: 'pharmacykey' };
  interacts.push({ id: 'pharmaDoor', x: 42.5 * TILE, y: 19.5 * TILE, r: 44, label: '打开地下药房（需钥匙）', act: 'pharmaDoor' });
  pickups.push({ item: 'antir', count: 2, x: 38 * TILE, y: 19 * TILE, zone: Z.HOS });
  pickups.push({ item: 'ammo', count: 18, x: 39.5 * TILE, y: 20 * TILE, zone: Z.HOS });
  // 医院巡逻
  enemies.push({ x: 46 * TILE, y: 15 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 45 * TILE, y: 14 * TILE }, { x: 50 * TILE, y: 18 * TILE }, { x: 44 * TILE, y: 19 * TILE }] });
  enemies.push({ x: 44 * TILE, y: 8 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 40 * TILE, y: 8 * TILE }, { x: 51 * TILE, y: 8 * TILE }] });
  enemies.push({ x: 50 * TILE, y: 12 * TILE, elite: true, zone: Z.HOS, patrol: [{ x: 47 * TILE, y: 13 * TILE }, { x: 52 * TILE, y: 19 * TILE }] });

  // ================= 北部广播站 =================
  wallRect(58, 4, 76, 16, T.RAD_W, T.RAD_F);
  bigDoorH(66, 16, T.RAD_F);
  doors.radioBack = { id: 'radioBack', tx: 58, ty: 10, name: '广播站后门', open: false, kind: 'flag', lock: 'radioDoorOpen' };
  props.push({ kind: 'tower', x: 74.5 * TILE, y: 7.5 * TILE, r: 30, solid: true, zone: Z.RAD });
  // 控制室
  wallRect(62, 6, 72, 11, T.RAD_W, T.RAD_F);
  bigDoorH(65, 11, T.RAD_F); bigDoorH(69, 11, T.RAD_F);
  pickups.push({ item: 'note5', x: 64 * TILE + 10, y: 8 * TILE + 10, zone: Z.RAD });
  pickups.push({ item: 'tape', x: 70 * TILE + 8, y: 8.4 * TILE, zone: Z.RAD });
  props.push({ kind: 'shelf', x: 63 * TILE, y: 7.5 * TILE, r: 14, solid: true, zone: Z.RAD });
  props.push({ kind: 'shelf', x: 71 * TILE, y: 7.5 * TILE, r: 14, solid: true, zone: Z.RAD });
  // 敌群
  enemies.push({ x: 64 * TILE, y: 15 * TILE, elite: false, zone: Z.RAD, patrol: [{ x: 61 * TILE, y: 14 * TILE }, { x: 73 * TILE, y: 14 * TILE }] });
  enemies.push({ x: 66.5 * TILE, y: 13.2 * TILE, elite: true, zone: Z.RAD, patrol: [{ x: 62 * TILE, y: 13.2 * TILE }, { x: 71 * TILE, y: 13.2 * TILE }] });
  enemies.push({ x: 60 * TILE, y: 6 * TILE, elite: false, zone: Z.RAD, patrol: [{ x: 60 * TILE, y: 6 * TILE }, { x: 75 * TILE, y: 5.5 * TILE }] });
  props.push({ kind: 'barrel', x: 59.5 * TILE, y: 6 * TILE, r: 12, solid: true, zone: Z.RAD });
  props.push({ kind: 'barrel', x: 59.5 * TILE, y: 9 * TILE, r: 12, solid: true, zone: Z.RAD });
  props.push({ kind: 'crate', x: 75 * TILE, y: 12 * TILE, r: 12, solid: true, zone: Z.RAD });
  props.push({ kind: 'crate', x: 74 * TILE, y: 14 * TILE, r: 12, solid: true, zone: Z.RAD });

  // ================= 中央街区 / 钟楼（封闭塔） =================
  for (let y = 38; y <= 41; y++) for (let x = 46; x <= 49; x++) {
    const edge = y === 38 || y === 41 || x === 46 || x === 49;
    gset(grid, x, y, edge ? T.CEL_W : T.PLAZA);
    zset(x, y, Z.CEN);
  }
  interacts.push({ id: 'clock', x: 48.5 * TILE, y: 43.5 * TILE, r: 48, label: '检查钟楼控制柜', act: 'clock' });
  // 隐藏房间：钟楼地窖（52..57, 39..44）
  wallRect(52, 39, 57, 44, T.CEL_W, T.CEL_F);
  doors.cellar = { id: 'cellar', tx: 52, ty: 42, name: '钟楼地窖暗门', open: false, kind: 'puzzle', lock: 'clock' };
  doors.cellarBack = { id: 'cellarBack', tx: 54, ty: 44, name: '地窖后门', open: false, kind: 'flag', lock: 'log2' };
  gset(grid, 50, 42, T.CEL_F); gset(grid, 51, 42, T.CEL_F); // 通道
  pickups.push({ item: 'powercell', x: 53 * TILE + 14, y: 40 * TILE + 10, zone: Z.CEL });
  pickups.push({ item: 'titanium', count: 2, x: 56 * TILE + 8, y: 41 * TILE, zone: Z.CEL });
  pickups.push({ item: 'photo1', x: 53 * TILE + 8, y: 43 * TILE + 10, zone: Z.CEL });
  // 点唱机
  props.push({ kind: 'jukebox', x: 41 * TILE + 14, y: 35 * TILE + 12, r: 18, solid: true, zone: Z.CEN });
  interacts.push({ id: 'jukebox', x: 41 * TILE + 16, y: 35 * TILE + 14, r: 44, label: '使用旧点唱机', act: 'jukebox' });
  // 中央街区掩体
  for (const [k, tx, ty] of [
    ['kiosk', 37, 31], ['kiosk', 57, 31], ['kiosk', 36, 48], ['kiosk', 58, 48],
    ['bench', 40, 32], ['bench', 56, 50], ['car', 43, 47], ['car', 53, 47],
    ['bike', 38, 38], ['hydrant', 61, 31], ['well', 59, 51],
  ] as [string, number, number][]) {
    props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: k === 'car' ? 22 : 12, solid: k !== 'bench' && k !== 'well', zone: Z.CEN });
  }
  enemies.push({ x: 43 * TILE, y: 40 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 38 * TILE, y: 36 * TILE }, { x: 44 * TILE, y: 45 * TILE }] });
  enemies.push({ x: 56 * TILE, y: 44 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 52 * TILE, y: 47 * TILE }, { x: 59 * TILE, y: 40 * TILE }] });
  enemies.push({ x: 50 * TILE, y: 49 * TILE, elite: true, zone: Z.CEN, patrol: [{ x: 48 * TILE, y: 48 * TILE }, { x: 56 * TILE, y: 49 * TILE }] });
  enemies.push({ x: 48 * TILE, y: 60 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 48 * TILE, y: 56 * TILE }, { x: 48 * TILE, y: 66 * TILE }] });

  // ================= 仓库区 =================
  wallRect(66, 26, 76, 34, T.WH_W, T.WH_F);   // A 仓
  bigDoorH(70, 34, T.WH_F); bigDoorV(76, 29, T.WH_F);
  wallRect(78, 26, 88, 34, T.WH_W, T.WH_F);   // B 仓
  bigDoorH(82, 34, T.WH_F); bigDoorV(78, 29, T.WH_F);
  // B7 集装箱（B仓内）
  props.push({ kind: 'container', x: 84 * TILE + 10, y: 30 * TILE + 14, r: 20, solid: true, zone: Z.WH, data: { id: 'B7' } });
  interacts.push({ id: 'chestB7', x: 84 * TILE + 12, y: 30 * TILE + 18, r: 48, label: '撬开 B7 集装箱', act: 'chestB7' });
  pickups.push({ item: 'note3', x: 80 * TILE + 10, y: 28 * TILE + 12, zone: Z.WH });
  props.push({ kind: 'crate', x: 68 * TILE, y: 28 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 68 * TILE, y: 32 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 74 * TILE, y: 32 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 80 * TILE, y: 28 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'barrel', x: 76 * TILE, y: 26.5 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'barrel', x: 87 * TILE, y: 32 * TILE, r: 12, solid: true, zone: Z.WH });
  // 集装箱货场（南）
  for (let i = 0; i < 7; i++) {
    const x = 64 + i * 4, y = i % 2 ? 44 : 49;
    props.push({ kind: 'container', x: x * TILE + 56, y: y * TILE + 14, r: 22, solid: true, zone: Z.WH, data: { id: 'c' + i } });
  }
  props.push({ kind: 'truck', x: 78 * TILE + 16, y: 49 * TILE + 16, r: 30, solid: true, zone: Z.WH, data: { plate: '818' } });
  interacts.push({ id: 'truck818', x: 78 * TILE + 16, y: 49 * TILE + 22, r: 52, label: '搜皮卡后备箱（818）', act: 'truck818' });
  props.push({ kind: 'car', x: 91 * TILE, y: 40 * TILE, r: 22, solid: true, zone: Z.WH });
  props.push({ kind: 'bike', x: 65 * TILE, y: 27 * TILE, r: 10, solid: false, zone: Z.WH });
  enemies.push({ x: 71 * TILE, y: 30 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 68 * TILE, y: 28 * TILE }, { x: 74 * TILE, y: 32 * TILE }] });
  enemies.push({ x: 83 * TILE, y: 30 * TILE, elite: true, zone: Z.WH, patrol: [{ x: 80 * TILE, y: 28 * TILE }, { x: 86 * TILE, y: 32 * TILE }] });
  enemies.push({ x: 70 * TILE, y: 47 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 66 * TILE, y: 46 * TILE }, { x: 75 * TILE, y: 50 * TILE }] });

  // ================= 地铁站 =================
  wallRect(58, 60, 84, 76, T.MET_W, T.MET_F);
  bigDoorH(60, 60, T.MET_F); bigDoorH(70, 60, T.MET_F);
  // 售票厅（59..66, 61..64）
  for (let x = 59; x <= 66; x++) gset(grid, x, 65, T.MET_W);
  bigDoorH(61, 65, T.MET_F); bigDoorH(64, 65, T.MET_F);
  pickups.push({ item: 'note4', x: 61 * TILE + 8, y: 63 * TILE + 8, zone: Z.MET });
  props.push({ kind: 'counter', x: 63 * TILE, y: 63 * TILE, r: 18, solid: true, zone: Z.MET });
  props.push({ kind: 'bench', x: 61 * TILE + 10, y: 68 * TILE, r: 12, solid: false, zone: Z.MET });
  props.push({ kind: 'bench', x: 72 * TILE + 6, y: 70 * TILE, r: 12, solid: false, zone: Z.MET });
  // 隧道（82..86, 56..65）
  fillRect(82, 56, 86, 65, T.MET_F, Z.MET);
  doors.metroGate = { id: 'metroGate', tx: 84, ty: 56, name: '隧道北闸', open: false, kind: 'flag', lock: 'log2' };
  // 储物间（80..86, 68..73），门在西
  wallRect(80, 68, 86, 73, T.MET_W, T.MET_F);
  doors.storage = { id: 'storage', tx: 80, ty: 70, name: '隧道储物间', open: false, kind: 'code', lock: '1024' };
  interacts.push({ id: 'keypad', x: 79 * TILE, y: 70.5 * TILE, r: 44, label: '输入门禁密码', act: 'keypad' });
  pickups.push({ item: 'log2', x: 82 * TILE + 12, y: 70 * TILE + 8, zone: Z.MET });
  pickups.push({ item: 'sigcell', count: 2, x: 84 * TILE + 10, y: 71 * TILE + 6, zone: Z.MET });
  pickups.push({ item: 'cell', count: 3, x: 81.5 * TILE, y: 72 * TILE + 6, zone: Z.MET });
  props.push({ kind: 'crate', x: 85 * TILE, y: 72 * TILE, r: 12, solid: true, zone: Z.MET });
  // 站台列车
  props.push({ kind: 'train', x: 66 * TILE, y: 72 * TILE, r: 60, solid: true, zone: Z.MET });
  props.push({ kind: 'kiosk', x: 68 * TILE, y: 62 * TILE, r: 16, solid: true, zone: Z.MET });
  enemies.push({ x: 64 * TILE, y: 71 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 61 * TILE, y: 70 * TILE }, { x: 76 * TILE, y: 70 * TILE }] });
  enemies.push({ x: 78 * TILE, y: 66 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 72 * TILE, y: 64 * TILE }, { x: 79 * TILE, y: 72 * TILE }] });
  enemies.push({ x: 84 * TILE, y: 60 * TILE, elite: true, zone: Z.MET, patrol: [{ x: 84 * TILE, y: 58 * TILE }, { x: 84 * TILE, y: 64 * TILE }] });

  // ================= 撤离点 =================
  wallRect(41, 83, 55, 93, T.MET_W, T.YARD);
  bigDoorH(47, 83, T.YARD); doorGap(43, 88, T.YARD); doorGap(53, 88, T.YARD);
  props.push({ kind: 'kiosk', x: 45 * TILE, y: 90 * TILE, r: 18, solid: true, zone: Z.EXT });
  props.push({ kind: 'barrel', x: 52 * TILE, y: 86 * TILE, r: 10, solid: true, zone: Z.EXT });
  pickups.push({ item: 'cell', count: 2, x: 51 * TILE + 10, y: 86 * TILE, zone: Z.EXT });

  // ================= 资源分布（集中在建筑内部与掩体旁） =================
  const commons = ['cloth', 'bolt', 'wire', 'canfood', 'cell'];
  const rnd = (n: number) => Math.floor(rng() * n);
  const placeAt = (zone: number, x0: number, y0: number, x1: number, y1: number,
    item: string, count: number, rare = false) => {
    for (let tries = 0; tries < 20; tries++) {
      const x = x0 + rnd(x1 - x0 + 1), y = y0 + rnd(y1 - y0 + 1);
      if (isSolidTile(gget(grid, x, y))) continue;
      pickups.push({ item, count, x: x * TILE + 16, y: y * TILE + 16, zone, locked: rare });
      return;
    }
  };
  // —— 室内主要刷——居民区
  for (let i = 0; i < 6; i++) placeAt(Z.RES, 11, 9, 20, 16, commons[rnd(5)], 1 + rnd(3));
  placeAt(Z.RES, 11, 9, 20, 16, 'cell', 3);
  placeAt(Z.RES, 6, 6, 30, 29, commons[rnd(5)], 1 + rnd(2));
  // —— 医院
  for (let i = 0; i < 8; i++) placeAt(Z.HOS, 38, 6, 52, 21, commons[rnd(5)], 1 + rnd(3));
  placeAt(Z.HOS, 38, 7, 42, 9, 'can', 2);
  placeAt(Z.HOS, 44, 12, 52, 20, 'can', 2);
  // —— 仓库
  for (let i = 0; i < 8; i++) placeAt(Z.WH, 67, 27, 75, 33, commons[rnd(5)], 1 + rnd(3));
  for (let i = 0; i < 6; i++) placeAt(Z.WH, 79, 27, 87, 33, commons[rnd(5)], 1 + rnd(3));
  placeAt(Z.WH, 67, 27, 87, 33, 'ammo', 14);
  // —— 地铁
  for (let i = 0; i < 6; i++) placeAt(Z.MET, 59, 61, 66, 64, commons[rnd(5)], 1 + rnd(3));
  for (let i = 0; i < 6; i++) placeAt(Z.MET, 59, 66, 79, 75, commons[rnd(5)], 1 + rnd(3));
  for (let i = 0; i < 4; i++) placeAt(Z.MET, 82, 56, 86, 65, commons[rnd(5)], 1 + rnd(2));
  // —— 广播站
  for (let i = 0; i < 5; i++) placeAt(Z.RAD, 63, 7, 71, 10, commons[rnd(5)], 1 + rnd(3));
  for (let i = 0; i < 4; i++) placeAt(Z.RAD, 59, 5, 75, 15, commons[rnd(5)], 1 + rnd(2));
  // —— 中央街区（掩体旁）
  for (let i = 0; i < 6; i++) placeAt(Z.CEN, 35, 30, 60, 52, commons[rnd(5)], 1 + rnd(2));
  // —— 高级资源（固定室内点）
  placeAt(Z.HOS, 38, 19, 40, 20, 'antir', 1, true);       // 药房
  placeAt(Z.WH, 84, 29, 86, 32, 'titanium', 1, true);     // B7
  placeAt(Z.MET, 82, 70, 85, 72, 'sigcell', 1, true);     // 储物间
  placeAt(Z.RAD, 63, 7, 71, 10, 'antir', 1, true);        // 控制室
  placeAt(Z.CEN, 42, 34, 45, 50, 'titanium', 1, true);    // 钟楼旁掩体（概率）
  placeAt(Z.CEN, 52, 43, 60, 50, 'titanium', 1, true);    // 钟楼东侧（概率）
  // 罐头散布（安全）
  placeAt(Z.RES, 6, 6, 30, 29, 'can', 1);
  placeAt(Z.CEN, 35, 30, 60, 52, 'can', 1);

  // ---------- 街灯 ----------
  const lampAt = (x: number, y: number, r = 130) => {
    props.push({ kind: 'lamp', x: x * TILE, y: y * TILE, r: 6, solid: true, zone: zget(x, y) });
    lamps.push({ x: x * TILE, y: y * TILE - 8, r });
  };
  for (const [x, y, r] of [[48, 56, 170], [65, 42, 150], [17, 42, 150], [34, 41, 150],
    [48, 70, 170], [48, 84, 170], [45, 30, 150], [53, 15, 150], [46, 8, 140],
    [63, 68, 130], [80, 74, 120], [70, 10, 140], [44, 48, 140], [55, 34, 140]]) {
    lampAt(x, y, r);
  }

  // ---------- 周边树 ----------
  for (let i = 0; i < 80; i++) {
    const x = rnd(W), y = rnd(H);
    if (zget(x, y) !== Z.NONE) continue;
    props.push({ kind: 'tree', x: x * TILE + 16, y: y * TILE + 16, r: 14, solid: true, zone: Z.NONE });
  }

  // ---------- 关键坐标 ----------
  const clock = { x: 48.5 * TILE, y: 40 * TILE };
  const extraction = { x: 48 * TILE + 16, y: 88.5 * TILE };
  const jukebox = { x: 41 * TILE + 16, y: 35 * TILE + 14 };
  const spawn = { x: 48 * TILE + 16, y: 54 * TILE };
  interacts.push({ id: 'extract', x: extraction.x, y: extraction.y, r: 60, label: '启动撤离信标', act: 'extract' });

  return {
    grid, zoneId, props, pickups, enemies, doors, interacts, lamps,
    clock, extraction, jukebox, spawn,
    exits: { north: [48, 30], south: [48, 88] },
  };
}

function scatter(props: PropDef[], grid: Grid, x0: number, x1: number, y0: number, y1: number,
  kinds: string[], n: number, rng: () => number, zone: number) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
    if (isSolidTile(gget(grid, x, y))) continue;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const solid = !['bush', 'bench', 'well'].includes(kind);
    props.push({ kind: kind as any, x: x * TILE + 16, y: y * TILE + 16, r: kind === 'tree' ? 14 : kind === 'counter' ? 14 : 11, solid, zone });
  }
}
