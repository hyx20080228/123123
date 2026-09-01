// ============ UI：大厅 / HUD / 弹窗 / 情报墙 / 谜题 ============
import { CHARS, ITEMS, LORE, UPGRADES, SaveData, fmt, CharDef } from '../core/defs';
import { RunState, storeSave } from '../game/state';
import { HudApi } from '../game/game';
import { World, W, H, TILE, ZONES, Z } from '../world/mapgen';
import { sfx } from '../audio/sfx';

type StartFn = (charId: string) => void;

export class Ui implements HudApi {
  private root = document.getElementById('screen-root')!;
  private onStart: StartFn;
  private save: SaveData;
  private pixiApp: { renderer: { width: number; height: number; resize(w: number, h: number): void } } | null = null;
  // HUD 元素
  private hudEl!: HTMLElement; private zoneEl!: HTMLElement; private hpFill!: HTMLElement; private arFill!: HTMLElement;
  private hpLab!: HTMLElement; private arLab!: HTMLElement; private hotbarEl!: HTMLElement;
  private promptEl!: HTMLElement; private msgEl!: HTMLElement; private extractEl!: HTMLElement;
  private extractFill!: HTMLElement; private minimapCv!: HTMLCanvasElement;
  private flashEl!: HTMLElement; private buffEl!: HTMLElement;
  private miniBase: HTMLCanvasElement | null = null; private miniFog: HTMLCanvasElement | null = null;
  private fogPos: { x: number; y: number }[] = [];
  private lastTick = 0;
  private modalOpen = false;
  private shown: Record<string, boolean> = {};

  constructor(save: SaveData, onStart: StartFn) {
    this.save = save; this.onStart = onStart;
    this.buildLobby();
  }

  // ================= 大厅 =================
  private buildLobby() {
    const s = this.save;
    const chars = CHARS.map(c => `
      <div class="char-card ${c.id === s.charId ? 'sel' : ''}" data-char="${c.id}">
        <div style="height:64px;display:flex;align-items:center;justify-content:center;font-size:42px">${c.id === 'cat' ? '🐱' : c.id === 'rabbit' ? '🐰' : c.id === 'raccoon' ? '🦝' : '🦉'}</div>
        <div class="n">${c.name}</div><div class="s">${c.species} · ${c.desc.slice(0, 14)}…</div>
      </div>`).join('');
    this.root.innerHTML = `
    <div id="lobby">
      <div class="card-glow"></div>
      <div style="text-align:center">
        <h1 class="title">失落区</h1>
        <h2 class="sub">LOST ZONE · 1-4 人 PvPvE 搜打撤 · Vertical Slice</h2>
      </div>
      <div class="char-row">${chars}</div>
      <div class="menu">
        <button class="btn primary" id="btn-go">进入旧城区</button>
        <button class="btn" id="btn-shop">回收站 · 升级</button>
        <button class="btn" id="btn-lore">情报墙 (${s.lore.length}/10)</button>
        <button class="btn" id="btn-help">操作说明</button>
      </div>
      <div class="stats">
        <span>旧币 <b>${fmt(s.gold)}</b></span>
        <span>出击 <b>${s.runs}</b></span>
        <span>撤离 <b>${s.extractions}</b></span>
        <span>阵亡 <b>${s.deaths}</b></span>
        <span>最快 <b>${s.bestTime ? Math.floor(s.bestTime / 60) + ':' + String(Math.floor(s.bestTime % 60)).padStart(2, '0') : '—'}</b></span>
      </div>
      <div class="stats" style="font-size:12px;opacity:.8">实验性垂直切片 · 演示「探索→信息→决策→风险→奖励」闭环</div>
    </div>`;
    this.root.querySelectorAll('.char-card').forEach(el => {
      el.addEventListener('click', () => {
        sfx.ensure(); sfx.click();
        this.save.charId = (el as HTMLElement).dataset.char!;
        this.root.querySelectorAll('.char-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        this.persist();
      });
    });
    (this.root.querySelector('#btn-go') as HTMLButtonElement).onclick = () => { sfx.ensure(); sfx.click(); this.onStart(this.save.charId); };
    (this.root.querySelector('#btn-shop') as HTMLButtonElement).onclick = () => { sfx.ensure(); sfx.click(); this.shop(); };
    (this.root.querySelector('#btn-lore') as HTMLButtonElement).onclick = () => { sfx.ensure(); sfx.click(); this.loreWall(); };
    (this.root.querySelector('#btn-help') as HTMLButtonElement).onclick = () => { sfx.ensure(); sfx.click(); this.screen('help'); };
  }

  private persist() {}

  // ================= 屏幕框架 =================
  private screen(id: string, html = '', closeText = '返回大厅'): void {
    const div = document.createElement('div');
    div.className = 'screen open'; div.id = id;
    div.innerHTML = `<div class="window panel">
      <div class="closebar"><button class="btn small">${closeText}</button></div>
      ${html}</div>`;
    div.querySelector('.closebar button')!.addEventListener('click', () => { sfx.click(); div.remove(); });
    div.addEventListener('click', (e) => { if (e.target === div) div.remove(); });
    (this.root.querySelectorAll('.screen.open') || []).forEach(x => x.remove());
    this.root.appendChild(div);
  }

  // ---------- 回收站 ----------
  private shop() {
    const s = this.save;
    const itemRows = Object.entries(s.stash).filter(([k, v]) => v > 0).map(([k, v]) => {
      const d = ITEMS[k]; if (!d) return '';
      return `<div class="cell"><div class="ic">${d.icon}</div><div class="nm">${d.name} ×${v}</div>
        <div class="ds">单价 ${d.value} 旧币</div>
        <button class="btn small sell" data-item="${k}">全部出售 +${d.value * v}</button></div>`;
    }).join('');
    const ups = UPGRADES.map(u => {
      const lv = s.upgrades[u.id] || 0;
      const cost = lv < u.max ? u.costs[lv] : null;
      return `<div class="cell"><div class="nm" style="font-size:14px">${u.name} ${'★'.repeat(lv)}</div>
        <div class="ds">${u.desc}<br>当前 Lv.${lv}/${u.max}</div>
        <button class="btn small up" data-up="${u.id}" ${cost === null || s.gold < cost ? 'disabled' : ''}>${cost === null ? '已满级' : `${cost} 旧币升级`}</button></div>`;
    }).join('');
    this.screen('shop', `
      <h2>🏪 回收站</h2>
      <p style="color:var(--sub);font-size:13px;margin:-6px 0 14px">出售战利品换取旧币，用旧币强化出击配置。旧币 <b style="color:var(--amber2)">${fmt(s.gold)}</b></p>
      <div style="font-size:14px;color:var(--amber2);margin:8px 0 6px">仓库（撤离带回的战利品）</div>
      ${itemRows || '<div style="color:var(--sub);font-size:13px">仓库是空的——先撤离一次吧。</div>'}
      <div style="font-size:14px;color:var(--amber2);margin:18px 0 6px">升级</div>
      <div class="grid-items">${ups}</div>`);
    this.root.querySelectorAll('.sell').forEach(b => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.item!;
      const n = s.stash[k] || 0; s.gold += (ITEMS[k]?.value || 0) * n;
      delete s.stash[k]; storeSave(this.save); sfx.pickup(); this.shop();
    }));
    this.root.querySelectorAll('.up').forEach(b => b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.up!;
      const u = UPGRADES.find(x => x.id === id)!;
      const lv = s.upgrades[id] || 0;
      const cost = u.costs[lv];
      if (s.gold >= cost) { s.gold -= cost; s.upgrades[id] = lv + 1; sfx.unlock(); this.shop(); }
    }));
  }

  // ---------- 情报墙 ----------
  private loreWall() {
    const s = this.save;
    const cards = s.lore.map(id => {
      const l = LORE[id]; if (!l) return '';
      return `<div class="lore-card"><span class="tag">${l.tag}</span><b>${l.zone}</b>
        <h4 style="margin:8px 0 4px">${l.title}</h4><p>${l.body}</p>
        <p style="color:var(--violet);font-size:12.5px;margin-top:8px">→ ${l.hint}</p></div>`;
    }).join('');
    const missing = Object.values(LORE).filter(l => !s.lore.includes(l.id));
    this.screen('lore', `
      <h2>🗂️ 情报墙</h2>
      <p style="color:var(--sub);font-size:13px;margin:-6px 0 14px">已收集 ${s.lore.length}/10 · 碎片永不丢失。卖掉的资源还会回来，卖掉的真相不会。</p>
      ${cards || '<div style="color:var(--sub);font-size:14px">还没有任何情报。进入旧城区，把纸条、日志和照片带回来。</div>'}
      ${missing.length ? `<div style="color:var(--sub);font-size:12px;margin-top:10px">未发现：${missing.map(m => `${m.tag}·${m.zone.split('·')[0]}`).join(' / ')}</div>` : ''}`);
  }

  // ================= 对局 HUD =================
  buildHud(app: any, world: World) {
    this.pixiApp = app;
    this.world = world;
    const el = document.createElement('div');
    el.id = 'hud'; el.innerHTML = `
      <div class="top-left">
        <div class="zone" id="hud-zone">旧城区</div>
        <div class="bars">
          <div class="bar hp"><div class="fill" id="hud-hp"></div><div class="lab" id="hud-hp-lab">100/100</div></div>
          <div class="bar ar"><div class="fill" id="hud-ar"></div><div class="lab" id="hud-ar-lab"></div></div>
        </div>
        <div id="buff" style="display:none"></div>
      </div>
      <div class="top-right"><canvas id="minimap" width="212" height="212"></canvas></div>
      <div class="bottom">
        <div id="extract-bar"><div class="t">撤离中 · 保持站立</div><div class="track"><div class="f" id="extract-fill"></div></div></div>
        <div id="hotbar"></div>
      </div>
      <div id="prompt"></div>
      <div class="msg" id="hud-msg"></div>
      <div class="flash" id="hud-flash"></div>`;
    this.root.appendChild(el);
    this.hudEl = el;
    this.zoneEl = el.querySelector('#hud-zone')!;
    this.hpFill = el.querySelector('#hud-hp')!;
    this.arFill = el.querySelector('#hud-ar')!;
    this.hpLab = el.querySelector('#hud-hp-lab')!;
    this.arLab = el.querySelector('#hud-ar-lab')!;
    this.hotbarEl = el.querySelector('#hotbar')!;
    this.promptEl = el.querySelector('#prompt')!;
    this.msgEl = el.querySelector('#hud-msg')!;
    this.extractEl = el.querySelector('#extract-bar')!;
    this.extractFill = el.querySelector('#extract-fill')!;
    this.minimapCv = el.querySelector('#minimap')!;
    this.flashEl = el.querySelector('#hud-flash')!;
    this.buffEl = el.querySelector('#buff')!;
    this.buildMiniBase();
  }
  private world: World = null as any;
  showHud(show: boolean) { if (this.hudEl) this.hudEl.style.display = show ? '' : 'none'; }

  setHud(data: any) {
    if (data.hotbar === undefined) return;
    const slots = data.hotbar as (RunState['slots'][number])[];
    const idx = data.slotIdx as number;
    let html = '';
    for (let i = 0; i < 6; i++) {
      const s = slots[i];
      const def = s ? ITEMS[s.item] : null;
      html += `<div class="slot ${i === idx ? 'sel' : ''}" data-slot="${i}">
        <div class="k">${i + 1}</div>
        ${def ? `<div class="ic">${def.icon}</div><div class="cnt">${def.kind === 'gun' ? `${s!.count}` : s!.count > 1 ? `×${s!.count}` : ''}</div>` : ''}
      </div>`;
    }
    this.hotbarEl.innerHTML = html;
    this.hotbarEl.querySelectorAll('.slot').forEach(el => {
      (el as HTMLElement).addEventListener('click', () => this.onSlotClick?.(+ (el as HTMLElement).dataset.slot!));
    });
  }
  onSlotClick: ((i: number) => void) | null = null;

  hudTick(st: RunState, save: SaveData) {
    const now = performance.now();
    if (now - this.lastTick < 80) return;
    this.lastTick = now;
    this.hpFill.style.width = `${st.hp / st.maxHp * 100}%`;
    this.hpLab.textContent = `${Math.ceil(st.hp)}/${st.maxHp}`;
    this.arFill.style.width = `${st.armor / st.maxArmor * 100}%`;
    this.arLab.textContent = st.armor > 0 ? `护甲 ${Math.ceil(st.armor)}` : '';
    if (st.infoMult > 1) { this.buffEl.style.display = ''; this.buffEl.textContent = '🎵 情报猎手：信息价值 ×2'; }
    // 受击红闪
    (this.flashEl as any).style.boxShadow = `inset 0 0 ${Math.max(0, st.hp) < 30 ? 160 : 90}px rgba(226,60,60,${st.hp < 30 ? 0.28 : 0.12})`;
    this.updateMinimap(null);
  }

  toast(msg: string, kind = 'info') {
    const t = document.createElement('div');
    t.className = `toast ${kind}`; t.textContent = msg;
    this.msgEl.appendChild(t);
    setTimeout(() => t.remove(), 3200);
    while (this.msgEl.children.length > 4) this.msgEl.firstChild!.remove();
  }

  prompt(text: string | null) {
    if (!text) { this.promptEl.style.display = 'none'; return; }
    this.promptEl.style.display = 'block';
    this.promptEl.innerHTML = text;
  }

  zone(name: string) { this.zoneEl.textContent = `📍 ${name}`; }

  extract(p: number | null) {
    if (p === null) { this.extractEl.style.display = 'none'; return; }
    this.extractEl.style.display = 'flex';
    this.extractFill.style.width = `${Math.min(100, p * 100)}%`;
  }

  // ---------- 小地图 ----------
  private buildMiniBase() {
    const cv = document.createElement('canvas'); cv.width = 96 * 3; cv.height = 96 * 3;
    const ctx = cv.getContext('2d')!;
    const g = new Map<number, string>([
      [0, '#55703f'], [1, '#59636f'], [2, '#b3a88f'], [3, '#333a44'], [4, '#c8a06a'], [5, '#e6d5b0'],
      [10, '#c8a06a'], [11, '#2c3038'], [12, '#cfe0e4'], [13, '#2c3038'], [14, '#8f9287'], [15, '#2c3038'],
      [16, '#2f5a66'], [17, '#2c3038'], [18, '#6a5a72'], [19, '#2c3038'], [20, '#7a6a52'], [21, '#2c3038'], [22, '#b09a6a'],
    ]);
    const zoneCol: Record<string, string> = { '1': '#e8b25a', '2': '#d8e2e4', '3': '#c05a32', '4': '#26505e', '5': '#c4634a', '6': '#6a3d72', '7': '#59c46a', '8': '#9a856a' };
    // 用 zone 颜色优先
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const id = this.world.grid.cells[y * 96 + x];
      const z = this.world.zoneId[y * 96 + x];
      const c = z !== 0 ? (zoneCol[String(z)] || '#55703f') : (g.get(id) || '#55703f');
      ctx.fillStyle = c;
      ctx.fillRect(x * 3, y * 3, 3, 3);
    }
    this.miniBase = cv;
    this.miniFog = document.createElement('canvas');
    this.miniFog.width = 96 * 3; this.miniFog.height = 96 * 3;
    const fctx = this.miniFog.getContext('2d')!;
    fctx.fillStyle = 'rgba(8,10,14,0.82)'; fctx.fillRect(0, 0, 96 * 3, 96 * 3);
    // 撤离点初始可见
    this.revealMini(48 * 32 + 16, 88 * 32 + 16, 60);
  }
  private revealMini(px: number, py: number, r = 110) {
    const fctx = this.miniFog!.getContext('2d')!;
    fctx.globalCompositeOperation = 'destination-out';
    const grd = fctx.createRadialGradient(px / 32 * 3, py / 32 * 3, 4, px / 32 * 3, py / 32 * 3, r / 32 * 3);
    grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    fctx.fillStyle = grd;
    fctx.fillRect(0, 0, 96 * 3, 96 * 3);
    fctx.globalCompositeOperation = 'source-over';
  }
  updateMinimap(p: { x: number; y: number; aim: number } | null) {
    if (!this.minimapCv || !this.miniBase || !this.miniFog) return;
    const ctx = this.minimapCv.getContext('2d')!;
    ctx.clearRect(0, 0, 212, 212);
    ctx.drawImage(this.miniBase, 0, 0, 212, 212);
    ctx.drawImage(this.miniFog, 0, 0, 212, 212);
    if (p) {
      this.revealMini(p.x, p.y);
      const mx = p.x / 32 * 212 / 96, my = p.y / 32 * 212 / 96;
      // 撤离点标记
      ctx.fillStyle = '#59c46a';
      ctx.beginPath(); ctx.arc(48 / 96 * 212, 88.5 / 96 * 212, 3, 0, 7); ctx.fill();
      ctx.font = '9px sans-serif'; ctx.fillText('撤离', 48 / 96 * 212 + 5, 88.5 / 96 * 212 + 3);
      // 玩家箭头
      ctx.save();
      ctx.translate(mx, my);
      ctx.rotate(p.aim);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ================= 弹窗 =================
  private modal(html: string, opts: { paper?: boolean; wide?: boolean } = {}): HTMLElement {
    this.modalOpen = true;
    const div = document.createElement('div');
    div.id = 'modal'; div.className = 'open';
    div.innerHTML = `<div class="window panel">${html}</div>`;
    document.body.appendChild(div);
    return div;
  }
  closeAll() {
    document.querySelectorAll('#modal, .screen.open, #pause.open').forEach(el => el.remove());
    this.modalOpen = false;
  }

  openLore(loreId: string, onClose?: () => void) {
    const l = LORE[loreId]; if (!l) return;
    const close = () => { this.closeAll(); onClose?.(); };
    const div = this.modal(`
      <div class="closebar"><button class="btn small">关闭</button></div>
      <h3>${l.zone}</h3>
      <div class="paper"><div class="head">${l.title}</div>${l.body}</div>
      <p style="color:var(--violet);font-size:12.5px;margin-top:10px">→ ${l.hint}</p>`);
    div.querySelector('.closebar button')!.addEventListener('click', () => { close(); });
    div.addEventListener('click', (e) => { if (e.target === div) close(); });
  }

  openPuzzleClock(onDone: () => void, onClose?: () => void) {
    let hour = 12, min = 0;
    const div = this.modal(`
      <div class="closebar"><button class="btn small">离开</button></div>
      <h3>🕒 钟楼控制柜 · 拨动指针</h3>
      <p style="color:var(--sub);font-size:13px;margin:-4px 0 12px">“广播站每晚 3:33 播同一段旋律……别信钟楼。”（纸条2）</p>
      <div class="puzzle-clock" id="clock-face">
        <div class="hand h-hour" id="hand-h" style="transform:rotate(0deg)"></div>
        <div class="hand h-min" id="hand-m" style="transform:rotate(0deg)"></div>
        <div class="pin"></div>
      </div>
      <div style="margin-top:14px;display:flex;gap:20px;align-items:center;justify-content:center">
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
          <button class="btn small" id="h-up">+1 时</button><b id="h-lab">12:00</b><button class="btn small" id="h-dn">-1 时</button>
        </div>
        <button class="btn primary" id="clock-ok">拨动指针</button>
        <div style="display:flex;flex-direction:column;gap:6px;align-items:center">
          <button class="btn small" id="m-up">+5 分</button><b>&nbsp;</b><button class="btn small" id="m-dn">-5 分</button>
        </div>
      </div>`);
    const hh = div.querySelector('#hand-h') as HTMLElement;
    const mm = div.querySelector('#hand-m') as HTMLElement;
    const lab = div.querySelector('#h-lab') as HTMLElement;
    const paint = () => {
      hh.style.transform = `rotate(${(hour % 12) * 30 + min / 2}deg)`;
      mm.style.transform = `rotate(${min * 6}deg)`;
      lab.textContent = `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
    };
    div.querySelector('#h-up')!.addEventListener('click', () => { hour = (hour + 1) % 24; paint(); });
    div.querySelector('#h-dn')!.addEventListener('click', () => { hour = (hour + 23) % 24; paint(); });
    div.querySelector('#m-up')!.addEventListener('click', () => { min = (min + 5) % 60; paint(); });
    div.querySelector('#m-dn')!.addEventListener('click', () => { min = (min + 55) % 60; paint(); });
    div.querySelector('#clock-ok')!.addEventListener('click', () => {
      if (hour === 3 && min === 33) {
        sfx.chime(); this.closeAll(); onDone();
      } else {
        sfx.deny(); this.toast('咔哒。指针归位了——好像不对。', 'info');
        hour = 12; min = 0; paint();
      }
    });
    const closeP = () => { this.closeAll(); onClose?.(); };
    div.querySelector('.closebar button')!.addEventListener('click', () => closeP());
    div.addEventListener('click', (e) => { if (e.target === div) closeP(); });
    paint();
  }

  openKeypad(onDone: (code: string) => boolean, onClose?: () => void) {
    let code = '';
    const div = this.modal(`
      <div class="closebar"><button class="btn small">离开</button></div>
      <h3>🔢 隧道储物间 · 门禁密码</h3>
      <p style="color:var(--sub);font-size:13px;margin:-4px 0 10px">四位数。账本上的纸条说："密码是他生日：____。"（纸条3）</p>
      <div style="display:flex;justify-content:center;gap:10px;margin:8px 0 12px" id="kp-display">
        ${[0, 1, 2, 3].map(i => `<div style="width:44px;height:52px;background:#0c0f14;border:1px solid var(--line);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--amber2)" id="kp-${i}">·</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,64px);gap:8px;justify-content:center">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button class="btn small" data-n="${n}" style="font-size:17px">${n}</button>`).join('')}
        <button class="btn small" id="kp-clear" style="font-size:13px">清空</button>
        <button class="btn primary" id="kp-ok" style="grid-column:span 1;font-size:13px">确认</button>
      </div>`);
    const paint = () => { for (let i = 0; i < 4; i++) (div.querySelector(`#kp-${i}`) as HTMLElement).textContent = code[i] ?? '·'; };
    div.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => {
      if (code.length < 4) { code += (b as HTMLElement).dataset.n; sfx.click(); paint(); }
    }));
    div.querySelector('#kp-clear')!.addEventListener('click', () => { code = ''; paint(); });
    div.querySelector('#kp-ok')!.addEventListener('click', () => {
      if (code.length === 4 && onDone(code)) this.closeAll();
    });
    const closeK = () => { this.closeAll(); onClose?.(); };
    div.querySelector('.closebar button')!.addEventListener('click', () => closeK());
    div.addEventListener('click', (e) => { if (e.target === div) closeK(); });
  }

  openInv(st: RunState, world: World, onUse: (i: number) => void, onClose?: () => void) {
    const defs = st.slots.map((s, i) => {
      if (!s) return `<div class="slot"></div>`;
      const d = ITEMS[s.item];
      const use = d.kind === 'consumable' ? `<button class="btn small use">使用</button>` : '';
      return `<div class="slot"><div class="k">${i + 1}</div><div class="ic">${d.icon}</div>
        <div class="cnt">${d.kind === 'gun' ? s.count : s.count > 1 ? '×' + s.count : ''}</div>
        <div style="font-size:9px;color:var(--sub);position:absolute;bottom:3px;left:6px">${d.name}</div>${use}</div>`;
    }).join('');
    const bags = Object.entries(st.bag).map(([k, v]) => {
      const d = ITEMS[k];
      return `<div class="cell" style="padding:6px 8px"><div class="ic">${d.icon}</div><div class="nm">${d.name} ×${v}</div><div class="ds">¥${d.value}</div></div>`;
    }).join('');
    const div = this.modal(`
      <div class="closebar"><button class="btn small">关闭 (Tab)</button></div>
      <h3>🎒 背包 · 按 1-6 装备/使用</h3>
      <div id="inventory-grid">${defs}</div>
      <div class="bagline">资源袋 <b>${bagCountText(st)} / ${st.bagCap}</b> · 9mm 备弹 <b>${st.ammo}</b> · 任务道具：${st.hasPowercell ? '✅备用电源' : '—'} ${st.keys.flower ? '🗝️' : ''} ${st.keys.pharmacy ? '💊' : ''}</div>
      <div class="grid-items" style="margin-top:10px;grid-template-columns:repeat(auto-fill,minmax(90px,1fr))">${bags || '<div style="color:var(--sub);font-size:13px">资源袋是空的</div>'}</div>
      <p style="color:var(--sub);font-size:12px;margin-top:10px">📌 目标：找到「备用电源」→ 南部撤离点撤离。情报碎片按 Tab 在情报墙查看。</p>`);
    div.querySelectorAll('[data-slot]').forEach(el => (el as HTMLElement).addEventListener('click', () => {
      const i = +(el as HTMLElement).dataset.slot!;
      if (this.onSlotClick) this.onSlotClick(i); else onUse(i);
    }));
    div.querySelectorAll('.use').forEach(b => b.addEventListener('click', () => {
      const slotEl = b.closest('.slot') as HTMLElement;
      onUse(+slotEl.dataset.slot!);
      this.openInv(st, world, onUse);
    }));
    const closeI = () => { this.closeAll(); onClose?.(); };
    div.querySelector('.closebar button')!.addEventListener('click', () => closeI());
  }

  openResult(ok: boolean, lines: string[], onOk: () => void) {
    const div = this.modal(`
      <div class="window" id="result" style="text-align:center">
        <div class="big ${ok ? 'ok' : 'dead'}">${ok ? '✅ 撤离成功' : '☠️ 你倒下了'}</div>
        <div class="sum">${lines.map(l => `<div>${l}</div>`).join('')}</div>
        <button class="btn primary" id="result-ok">回到营地</button>
      </div>`);
    div.querySelector('#result-ok')!.addEventListener('click', () => { sfx.click(); this.closeAll(); onOk(); location.reload(); });
  }

  openTutorial(onDone: () => void) {
    const div = document.createElement('div');
    div.id = 'tutorial'; div.className = 'open';
    div.innerHTML = `<div class="window panel">
      <h3>📖 旧城区生存手册</h3>
      <p>你是拾荒者。城空了，东西还在——进去，带回来。<b>别信钟楼。</b></p>
      <div class="control-grid" style="margin-top:10px">
        <span><kbd>W A S D</kbd>移动</span><span><kbd>Shift</kbd>奔跑</span>
        <span><kbd>鼠标</kbd>瞄准 / 开火</span><span><kbd>E</kbd>交互·撬箱·开门</span>
        <span><kbd>1-6</kbd>切换装备</span><span><kbd>R</kbd>换弹</span>
        <span><kbd>Tab</kbd>背包 / 情报</span><span><kbd>F</kbd>手电（地铁自动开）</span>
      </div>
      <p style="margin-top:12px;color:#d5deea">目标：搜寻 → 收集纸条与日志 → 解锁钟楼谜题 → 拿到<b>备用电源</b> → 南部撤离点撤离。
      死亡会丢失本次战利品，情报永不丢失。</p>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" id="tut-ok">明白了，出发</button></div>
    </div>`;
    document.body.appendChild(div);
    div.querySelector('#tut-ok')!.addEventListener('click', () => { div.remove(); onDone(); });
  }

  openPause(onResume: () => void, onExit: () => void) {
    const div = document.createElement('div');
    div.id = 'pause'; div.className = 'open';
    div.innerHTML = `<div class="window panel">
      <h3 style="color:var(--amber2);text-align:center;margin-bottom:12px">已暂停</h3>
      <button class="btn primary" id="p-res">继续</button>
      <button class="btn" id="p-exit">返回营地</button>
    </div>`;
    document.body.appendChild(div);
    div.querySelector('#p-res')!.addEventListener('click', () => { div.remove(); onResume(); });
    div.querySelector('#p-exit')!.addEventListener('click', () => { div.remove(); onExit(); });
  }
  onDeath() {}
}

function bagCountText(st: RunState): string {
  return String(Object.values(st.bag).reduce((a, b) => a + b, 0));
}
