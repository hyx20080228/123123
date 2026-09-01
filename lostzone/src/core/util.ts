// ============ 工具：数学 / 随机 / 网格寻路 / 视线 ============

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const TAU = Math.PI * 2;
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay; return dx * dx + dy * dy;
};
// --------- 网格 ---------
export interface Grid { w: number; h: number; cells: Uint8Array; }
export const gget = (g: Grid, x: number, y: number): number => {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return 255;
  return g.cells[y * g.w + x];
};
export const gset = (g: Grid, x: number, y: number, v: number) => {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return;
  g.cells[y * g.w + x] = v;
};

// --------- BFS（均匀代价，返回 next step） ---------
export interface BfsResult { found: boolean; came: Int32Array }
export function bfsWalkable(g: Grid, walkable: (t: number) => boolean, sx: number, sy: number, tx: number, ty: number): Int32Array {
  const { w, h } = g;
  const came = new Int32Array(w * h).fill(-1);
  if (sx === tx && sy === ty) { came[sy * w + sx] = sy * w + sx; return came; }
  const qx = new Int32Array(w * h), qy = new Int32Array(w * h);
  let qh = 0, qt = 0;
  qx[qt] = sx; qy[qt] = sy; qt++; came[sy * w + sx] = sy * w + sx;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (qh < qt) {
    const x = qx[qh], y = qy[qh]; qh++;
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const idx = ny * w + nx;
      if (came[idx] !== -1) continue;
      if (!walkable(getTileWrap(g, nx, ny))) continue;
      came[idx] = y * w + x;
      if (nx === tx && ny === ty) return came;
      qx[qt] = nx; qy[qt] = ny; qt++;
    }
  }
  return came;
}
export function getTileWrap(g: Grid, x: number, y: number) { return gget(g, x, y); }

export function bfsNext(came: Int32Array, w: number, sx: number, sy: number, tx: number, ty: number): [number, number] | null {
  let idx = ty * w + tx;
  if (came[idx] === -1) return null;
  const start = sy * w + sx;
  if (idx === start) return null;
  let guard = 0;
  while (came[idx] !== -1 && came[idx] !== idx && guard++ < w * 2000) {
    const prev = came[idx];
    if (prev === start) return [idx % w, Math.floor(idx / w)];
    idx = prev;
  }
  return null;
}

// --------- 射线 vs 网格（DDA），返回碰撞点 ---------
export function raycastGrid(g: Grid, solid: (t: number) => boolean,
  x0: number, y0: number, x1: number, y1: number, maxDist: number): { hit: boolean; x: number; y: number; t: number } {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { hit: false, x: x1, y: y1, t: 1 };
  const steps = Math.ceil(len / 8);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + dx * t, y = y0 + dy * t;
    if (solid(gget(g, Math.floor(x / 32), Math.floor(y / 32)))) {
      return { hit: true, x, y, t: Math.min(1, (i - 1) / steps) };
    }
    if (t * len > maxDist) break;
  }
  return { hit: false, x: x1, y: y1, t: 1 };
}
