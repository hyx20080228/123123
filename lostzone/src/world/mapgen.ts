// ============ 旧城区地图生成 v2（96x96，六区域 + 隐藏地窖，资源按建筑内分布） ============
import { Grid, gget, gset } from '../core/util';

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
  YARD: 22, HEDGE: 23,
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
  [Z.RAD]:  { id: Z.RAD,  name: '北部广播站', color: 0x6a6d78, dark: 0.08, tint: 0x8a95b8 },
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

const SOLID_TILES: Set<number> = new Set([T.RES_W, T.HOS_W, T.WH_W, T.MET_W, T.RAD_W, T.CEL_W, T.HEDGE]);
export const isSolidTile = (t: number) => SOLID_TILES.has(t) || t === 255; // 255=越界，一律视为墙

export function generateWorld(): World {
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
  resHouse(11, 8, 11, 9, 'S');
  // 其余院落
  const resHouses: [number, number, number, number][] = [
    [4, 4, 6, 6], [24, 4, 6, 6], [4, 12, 6, 5], [24, 12, 6, 5],
    [4, 19, 6, 5], [24, 19, 6, 5], [12, 19, 5, 5], [18, 19, 5, 5],
  ];
  for (const [x, y, w, h] of resHouses) resHouse(x, y, w, h, (x + y) % 2 ? 'S' : 'E');
  // 花盆（月季）→ 钥匙
  gset(grid, 15, 18, T.YARD);
  props.push({ kind: 'bush', x: 15.5 * TILE, y: 18.5 * TILE, r: 10, solid: false, zone: Z.RES });
  interacts.push({ id: 'flowerpot', x: 15.5 * TILE, y: 18.5 * TILE, r: 42, label: '查看月季花盆', act: 'flowerpot' });
  pickups.push({ item: 'note1', x: 14 * TILE, y: 12 * TILE, zone: Z.RES });
  pickups.push({ item: 'p9', x: 13 * TILE + 10, y: 15 * TILE + 8, zone: Z.RES });
  // 院内杂物（固定摆放，绝不堵门/上路）
  const yardProps: [string, number, number, boolean][] = [
    ['bush', 7, 11, false], ['bench', 23, 9, false], ['well', 26, 18, false], ['crate', 5, 25, true],
    ['barrel', 27, 25, true], ['bike', 8, 27, false], ['bush', 23, 18, false], ['bench', 6, 26, false],
    ['crate', 17, 26, true], ['bush', 25, 11, false], ['barrel', 7, 18, true], ['well', 25, 18, false],
    ['bush', 29, 11, false], ['shelf', 9, 11, true], ['crate', 19, 18, true], ['fridge', 10, 18, true],
    ['bush', 11, 26, false], ['bench', 15, 25, false],
  ];

  for (const [kind, tx, ty, solid] of yardProps)
    props.push({ kind: kind as any, x: tx * TILE + 16, y: ty * TILE + 16, r: kind === 'well' ? 13 : kind === 'bench' ? 12 : kind === 'bush' ? 10 : 11, solid, zone: Z.RES });

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
  pickups.push({ item: 'note2', x: 50 * TILE + 10, y: 8 * TILE + 8, zone: Z.HOS });
  pickups.push({ item: 'vest', x: 50 * TILE + 24, y: 18 * TILE + 6, zone: Z.HOS });
  pickups.push({ item: 'cloth', count: 2, x: 40 * TILE + 8, y: 12 * TILE + 8, zone: Z.HOS });
  pickups.push({ item: 'canfood', count: 2, x: 44 * TILE + 4, y: 10 * TILE + 8, zone: Z.HOS });
  props.push({ kind: 'bed', x: 47 * TILE, y: 18 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'bed', x: 50 * TILE, y: 14 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'bed', x: 44 * TILE, y: 15 * TILE, r: 20, solid: true, zone: Z.HOS });
  props.push({ kind: 'shelf', x: 39 * TILE, y: 13 * TILE, r: 14, solid: true, zone: Z.HOS });
  props.push({ kind: 'shelf', x: 51 * TILE, y: 16 * TILE, r: 14, solid: true, zone: Z.HOS });
  // 地下药房（36..41, 17..21）门在东
  wallRect(36, 17, 41, 21, T.HOS_W, T.HOS_F);
  doors.pHarma = { id: 'pHarma', tx: 41, ty: 19, name: '地下药房', open: false, kind: 'key', lock: 'pharmacykey' };
  interacts.push({ id: 'pharmaDoor', x: 42.5 * TILE, y: 19.5 * TILE, r: 44, label: '打开地下药房（需钥匙）', act: 'pharmaDoor' });
  pickups.push({ item: 'antir', count: 2, x: 38 * TILE + 6, y: 19 * TILE + 4, zone: Z.HOS });
  pickups.push({ item: 'ammo', count: 18, x: 39.5 * TILE, y: 20 * TILE + 4, zone: Z.HOS });
  pickups.push({ item: 'bolt', count: 2, x: 37 * TILE + 12, y: 18 * TILE + 6, zone: Z.HOS });
  pickups.push({ item: 'wire', count: 2, x: 49 * TILE + 6, y: 20 * TILE + 6, zone: Z.HOS });
  pickups.push({ item: 'cell', count: 2, x: 44 * TILE + 4, y: 19 * TILE + 4, zone: Z.HOS });
  pickups.push({ item: 'canfood', count: 2, x: 46 * TILE + 4, y: 16 * TILE + 4, zone: Z.HOS });
  pickups.push({ item: 'cloth', count: 2, x: 44 * TILE + 6, y: 13 * TILE + 6, zone: Z.HOS });
  // 医院巡逻
  enemies.push({ x: 46 * TILE, y: 15 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 45 * TILE, y: 14 * TILE }, { x: 50 * TILE, y: 18 * TILE }, { x: 44 * TILE, y: 19 * TILE }] });
  enemies.push({ x: 44 * TILE, y: 12 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 42 * TILE, y: 13 * TILE }, { x: 45 * TILE, y: 13 * TILE }] });
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
  pickups.push({ item: 'antir', count: 1, x: 66 * TILE + 6, y: 9 * TILE + 6, zone: Z.RAD });
  pickups.push({ item: 'wire', count: 2, x: 63 * TILE + 8, y: 9 * TILE + 6, zone: Z.RAD });
  pickups.push({ item: 'cell', count: 2, x: 68 * TILE + 6, y: 13 * TILE + 4, zone: Z.RAD });
  pickups.push({ item: 'cloth', count: 2, x: 65 * TILE + 4, y: 12 * TILE + 6, zone: Z.RAD });
  pickups.push({ item: 'bolt', count: 2, x: 62 * TILE + 6, y: 14 * TILE + 6, zone: Z.RAD });
  props.push({ kind: 'shelf', x: 63 * TILE, y: 7.5 * TILE, r: 14, solid: true, zone: Z.RAD });
  props.push({ kind: 'shelf', x: 71 * TILE, y: 7.5 * TILE, r: 14, solid: true, zone: Z.RAD });
  // 敌群
  enemies.push({ x: 64 * TILE, y: 15 * TILE, elite: false, zone: Z.RAD, patrol: [{ x: 61 * TILE, y: 14 * TILE }, { x: 73 * TILE, y: 14 * TILE }] });
  enemies.push({ x: 66.5 * TILE, y: 13.2 * TILE, elite: true, zone: Z.RAD, patrol: [{ x: 62 * TILE, y: 13.2 * TILE }, { x: 71 * TILE, y: 13.2 * TILE }] });
  enemies.push({ x: 65 * TILE + 8, y: 9 * TILE + 4, elite: false, zone: Z.RAD, patrol: [{ x: 64 * TILE + 8, y: 9 * TILE + 4 }, { x: 71 * TILE, y: 9 * TILE + 4 }] });
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
  pickups.push({ item: 'canfood', count: 2, x: 44 * TILE + 4, y: 33 * TILE + 6, zone: Z.CEN });
  pickups.push({ item: 'cell', count: 2, x: 37 * TILE + 6, y: 36 * TILE + 6, zone: Z.CEN });
  pickups.push({ item: 'titanium', count: 1, x: 52 * TILE + 8, y: 46 * TILE + 4, zone: Z.CEN, locked: true });
  pickups.push({ item: 'canfood', count: 2, x: 57 * TILE + 4, y: 50 * TILE + 6, zone: Z.CEN });
  for (const [k, tx, ty] of [
    ['kiosk', 37, 31], ['kiosk', 57, 31], ['kiosk', 36, 48], ['kiosk', 58, 48],
    ['bench', 40, 32], ['bench', 56, 50], ['car', 43, 47], ['car', 53, 47],
    ['bike', 38, 38], ['hydrant', 61, 31], ['well', 59, 51],
  ] as [string, number, number][]) {
    props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: k === 'car' ? 22 : 12, solid: k !== 'bench' && k !== 'well', zone: Z.CEN });
  }
  enemies.push({ x: 43 * TILE, y: 40 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 38 * TILE, y: 36 * TILE }, { x: 44 * TILE, y: 45 * TILE }] });
  enemies.push({ x: 58 * TILE + 16, y: 46 * TILE + 16, elite: false, zone: Z.CEN, patrol: [{ x: 50 * TILE + 8, y: 47 * TILE + 8 }, { x: 59 * TILE, y: 40 * TILE }] });
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
  pickups.push({ item: 'note3', x: 81 * TILE + 2, y: 30 * TILE + 10, zone: Z.WH });
  pickups.push({ item: 'ammo', count: 14, x: 83 * TILE + 4, y: 27 * TILE + 8, zone: Z.WH });
  pickups.push({ item: 'titanium', count: 1, x: 85 * TILE + 6, y: 31 * TILE + 8, zone: Z.WH, locked: true });
  pickups.push({ item: 'canfood', count: 2, x: 86 * TILE + 4, y: 32 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'cloth', count: 2, x: 80 * TILE + 6, y: 32 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'bolt', count: 2, x: 69 * TILE + 12, y: 29 * TILE + 12, zone: Z.WH });
  pickups.push({ item: 'cloth', count: 2, x: 70 * TILE + 6, y: 32 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'cell', count: 2, x: 73 * TILE + 6, y: 28 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'wire', count: 2, x: 72 * TILE + 6, y: 30 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'canfood', count: 2, x: 69 * TILE + 6, y: 30 * TILE + 6, zone: Z.WH });
  props.push({ kind: 'crate', x: 68 * TILE, y: 28 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 68 * TILE, y: 32 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 74 * TILE, y: 32 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'crate', x: 80 * TILE, y: 28 * TILE, r: 12, solid: true, zone: Z.WH });
  props.push({ kind: 'barrel', x: 74 * TILE, y: 28 * TILE, r: 12, solid: true, zone: Z.WH });
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
  pickups.push({ item: 'wire', count: 2, x: 66 * TILE + 6, y: 44 * TILE + 6, zone: Z.WH });
  pickups.push({ item: 'cell', count: 2, x: 70 * TILE + 6, y: 49 * TILE + 6, zone: Z.WH });
  enemies.push({ x: 71 * TILE, y: 30 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 69 * TILE + 8, y: 27 * TILE + 4 }, { x: 75 * TILE, y: 31 * TILE + 4 }] });
  enemies.push({ x: 83 * TILE, y: 30 * TILE, elite: true, zone: Z.WH, patrol: [{ x: 79 * TILE, y: 31 * TILE }, { x: 85 * TILE, y: 28 * TILE + 4 }] });
  enemies.push({ x: 70 * TILE, y: 47 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 66 * TILE, y: 46 * TILE }, { x: 75 * TILE, y: 51 * TILE }] });

  // ================= 地铁站 =================
  wallRect(58, 60, 84, 76, T.MET_W, T.MET_F);
  bigDoorH(60, 60, T.MET_F); bigDoorH(70, 60, T.MET_F);
  // 售票厅（59..66, 61..64）
  for (let x = 59; x <= 66; x++) gset(grid, x, 65, T.MET_W);
  bigDoorH(61, 65, T.MET_F); bigDoorH(64, 65, T.MET_F);
  pickups.push({ item: 'note4', x: 61 * TILE + 8, y: 63 * TILE + 8, zone: Z.MET });
  pickups.push({ item: 'cell', count: 2, x: 63 * TILE + 4, y: 68 * TILE + 6, zone: Z.MET });
  pickups.push({ item: 'bolt', count: 2, x: 60 * TILE + 6, y: 70 * TILE + 6, zone: Z.MET });
  pickups.push({ item: 'wire', count: 2, x: 76 * TILE + 4, y: 64 * TILE + 6, zone: Z.MET });
  pickups.push({ item: 'canfood', count: 2, x: 66 * TILE + 4, y: 66 * TILE + 6, zone: Z.MET });
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
  pickups.push({ item: 'cell', count: 3, x: 81 * TILE + 12, y: 72 * TILE + 6, zone: Z.MET });
  pickups.push({ item: 'titanium', count: 1, x: 85 * TILE + 6, y: 69 * TILE + 6, zone: Z.MET, locked: true });
  props.push({ kind: 'crate', x: 85 * TILE, y: 72 * TILE, r: 12, solid: true, zone: Z.MET });
  // 站台列车
  props.push({ kind: 'train', x: 66 * TILE, y: 72 * TILE, r: 60, solid: true, zone: Z.MET });
  props.push({ kind: 'kiosk', x: 68 * TILE, y: 62 * TILE, r: 16, solid: true, zone: Z.MET });
  enemies.push({ x: 62 * TILE, y: 71 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 61 * TILE, y: 70 * TILE }, { x: 76 * TILE, y: 70 * TILE }] });
  enemies.push({ x: 78 * TILE, y: 66 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 72 * TILE, y: 64 * TILE }, { x: 79 * TILE, y: 72 * TILE }] });
  enemies.push({ x: 84 * TILE, y: 60 * TILE, elite: true, zone: Z.MET, patrol: [{ x: 84 * TILE, y: 58 * TILE }, { x: 84 * TILE, y: 64 * TILE }] });

  // ================= 撤离点 =================
  wallRect(41, 83, 55, 93, T.MET_W, T.YARD);
  bigDoorH(47, 83, T.YARD); doorGap(43, 88, T.YARD); doorGap(53, 88, T.YARD);
  props.push({ kind: 'kiosk', x: 45 * TILE, y: 90 * TILE, r: 18, solid: true, zone: Z.EXT });
  props.push({ kind: 'barrel', x: 52 * TILE, y: 86 * TILE, r: 10, solid: true, zone: Z.EXT });
  pickups.push({ item: 'cell', count: 2, x: 51 * TILE + 10, y: 86 * TILE, zone: Z.EXT });

  // ================= 居民区室内固定补给 =================
  pickups.push({ item: 'canfood', count: 2, x: 18 * TILE + 4, y: 10 * TILE + 6, zone: Z.RES });
  pickups.push({ item: 'cloth', count: 2, x: 16 * TILE + 6, y: 14 * TILE + 4, zone: Z.RES });
  pickups.push({ item: 'bolt', count: 2, x: 19 * TILE + 6, y: 15 * TILE + 4, zone: Z.RES });
  pickups.push({ item: 'cell', count: 3, x: 12 * TILE + 8, y: 15 * TILE + 4, zone: Z.RES });

  // ---------- 街灯 ----------
  const lampAt = (x: number, y: number, r = 130) => {
    props.push({ kind: 'lamp', x: x * TILE, y: y * TILE, r: 6, solid: true, zone: zget(x, y) });
    lamps.push({ x: x * TILE, y: y * TILE - 8, r });
  };
  for (const [x, y, r] of [
    // 东西主路沿线（每隔约 14 格一盏）
    [8, 41, 150], [24, 41, 150], [38, 41, 150], [54, 41, 160], [68, 41, 150], [82, 41, 150], [90, 41, 140],
    // 中央→撤离纵路
    [47, 34, 150], [47, 48, 160], [47, 62, 170], [47, 76, 170], [47, 87, 170],
    // 居民区/医院/广播站/地铁支路
    [17, 31, 150], [17, 38, 150], [45, 21, 150], [52, 15, 150], [46, 8, 140], [57, 13, 140],
    [57, 54, 140], [68, 58, 130], [68, 58, 130], [80, 58, 130],
    // 建筑周边照明
    [65, 30, 140], [72, 36, 140], [86, 36, 140], [44, 48, 140], [55, 34, 140], [34, 46, 140],
  ]) {
    lampAt(x, y, r);
  }

  // ---------- 边界封闭：2 圈灌木林地（绝不可走出去 / 无空气墙） ----------
  const hedgeRing = () => {
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) {
      const edge = x < 2 || x >= W - 2 || y < 2 || y >= H - 2;
      if (edge && zoneId[y * W + x] === Z.NONE) gset(grid, x, y, T.HEDGE);
    }
  };
  hedgeRing();
  // 周界树带（视觉提示 + 自然封边）
  const belt: [number, number][] = [];
  for (let x = 2; x < W - 2; x += 3) belt.push([x, 2], [x, H - 3]);
  for (let y = 2; y < H - 2; y += 3) belt.push([2, y], [W - 3, y]);
  for (const [x, y] of belt) {
    const jx = x + ((x * 7 + y * 13) % 3 === 0 ? 1 : 0), jy = y + ((x * 3 + y * 17) % 3 === 0 ? 1 : 0);
    if (jx <= 2 || jy <= 2 || jx >= W - 3 || jy >= H - 3) continue;
    if (isSolidTile(gget(grid, jx, jy))) continue;
    props.push({ kind: 'tree', x: jx * TILE + 16, y: jy * TILE + 16, r: 14, solid: true, zone: Z.NONE });
  }
  // 各区间荒野点缀（固定坐标表，每次进入完全一致）
  const wilds: [number, number][] = [
    [4, 34], [8, 37], [12, 35], [6, 46], [11, 49], [15, 44], [21, 36], [25, 46], [30, 49],
    [33, 36], [37, 54], [41, 50], [52, 52], [62, 50], [61, 56], [33, 22], [36, 25], [39, 21],
    [55, 27], [61, 22], [65, 21], [70, 19], [76, 21], [82, 20], [87, 22], [91, 26],
    [56, 79], [52, 81], [60, 82], [64, 79], [70, 81], [75, 84], [80, 80], [86, 78],
    [35, 56], [39, 58], [43, 62], [33, 62], [55, 58], [57, 64], [90, 46], [92, 52], [93, 60], [91, 70], [92, 80],
  ];
  for (let i = 0; i < wilds.length; i++) {
    const [x, y] = wilds[i];
    if (zoneId[y * W + x] !== Z.NONE) continue;
    if (isSolidTile(gget(grid, x, y))) continue;
    const tree = i % 7 === 0;
    props.push({ kind: tree ? 'tree' : 'bush', x: x * TILE + 16, y: y * TILE + 16,
      r: tree ? 14 : 9, solid: tree, zone: Z.NONE });
  }

  // ================= 刷新机制 v4：区域席位散布（真正打散，不贴边不成排） =================
  // 每个区域的资源物品席位按区域大小均匀铺开（确定性哈希洗牌+等距抽样，可复现）。
  // 落点满足：非墙 / 非荒野 / 不在门上 / 不压道具 / 距地图边>=8格 / 距区域边>=3格 / 距地图顶带>=12格。
  // 关键剧情物品也参与席位散布（避免固定坐标造成"贴北墙一排"观感）
  // 仅豁免被机关/撤离逻辑硬绑定的：powercell（撤离信标钥匙）、log2（地铁门密码）
  const KEY_ITEMS = new Set(['powercell','log2']);
  const doorCells = new Set(Object.values(doors).map(d => d.ty * W + d.tx));
  const h32 = (x: number, y: number, z: number) => {
    let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z + 7, 2246822519);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  };
  const seatOK = (x: number, y: number, z: number) => {
    if (x < 8 || y < 12 || x >= W - 8 || y >= H - 8) return false;   // 全局留边 + 顶部留带
    if (zoneId[y * W + x] !== z || doorCells.has(y * W + x)) return false;
    if (isSolidTile(gget(grid, x, y))) return false;
    // 至少一侧可通行，不落死角
    const open = !isSolidTile(gget(grid, x + 1, y)) || !isSolidTile(gget(grid, x - 1, y)) ||
      !isSolidTile(gget(grid, x, y + 1)) || !isSolidTile(gget(grid, x, y - 1));
    if (!open) return false;
    for (const pr of props) {
      if (!pr.solid) continue;
      const d = Math.hypot(x * TILE + 16 - pr.x, y * TILE + 16 - pr.y);
      if (d < pr.r + 10) return false;
    }
    return true;
  };
  const seats = new Map<number, [number, number][]>();
  const seatOf = (z: number) => {
    let arr = seats.get(z);
    if (!arr) {
      arr = [];
      for (let y = 2; y < H - 2; y++) for (let x = 2; x < W - 2; x++)
        if (seatOK(x, y, z)) arr.push([x, y]);
      arr.sort((a, b) => h32(a[0], a[1], z) - h32(b[0], b[1], z));  // 确定性洗牌
      seats.set(z, arr);
    }
    return arr;
  };
  const nonKeyCount = new Map<number, number>();
  for (const p of pickups) if (!KEY_ITEMS.has(p.item))
    nonKeyCount.set(p.zone, (nonKeyCount.get(p.zone) ?? 0) + 1);
  const usedSeat = new Map<number, number>();
  for (const p of pickups) {
    if (KEY_ITEMS.has(p.item)) continue;                 // 剧情物品固定
    const arr = seatOf(p.zone), n = arr.length, k = nonKeyCount.get(p.zone) ?? 1;
    if (!n) continue;
    const stride = Math.max(1, Math.floor(n / k));
    const idx = ((usedSeat.get(p.zone) ?? 0) * stride + Math.floor(stride / 2)) % n;
    usedSeat.set(p.zone, (usedSeat.get(p.zone) ?? 0) + 1);
    p.x = arr[idx][0] * TILE + 16; p.y = arr[idx][1] * TILE + 16;
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
