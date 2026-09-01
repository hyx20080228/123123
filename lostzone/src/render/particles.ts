// ============ 轻量粒子系统 ============
import { Container, Graphics } from 'pixi.js';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: number; grav: number; kind: number }

export class Particles {
  c = new Container();
  private ps: P[] = [];
  private g = new Graphics();

  constructor() { this.c.addChild(this.g); this.g.zIndex = 40; }

  spawn(x: number, y: number, opts: { n?: number; color?: number; speed?: number; life?: number; size?: number; grav?: number; kind?: number; spread?: number; ang?: number }) {
    const n = opts.n ?? 6;
    for (let i = 0; i < n; i++) {
      const a = (opts.ang ?? 0) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 0.8);
      const sp = (opts.speed ?? 120) * (0.4 + Math.random() * 0.8);
      this.ps.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, max: (opts.life ?? 0.5) * (0.6 + Math.random() * 0.8),
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        color: opts.color ?? 0xffffff, grav: opts.grav ?? 320, kind: opts.kind ?? 0,
      });
    }
    if (this.ps.length > 600) this.ps.splice(0, this.ps.length - 600);
  }

  update(dt: number) {
    const g = this.g; g.clear();
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life += dt;
      if (p.life >= p.max) { this.ps.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = 1 - p.life / p.max;
      g.circle(p.x, p.y, p.size * (0.5 + a * 0.6)).fill({ color: p.color, alpha: a });
    }
  }
}
