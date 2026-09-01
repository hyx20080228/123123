// 生成旧城区布局预览 PNG（无浏览器依赖）
import { generateWorld, W, H, T, Z, isSolidTile, TILE } from '../src/world/mapgen';
import { gget } from '../src/core/util';
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const S = 8;
const OUT = 768;

const tileColor: Record<number, [number, number, number]> = {
  [T.GRASS]: [85, 112, 63], [T.ROAD]: [89, 99, 111], [T.PLAZA]: [179, 168, 143], [T.YARD]: [176, 154, 106],
  [T.TRACK]: [51, 58, 68],
  [T.RES_F]: [200, 160, 106], [T.RES_W]: [44, 48, 56],
  [T.HOS_F]: [207, 224, 228], [T.HOS_W]: [44, 48, 56],
  [T.WH_F]: [143, 146, 135], [T.WH_W]: [44, 48, 56],
  [T.MET_F]: [47, 90, 102], [T.MET_W]: [44, 48, 56],
  [T.RAD_F]: [106, 90, 114], [T.RAD_W]: [44, 48, 56],
  [T.CEL_F]: [122, 106, 82], [T.CEL_W]: [44, 48, 56],
};
const zoneColor: Record<number, [number, number, number]> = {
  [Z.RES]: [232, 178, 90], [Z.HOS]: [216, 226, 228], [Z.WH]: [192, 90, 50], [Z.MET]: [38, 80, 94],
  [Z.CEN]: [196, 99, 74], [Z.RAD]: [106, 61, 114], [Z.EXT]: [89, 196, 106], [Z.CEL]: [154, 133, 106],
};

const px = Buffer.alloc(OUT * OUT * 3);
function set(x: number, y: number, c: [number, number, number]) {
  if (x < 0 || y < 0 || x >= OUT || y >= OUT) return;
  const i = (y * OUT + x) * 3;
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
}
function disc(x: number, y: number, r: number, c: [number, number, number]) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    if (dx * dx + dy * dy <= r * r) set(x + dx, y + dy, c);
}
function ring(x: number, y: number, r: number, c: [number, number, number]) {
  for (let a = 0; a < 360; a += 3) {
    set(x + Math.round(Math.cos(a * Math.PI / 180) * r), y + Math.round(Math.sin(a * Math.PI / 180) * r), c);
  }
}

const w = generateWorld();

// 地面
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const id = gget(w.grid, x, y);
  const z = w.zoneId[y * W + x];
  const c = isSolidTile(id) ? tileColor[T.MET_W] : (tileColor[id] ?? zoneColor[z] ?? [60, 70, 50]);
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) set(x * S + i, y * S + j, c);
}

// 道具
for (const p of w.props) {
  const cx = Math.round(p.x / TILE * S), cy = Math.round(p.y / TILE * S);
  const r = Math.max(3, Math.round(p.r / TILE * S));
  const c: [number, number, number] = p.kind === 'tree' ? [52, 92, 48] : p.kind === 'container' || p.kind === 'truck' || p.kind === 'car' ? [160, 90, 50] : [110, 96, 70];
  disc(cx, cy, p.kind === 'tree' ? r : Math.max(2, r - 1), c);
}
// 拾取物
for (const pk of w.pickups) {
  const cx = Math.round(pk.x / TILE * S), cy = Math.round(pk.y / TILE * S);
  const c: [number, number, number] = pk.item.startsWith('note') || pk.item.startsWith('log') || pk.item === 'photo1' ? [178, 107, 255]
    : ['titanium', 'antir', 'sigcell'].includes(pk.item) ? [255, 194, 60]
    : pk.item === 'powercell' ? [89, 230, 217] : [235, 244, 255];
  disc(cx, cy, 1.6, c);
}
// 交互点（黄圈）与门（红框）
for (const it of w.interacts) {
  const cx = Math.round(it.x / TILE * S), cy = Math.round(it.y / TILE * S);
  ring(cx, cy, it.act === 'extract' ? 10 : 5, [255, 220, 120]);
}
for (const d of Object.values(w.doors)) {
  const cx = d.tx * S + S / 2, cy = d.ty * S + S / 2;
  ring(cx, cy, 3.4, [255, 70, 60]);
}
// 撤离点大圈
ring(Math.round(w.extraction.x / TILE * S), Math.round(w.extraction.y / TILE * S), 16, [89, 196, 106]);
// 出生点
disc(Math.round(w.spawn.x / TILE * S), Math.round(w.spawn.y / TILE * S), 4, [255, 255, 255]);

// --- PNG 编码 ---
function crc32(buf: Buffer): number {
  let c: number; const table: number[] = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT, 0); ihdr.writeUInt32BE(OUT, 4);
ihdr[8] = 8; ihdr[9] = 2;
const raw = Buffer.alloc(OUT * (OUT * 3 + 1));
for (let y = 0; y < OUT; y++) {
  raw[y * (OUT * 3 + 1)] = 0;
  px.copy(raw, y * (OUT * 3 + 1) + 1, y * OUT * 3, (y + 1) * OUT * 3);
}
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 6 })),
  chunk('IEND', Buffer.alloc(0)),
]);
writeFileSync('docs/preview-map.png', png);
console.log('written docs/preview-map.png', png.length, 'bytes');
