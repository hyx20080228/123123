// ============ 旧城区地图生成（96x96 瓦片，程序化布局，定稿坐标） ============
// 区域：居民区 / 废弃医院 / 仓库区 / 地铁站 / 中央街区 / 北部广播站 / 南部撤离点 / 钟楼地窖(隐藏)

import { Grid, gget, gset, mulberry32, clamp } from '../core/util';

export const TILE = 32;
export const W = 96, H = 96;

// 瓦片 id
export const T = {
  GRASS: 0, ROAD: 1, PLAZA: 2, TRACK: 3,
  RES_F: 10, RES_W: 11,
  HOS_F: 12, HOS_W: 13,
  WH_F: 14, WH_W: 15,
  MET_F: 16, MET_W: 17,
  RAD_F: 18, RAD_W: 19,
  CEL_F: 20, CEL_W: 21,
  YARD: 22,       // 庭院土径
} as const;

// 区域 id（氛围/小地图）
export const Z = {
  NONE: 0, RES: 1, HOS: 2, WH: 3, MET: 4, CEN: 5, RAD: 6, EXT: 7, CEL: 8,
} as const;

export interface PropDef {
  kind: 'crate' | 'barrel' | 'car' | 'truck' | 'tree' | 'bush' | 'well' | 'bench'
       | 'container' | 'lamp' | 'bike' | 'kiosk' | 'train' | 'tower' | 'jukebox' | 'fridge' | 'bed' | 'shelf' | 'counter' | 'hydrant';
  x: number; y: number; // px 中心
  r: number;            // 碰撞半径
  solid: boolean;
  zone: number;
  data?: any;
}
export interface PickupDef { item: string; count?: number; x: number; y: number; zone: number; locked?: boolean }
export interface EnemyDef { x: number; y: number; elite: boolean; patrol: { x: number; y: number }[]; zone: number }
export interface DoorDef { id: string; tx: number; ty: number; name: string; open: boolean;
  kind: 'key' | 'code' | 'puzzle' | 'flag' | 'quest'; lock?: string }
export interface InteractDef { id: string; x: number; y: number; r: number; label: string; act: string }

export interface ZoneInfo { id: number; name: string; color: number; dark: number; tint: number }
export const ZONES: Record<number, ZoneInfo> = {
  [Z.NONE]: { id: Z.NONE, name: '旧城郊野', color: 0x55703f, dark: 0, tint: 0x000000 },
  [Z.RES]:  { id: Z.RES,  name: '居民区', color: 0xe8b25a, dark: 0.06, tint: 0xffc06a },
  [Z.HOS]:  { id: Z.HOS,  name: '废弃医院', color: 0xd8e2e4, dark: 0.16, tint: 0x9fd0d8 },
  [Z.WH]:   { id: Z.WH,   name: '仓库区', color: 0xc05a32, dark: 0.06, tint: 0xffb06a },
  [Z.MET]:  { id: Z.MET,  name: '地铁站', color: 0x26505e, dark: 0.34, tint: 0x3a6c88 },
  [Z.CEN]:  { id: Z.CEN,  name: '中央街区', color: 0xc4634a, dark: 0.0, tint: 0xffb27a },
  [Z.RAD]:  { id: Z.RAD,  name: '北部广播站', color: 0x6a3d72, dark: 0.18, tint: 0xc46ad2 },
  [Z.EXT]:  { id: Z.EXT,  name: '撤离点', color: 0x59c46a, dark: 0.04, tint: 0x8affa8 },
  [Z.CEL]:  { id: Z.CEL,  name: '钟楼地窖', color: 0x9a856a, dark: 0.42, tint: 0xc9a86a },
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

  const zget = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : zoneId[y * W + x]);
  const zset = (x: number, y: number, z: number) => { if (x>=0&&y>=0&&x<W&&y<H) zoneId[y*W+x] = z; };

  // ---------- 基础地面 ----------
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    gset(grid, x, y, T.GRASS);
  }

  // ---------- 区域地面 ----------
  const fillRect = (x0: number, y0: number, x1: number, y1: number, t: number, z: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      gset(grid, x, y, t); zset(x, y, z);
    }
  };
  // 居民区（土院子基底）
  fillRect(4, 4, 31, 31, T.GRASS, Z.RES);
  // 医院地块（草地+楼）
  fillRect(35, 3, 54, 23, T.GRASS, Z.HOS);
  // 广播站
  fillRect(57, 3, 77, 17, T.GRASS, Z.RAD);
  // 中央街区广场
  fillRect(34, 29, 61, 53, T.PLAZA, Z.CEN);
  // 仓库区
  fillRect(63, 24, 93, 53, T.GRASS, Z.WH);
  // 地铁站
  fillRect(56, 54, 89, 87, T.GRASS, Z.MET);
  // 撤离点
  fillRect(41, 83, 55, 93, T.YARD, Z.EXT);

  // ---------- 道路（先铺，建筑避让） ----------
  const carveRoadH = (y0: number, y1: number, x0: number, x1: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (gget(grid, x, y) !== T.PLAZA) gset(grid, x, y, T.ROAD);
      zset(x, y, zget(x, y) || Z.NONE);
    }
  };
  const carveRoadV = (x0: number, x1: number, y0: number, y1: number) =>
    carveRoadH(y0, y1, x0, x1);
  // 中央→撤离
  carveRoadV(46, 49, 32, 88);
  // 东西主路（居民区/中央/仓库）
  carveRoadH(40, 43, 6, 92);
  // 中央→居民区
  carveRoadV(16, 19, 28, 43);
  // 中央→医院
  carveRoadV(44, 47, 20, 31);
  // 中央→广播站
  carveRoadV(52, 55, 12, 31); carveRoadH(12, 15, 52, 67);
  // 中央→地铁
  carveRoadV(56, 59, 52, 60);

  // ---------- 建筑工具 ----------
  const wallRect = (x0: number, y0: number, x1: number, y1: number, wt: number, ft: number) => {
    for (let x = x0; x <= x1; x++) { gset(grid, y0 === y0 ? x : x, y0, wt); gset(grid, x, y1, wt); }
    for (let y = y0; y <= y1; y++) { gset(grid, x0, y, wt); gset(grid, x1, y, wt); }
    for (let y = y0 + 1; y < y1; y++) for (let x = x0 + 1; x < x1; x++) gset(grid, x, y, ft);
  };
  const doorGap = (x: number, y: number, ft: number) => { gset(grid, x, y, ft); };

  // ---------- 居民区：9 座小院 ----------
  const resHouse = (x0: number, y0: number, w: number, h: number, door: 'S'|'E') => {
    wallRect(x0, y0, x0 + w, y0 + h, T.RES_W, T.RES_F);
    if (door === 'S') doorGap(x0 + Math.floor(w / 2), y0 + h, T.RES_F);
    else doorGap(x0 + w, y0 + Math.floor(h / 2), T.RES_F);
  };
  // 药剂铺（14号院）：10..21, 8..17
  resHouse(10, 8, 11, 9, 'S');
  // 其余小院
  const resHouses: [number, number, number, number][] = [
    [5, 5, 7, 6], [14, 5, 7, 6], [23, 5, 7, 6],
    [5, 20, 7, 6], [23, 20, 7, 6], [26, 12, 5, 6],
    [20, 22, 7, 6], [7, 13, 5, 6],
  ];
  for (const [x, y, w, h] of resHouses) resHouse(x, y, w, h, Math.random() > .5 ? 'S' : 'E');
  // 14号院花盆（月季）→ 钥匙
  gset(grid, 16, 19, T.YARD);
  props.push({ kind: 'bush', x: 16.5 * TILE, y: 19.5 * TILE, r: 10, solid: false, zone: Z.RES });
  interacts.push({ id: 'flowerpot', x: 16.5 * TILE, y: 19.5 * TILE, r: 42, label: '查看月季花盆', act: 'flowerpot' });
  // 纸条1：药铺内
  pickups.push({ item: 'note1', x: 13 * TILE, y: 11 * TILE, zone: Z.RES });
  // P9 手枪：26..32 号院旁
  pickups.push({ item: 'p9', x: 24 * TILE + 16, y: 13 * TILE + 16, zone: Z.RES });
  // 民居杂物
  scatter(props, grid, 4, 31, 4, 31, ['crate', 'barrel', 'bike', 'well', 'bench', 'bush'], 26, rng, Z.RES);

  // ---------- 废弃医院 ----------
  wallRect(37, 5, 53, 22, T.HOS_W, T.HOS_F);
  doorGap(45, 22, T.HOS_F);              // 正门（南）
  doorGap(53, 13, T.HOS_F);              // 东门
  // 内部隔断
  for (let x = 42; x <= 48; x++) gset(grid, x, 11, T.HOS_W);
  doorGap(45, 11, T.HOS_F);
  for (let y = 6; y <= 10; y++) gset(grid, 48, y, T.HOS_W);
  doorGap(48, 8, T.HOS_F);
  for (let y = 12; y <= 16; y++) gset(grid, 42, y, T.HOS_W);
  doorGap(42, 14, T.HOS_F);
  // 护士站（39..43, 6..10 内间）
  props.push({ kind: 'counter', x: 40.5 * TILE, y: 7 * TILE, r: 26, solid: true, zone: Z.HOS });
  interacts.push({ id: 'drawer', x: 39.5 * TILE, y: 9.5 * TILE, r: 46, label: '翻找护士站抽屉', act: 'drawer' });
  // 接种室（49..52, 6..9）→ 纸条2
  pickups.push({ item: 'note2', x: 50 * TILE + 12, y: 7 * TILE + 12, zone: Z.HOS });
  // 病房（44..52, 12..20）→ 护甲
  pickups.push({ item: 'vest', x: 49 * TILE + 16, y: 18 * TILE + 8, zone: Z.HOS });
  props.push({ kind: 'bed', x: 47 * TILE, y: 18 * TILE, r: 20, solid: true, zone: Z.HOS });
  // 地下药房（37..41, 18..21）→ 门开在东侧
  wallRect(36, 17, 41, 21, T.HOS_W, T.HOS_F);
  doors.pHarma = { id: 'pHarma', tx: 41, ty: 19, name: '地下药房', open: false, kind: 'key', lock: 'pharmacykey' };
  interacts.push({ id: 'keypad', x: 83 * TILE + 8, y: 70.5 * TILE, r: 44, label: '输入门禁密码', act: 'keypad' });
  interacts.push({ id: 'pharmaDoor', x: 42.5 * TILE, y: 19.5 * TILE, r: 42, label: '打开地下药房（需钥匙）', act: 'pharmaDoor' });
  pickups.push({ item: 'antir', count: 2, x: 38 * TILE, y: 19 * TILE, zone: Z.HOS });
  pickups.push({ item: 'ammo', count: 18, x: 39.5 * TILE, y: 20 * TILE, zone: Z.HOS });
  // 医院敌人 + 精英
  enemies.push({ x: 46 * TILE, y: 15 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 45 * TILE, y: 14 * TILE }, { x: 50 * TILE, y: 18 * TILE }, { x: 44 * TILE, y: 19 * TILE }] });
  enemies.push({ x: 44 * TILE, y: 8 * TILE, elite: false, zone: Z.HOS, patrol: [{ x: 40 * TILE, y: 8 * TILE }, { x: 51 * TILE, y: 8 * TILE }] });
  enemies.push({ x: 50 * TILE, y: 12 * TILE, elite: true, zone: Z.HOS, patrol: [{ x: 47 * TILE, y: 13 * TILE }, { x: 52 * TILE, y: 19 * TILE }] });
  hospitalProps(props, grid, rng);

  // ---------- 北部广播站 ----------
  wallRect(58, 4, 76, 16, T.RAD_W, T.RAD_F);   // 围栏（当作墙体）
  doorGap(67, 16, T.RAD_F);                    // 南门
  props.push({ kind: 'tower', x: 74.5 * TILE, y: 7.5 * TILE, r: 30, solid: true, zone: Z.RAD });
  // 控制室（63..72, 7..12）
  wallRect(62, 6, 72, 11, T.RAD_W, T.RAD_F);
  doorGap(66, 11, T.RAD_F); doorGap(69, 11, T.RAD_F);
  pickups.push({ item: 'note5', x: 64 * TILE + 12, y: 8 * TILE + 12, zone: Z.RAD });
  pickups.push({ item: 'tape', x: 70 * TILE + 10, y: 8.4 * TILE, zone: Z.RAD });
  // 后门（事件奖励）
  doors.radioBack = { id: 'radioBack', tx: 58, ty: 10, name: '广播站后门', open: false, kind: 'flag', lock: 'radioDoorOpen' };
  // 敌群
  enemies.push({ x: 64 * TILE, y: 15 * TILE, elite: false, zone: Z.RAD, patrol: [{ x: 61 * TILE, y: 14 * TILE }, { x: 73 * TILE, y: 14 * TILE }] });
  enemies.push({ x: 66.5 * TILE, y: 13.2 * TILE, elite: true, zone: Z.RAD, patrol: [{ x: 62 * TILE, y: 13.2 * TILE }, { x: 71 * TILE, y: 13.2 * TILE }] });
  enemies.push({ x: 60 * TILE, y: 6 * TILE, elite: false, zone: Z.RAD, patrol: [{ x: 60 * TILE, y: 6 * TILE }, { x: 75 * TILE, y: 5.5 * TILE }] });
  radioProps(props, grid, rng);

  // ---------- 中央街区 / 钟楼 ----------
  // 钟楼 46..49,38..41（四周墙，中心空）
  for (let y = 38; y <= 41; y++) for (let x = 46; x <= 49; x++) {
    const edge = y === 38 || y === 41 || x === 46 || x === 49;
    gset(grid, x, y, edge ? T.CEL_W : T.PLAZA);
  }
  gset(grid, 47, 41, T.PLAZA); gset(grid, 48, 41, T.PLAZA);   // 塔内地面（可进）
  interacts.push({ id: 'clock', x: 48 * TILE, y: 42 * TILE, r: 46, label: '检查钟楼控制柜', act: 'clock' });
  // 隐藏房间：钟楼地窖 52..57, 39..44
  wallRect(52, 39, 57, 44, T.CEL_W, T.CEL_F);
  doors.cellar = { id: 'cellar', tx: 52, ty: 41, name: '钟楼地窖暗门', open: false, kind: 'puzzle', lock: 'clock' };
  doors.cellarBack = { id: 'cellarBack', tx: 54, ty: 44, name: '地窖后门', open: false, kind: 'flag', lock: 'log2' };
  gset(grid, 50, 41, T.CEL_F); gset(grid, 51, 41, T.CEL_F);   // 通道
  pickups.push({ item: 'powercell', x: 53 * TILE + 16, y: 40 * TILE + 12, zone: Z.CEL });
  pickups.push({ item: 'titanium', count: 2, x: 56 * TILE + 8, y: 41 * TILE, zone: Z.CEL });
  pickups.push({ item: 'photo1', x: 53 * TILE + 8, y: 43 * TILE + 10, zone: Z.CEL });
  // 点唱机
  props.push({ kind: 'jukebox', x: 41 * TILE + 14, y: 35 * TILE + 12, r: 18, solid: true, zone: Z.CEN });
  interacts.push({ id: 'jukebox', x: 41 * TILE + 16, y: 35 * TILE + 14, r: 44, label: '使用旧点唱机', act: 'jukebox' });
  // 中央街区杂项
  centralProps(props, grid, rng);
  // 敌人（撤离必经之路）
  enemies.push({ x: 43 * TILE, y: 40 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 38 * TILE, y: 36 * TILE }, { x: 44 * TILE, y: 45 * TILE }] });
  enemies.push({ x: 56 * TILE, y: 44 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 52 * TILE, y: 47 * TILE }, { x: 59 * TILE, y: 40 * TILE }] });
  enemies.push({ x: 50 * TILE, y: 49 * TILE, elite: true, zone: Z.CEN, patrol: [{ x: 48 * TILE, y: 48 * TILE }, { x: 56 * TILE, y: 49 * TILE }] });
  // 中央→撤离 路上的巡逻
  enemies.push({ x: 48 * TILE, y: 60 * TILE, elite: false, zone: Z.CEN, patrol: [{ x: 48 * TILE, y: 56 * TILE }, { x: 48 * TILE, y: 66 * TILE }] });

  // ---------- 仓库区 ----------
  wallRect(66, 26, 76, 34, T.WH_W, T.WH_F);    // A 仓
  doorGap(71, 34, T.WH_F); doorGap(76, 30, T.WH_F);
  wallRect(78, 26, 88, 34, T.WH_W, T.WH_F);    // B 仓（B7 核心）
  doorGap(83, 34, T.WH_F); doorGap(78, 30, T.WH_F);
  // B7 集装箱（B仓内）
  props.push({ kind: 'container', x: 84 * TILE + 10, y: 30 * TILE + 14, r: 20, solid: true, zone: Z.WH, data: { id: 'B7' } });
  interacts.push({ id: 'chestB7', x: 84 * TILE + 14, y: 30 * TILE + 16, r: 48, label: '撬开 B7 集装箱', act: 'chestB7' });
  // 纸条3：B仓
  pickups.push({ item: 'note3', x: 80 * TILE + 10, y: 28 * TILE + 12, zone: Z.WH });
  // 集装箱货场（南）：64..92, 44..52
  for (let i = 0; i < 7; i++) {
    const x = 64 + i * 4, y = i % 2 ? 44 : 49;
    props.push({ kind: 'container', x: x * TILE + 56, y: y * TILE + 14, r: 22, solid: true, zone: Z.WH, data: { id: 'c' + i } });
  }
  // 皮卡 818
  props.push({ kind: 'truck', x: 78 * TILE + 16, y: 49 * TILE + 16, r: 26, solid: true, zone: Z.WH, data: { plate: '818' } });
  interacts.push({ id: 'truck818', x: 78 * TILE + 16, y: 49 * TILE + 20, r: 52, label: '搜皮卡后备箱（818）', act: 'truck818' });
  // 仓库敌人
  enemies.push({ x: 71 * TILE, y: 30 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 68 * TILE, y: 28 * TILE }, { x: 74 * TILE, y: 32 * TILE }] });
  enemies.push({ x: 83 * TILE, y: 30 * TILE, elite: true, zone: Z.WH, patrol: [{ x: 80 * TILE, y: 28 * TILE }, { x: 86 * TILE, y: 32 * TILE }] });
  enemies.push({ x: 70 * TILE, y: 47 * TILE, elite: false, zone: Z.WH, patrol: [{ x: 66 * TILE, y: 46 * TILE }, { x: 75 * TILE, y: 50 * TILE }] });
  warehouseProps(props, grid, rng);

  // ---------- 地铁站 ----------
  wallRect(58, 60, 84, 76, T.MET_W, T.MET_F);   // 站厅围合
  doorGap(58, 60, T.MET_F); doorGap(70, 60, T.MET_F);   // 北入口（接道路）
  // 售票厅（60..66, 61..68）
  for (let x = 60; x <= 66; x++) gset(grid, x, 65, T.MET_W);
  doorGap(63, 65, T.MET_F);
  pickups.push({ item: 'note4', x: 61 * TILE + 12, y: 63 * TILE + 10, zone: Z.MET });
  // 隧道：北段 82..86, 56..66 → 通向北出口
  fillRect(82, 56, 86, 65, T.MET_F, Z.MET);
  doors.metroGate = { id: 'metroGate', tx: 84, ty: 56, name: '隧道北闸', open: false, kind: 'flag', lock: 'log2' };
  // 储物间 80..85, 68..73
  wallRect(80, 68, 86, 73, T.MET_W, T.MET_F);
  doors.storage = { id: 'storage', tx: 80, ty: 70, name: '隧道储物间', open: false, kind: 'code', lock: '1024' };
  pickups.push({ item: 'log2', x: 82 * TILE + 14, y: 70 * TILE + 10, zone: Z.MET });
  pickups.push({ item: 'sigcell', count: 2, x: 84 * TILE + 12, y: 71 * TILE + 8, zone: Z.MET });
  pickups.push({ item: 'cell', count: 3, x: 81.5 * TILE, y: 72 * TILE + 8, zone: Z.MET });
  // 站台列车
  props.push({ kind: 'train', x: 66 * TILE, y: 72 * TILE, r: 60, solid: true, zone: Z.MET });
  // 站台敌人
  enemies.push({ x: 64 * TILE, y: 71 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 61 * TILE, y: 70 * TILE }, { x: 76 * TILE, y: 70 * TILE }] });
  enemies.push({ x: 78 * TILE, y: 66 * TILE, elite: false, zone: Z.MET, patrol: [{ x: 72 * TILE, y: 64 * TILE }, { x: 79 * TILE, y: 72 * TILE }] });
  enemies.push({ x: 84 * TILE, y: 60 * TILE, elite: true, zone: Z.MET, patrol: [{ x: 84 * TILE, y: 58 * TILE }, { x: 84 * TILE, y: 64 * TILE }] });
  metroProps(props, grid, rng);

  // ---------- 撤离点 ----------
  wallRect(41, 83, 55, 93, T.MET_W, T.YARD);   // 围墙
  doorGap(48, 83, T.YARD); doorGap(43, 88, T.YARD); doorGap(53, 88, T.YARD);
  props.push({ kind: 'kiosk', x: 45 * TILE, y: 90 * TILE, r: 18, solid: true, zone: Z.EXT });
  props.push({ kind: 'barrel', x: 52 * TILE, y: 86 * TILE, r: 10, solid: true, zone: Z.EXT });
  pickups.push({ item: 'cell', count: 2, x: 51 * TILE + 10, y: 86 * TILE, zone: Z.EXT });

  // ---------- 普通资源散布 ----------
  const commons = ['cloth', 'bolt', 'wire', 'canfood', 'cell'];
  const rareZones: Record<number, string[]> = {
    [Z.RES]: [], [Z.HOS]: ['antir'], [Z.WH]: ['titanium'], [Z.MET]: ['sigcell'], [Z.CEN]: ['titanium'], [Z.RAD]: ['antir', 'titanium', 'sigcell'],
  };
  const zonesR: [number, number, number, number, number][] = [
    [Z.RES, 5, 30, 6, 30], [Z.HOS, 36, 21, 4, 21], [Z.WH, 64, 52, 25, 52],
    [Z.MET, 57, 86, 55, 86], [Z.CEN, 35, 52, 30, 52], [Z.RAD, 58, 16, 4, 16],
  ];
  for (const [z, x0, x1, y0, y1] of zonesR) {
    const n = z === Z.MET ? 14 : z === Z.CEN ? 12 : 16;
    for (let i = 0; i < n; i++) {
      const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
      const t = gget(grid, x, y);
      if (isSolidTile(t)) continue;
      pickups.push({ item: commons[Math.floor(rng() * commons.length)], count: 1 + Math.floor(rng() * 3), x: x * TILE + 16, y: y * TILE + 16, zone: z });
    }
    const rare = rareZones[z];
    if (rare && rare.length) {
      for (let i = 0; i < 2; i++) {
        const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
        if (!isSolidTile(gget(grid, x, y)))
          pickups.push({ item: rare[Math.floor(rng() * rare.length)], count: 1, x: x * TILE + 16, y: y * TILE + 16, zone: z, locked: true });
      }
    }
    // 少量罐头
    for (let i = 0; i < 3; i++) {
      const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
      if (!isSolidTile(gget(grid, x, y))) pickups.push({ item: 'can', count: 1, x: x * TILE + 16, y: y * TILE + 16, zone: z });
    }
  }

  // ---------- 街灯 ----------
  const lampAt = (x: number, y: number, r = 130) => {
    props.push({ kind: 'lamp', x: x * TILE, y: y * TILE, r: 6, solid: true, zone: zget(x, y) });
    lamps.push({ x: x * TILE, y: y * TILE - 8, r });
  };
  lampAt(48, 55, 170); lampAt(65, 42, 150); lampAt(17, 42, 150); lampAt(34, 41, 150);
  lampAt(48, 70, 170); lampAt(48, 84, 170);
  lampAt(45, 30, 150); lampAt(53, 15, 150); lampAt(46, 8, 140);
  lampAt(63, 68, 120); lampAt(80, 74, 120); lampAt(70, 10, 140);
  lampAt(44, 48, 140); lampAt(55, 34, 140);

  // ---------- 周边树（非区域） ----------
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(rng() * W), y = Math.floor(rng() * H);
    const z = zget(x, y);
    if (z !== Z.NONE) continue;
    if (rng() < 0.55) props.push({ kind: 'tree', x: x * TILE + 16, y: y * TILE + 16, r: 14, solid: true, zone: Z.NONE });
  }

  // ---------- 关键坐标 ----------
  const clock: World['clock'] = { x: 48.5 * TILE, y: 40 * TILE };
  const extraction = { x: 48 * TILE + 16, y: 88.5 * TILE };
  const jukebox = { x: 41 * TILE + 16, y: 35 * TILE + 14 };
  const spawn = { x: 48 * TILE + 16, y: 56 * TILE };

  // 撤离点信标
  interacts.push({ id: 'extract', x: extraction.x, y: extraction.y, r: 60, label: '启动撤离信标', act: 'extract' });

  return {
    grid, zoneId, props, pickups, enemies, doors, interacts, lamps,
    clock, extraction, jukebox, spawn,
    exits: { north: [48, 30], south: [48, 88] },
  };
}

// ---------- 各区域道具 ----------
function scatter(props: PropDef[], grid: Grid, x0: number, x1: number, y0: number, y1: number,
  kinds: string[], n: number, rng: () => number, zone: number) {
  for (let i = 0; i < n; i++) {
    const x = x0 + Math.floor(rng() * (x1 - x0 + 1)), y = y0 + Math.floor(rng() * (y1 - y0 + 1));
    if (isSolidTile(gget(grid, x, y))) continue;
    const kind = kinds[Math.floor(rng() * kinds.length)];
    const solid = !['bush', 'bench', 'well'].includes(kind);
    props.push({ kind: kind as any, x: x * TILE + 16, y: y * TILE + 16, r: kind === 'tree' ? 14 : 10, solid, zone });
  }
}
function hospitalProps(props: PropDef[], grid: Grid, rng: () => number) {
  const spec: [string, number, number][] = [['counter', 44, 13], ['bed', 46, 19], ['bed', 51, 16], ['bed', 39, 14], ['shelf', 37.5, 8], ['shelf', 51, 7], ['fridge', 38, 20], ['hydrant', 44, 23], ['bench', 36, 23], ['crate', 52, 23]];
  for (const [k, tx, ty] of spec) props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: 14, solid: k !== 'bench', zone: Z.HOS });
}
function radioProps(props: PropDef[], grid: Grid, rng: () => number) {
  const spec: [string, number, number][] = [['barrel', 59, 6], ['barrel', 59, 9], ['crate', 75, 12], ['crate', 74, 14], ['bench', 61, 13], ['hydrant', 76, 15]];
  for (const [k, tx, ty] of spec) props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: 12, solid: k !== 'bench', zone: Z.RAD });
}
function centralProps(props: PropDef[], grid: Grid, rng: () => number) {
  const spec: [string, number, number][] = [['kiosk', 37, 31], ['kiosk', 57, 31], ['kiosk', 36, 48], ['kiosk', 58, 48], ['bench', 40, 32], ['bench', 56, 50], ['car', 43, 47], ['car', 53, 47], ['bike', 38, 38], ['hydrant', 61, 31], ['well', 59, 51]];
  for (const [k, tx, ty] of spec) props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: k === 'car' ? 22 : 12, solid: k !== 'bench' && k !== 'well', zone: Z.CEN });
}
function warehouseProps(props: PropDef[], grid: Grid, rng: () => number) {
  const spec: [string, number, number][] = [['crate', 67, 27], ['crate', 68, 33], ['crate', 75, 32], ['crate', 79, 28], ['barrel', 77, 26], ['barrel', 87, 32], ['bike', 65, 27], ['car', 91, 40], ['hydrant', 93, 36]];
  for (const [k, tx, ty] of spec) props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: 12, solid: k !== 'bike' && k !== 'bench', zone: Z.WH });
  const c = props.find(p => p.kind === 'truck')!;
  c.r = 30;
}
function metroProps(props: PropDef[], grid: Grid, rng: () => number) {
  const spec: [string, number, number][] = [['bench', 61, 71], ['bench', 71, 70], ['kiosk', 68, 62], ['hydrant', 59, 59], ['crate', 82, 73], ['lamp', 66, 66]];
  for (const [k, tx, ty] of spec) props.push({ kind: k as any, x: tx * TILE, y: ty * TILE, r: 12, solid: k !== 'bench', zone: Z.MET });
}
