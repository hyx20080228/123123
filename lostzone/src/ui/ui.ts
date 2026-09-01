// ============ UI v2：吃鸡风选人 / 菜单栏 / HUD / 弹窗 / 情报墙 ============
import { Application, Container, Graphics } from 'pixi.js';
import { CHARS, ITEMS, LORE, UPGRADES, SaveData, fmt, CharDef, Settings } from '../core/defs';
import { RunState, storeSave, loadSettings, storeSettings } from '../game/state';
import { HudApi } from '../game/game';
import { World } from '../world/mapgen';
import { sfx } from '../audio/sfx';
import { createCharSprite, poseChar, CharSprite } from '../render/art';

type StartFn = (charId: string) => void;

// ============================================================
export class Ui implements HudApi {
  private root = document.getElementById('screen-root')!;
  private onStart: StartFn;
  save: SaveData;
  settings: Settings;
  private app: Application | null = null;

  private hudEl!: HTMLElement; private zoneEl!: HTMLElement; private hpFill!: HTMLElement; private arFill!: HTMLElement;
  private hpLab!: HTMLElement; private arLab!: HTMLElement; private hotbarEl!: HTMLElement;
  private promptEl!: HTMLElement; private msgEl!: HTMLElement; private extractEl!: HTMLElement;
  private extractFill!: HTMLElement; private minimapCv!: HTMLCanvasElement;
  private flashEl!: HTMLElement; private buffEl!: HTMLElement;
  private miniBase: HTMLCanvasElement | null = null; private miniFog: HTMLCanvasElement | null = null;
  private lastTick = 0;
  private menuButtonEl: HTMLElement | null = null;

  // ---- 选人预览（Pixi） ----
  private lobbyScene: Container | null = null;
  private previewChar: CharSprite | null = null;
  private previewT = 0;
  private lobbyTick = (t: { deltaMS: number } | number) => {
    const dt = typeof t === 'number' ? t : (t.deltaMS ?? 16.6) / 1000;
    this.previewT += dt;
    if (this.previewChar) {
      poseChar(this.previewChar, this.previewT * 1.6, false, 0.4 + Math.sin(this.previewT * 0.7) * 0.15, 0, false);
      // poseChar 会把 scale.x 重置为 ±1（朝向翻转），此处恢复 4.2 倍放大
      const blink = (this.previewT % 3.4) > 3.25 ? 0.6 : 1;
      this.previewChar.c.scale.set(this.previewChar.c.scale.x * 4.2, 4.2 * blink);
      this.previewChar.c.position.y = Math.sin(this.previewT * 1.4) * 6;
      this.previewChar.c.rotation = Math.sin(this.previewT * 0.4) * 0.04;
    }
  };

  constructor(save: SaveData, onStart: StartFn, app?: Application, settings?: Settings) {
    this.save = save; this.onStart = onStart;
    this.settings = settings ?? loadSettings();
    if (app) this.buildLobbyPixi(app);
    this.buildLobby();
  }

  // ================= 选人界面（Pixi 动态预览） =================
  private buildLobbyPixi(app: Application) {
    this.app = app;
    const scene = new Container();
    scene.zIndex = 0;
    const w = app.screen.width, h = app.screen.height;

    // 黄昏渐变天空（分层色带）
    const sky = new Graphics();
    const bands: [number, number][] = [[0x1c2030, 0.0], [0x2a2436, 0.28], [0x4a2f3a, 0.5], [0x7a4638, 0.72], [0xc4763f, 1.0]];
    for (let i = 0; i < bands.length; i++) {
      const y0 = h * (i / bands.length), y1 = h * ((i + 1) / bands.length);
      sky.rect(0, y0, w, y1 - y0 + 1).fill({ color: bands[i][0], alpha: 0.55 });
    }
    scene.addChild(sky);

    // 城市剪影（两层）
    const city = new Graphics();
    const r1 = 7, r2 = 13, r3 = 29;
    const hx = (i: number) => (i * 173 % 61) / 61;
    for (let i = 0; i < 26; i++) {
      const bw = 34 + ((i * r1) % 40);
      const bx = ((i * 197) % (w + 60)) - 30;
      const bh = 60 + ((i * r2 * 37) % 200);
      city.rect(bx, h - 190 - bh, bw, bh + 190).fill({ color: i % 3 === 0 ? 0x33283c : 0x2b2033, alpha: 0.9 });
      // 窗光
      for (let wy = 0; wy < 4; wy++) for (let wx = 0; wx < 2; wx++) {
        if ((i * 31 + wy * 7 + wx * 13) % 5 > 2) {
          city.rect(bx + 6 + wx * 14, h - 160 - bh + wy * 26, 6, 8).fill({ color: 0xffc476, alpha: 0.55 });
        }
      }
    }
    scene.addChild(city);

    // 地面
    const ground = new Graphics();
    ground.rect(0, h - 170, w, 170).fill(0x1a1521);
    ground.rect(0, h - 170, w, 6).fill({ color: 0xc4763f, alpha: 0.5 });
    scene.addChild(ground);

    // 聚光灯 + 粒子氛围
    const spot = new Graphics();
    spot.poly([w * 0.28, h - 170, w * 0.1, 0, w * 0.5, 0]).fill({ color: 0xffc476, alpha: 0.07 });
    spot.poly([w * 0.72, h - 170, w * 0.55, 0, w * 0.95, 0]).fill({ color: 0xff8a5a, alpha: 0.05 });
    scene.addChild(spot);

    // 角色大立绘占位（由 selectChar 填充）
    this.lobbyScene = scene;
    app.stage.addChild(scene);
    app.ticker.add(this.lobbyTick);
    this.selectPreview(this.save.charId);
  }

  /** 切换选人预览角色 */
  private selectPreview(charId: string) {
    if (!this.lobbyScene || !this.app) return;
    if (this.previewChar) { this.previewChar.c.destroy(); this.previewChar = null; }
    const char = CHARS.find(c => c.id === charId)!;
    const spr = createCharSprite(char);
    spr.c.scale.set(4.2);
    spr.c.position.set(this.app.screen.width * 0.30, this.app.screen.height * 0.66);
    this.lobbyScene.addChild(spr.c);
    this.previewChar = spr;
  }

  // ================= 大厅 HTML =================
  private buildLobby() {
    const s = this.save;
    const cards = CHARS.map(c => {
      const st = c.stats;
      const bar = (v: number) => `<span style="display:inline-block;width:46px;height:5px;border-radius:3px;background:#2c3648;margin:1px 0"><span style="display:block;height:100%;width:${v}%;background:${v > 70 ? '#5fce7a' : v > 45 ? '#f0a13c' : '#e2544a'};border-radius:3px"></span></span>`;
      return `<div class="char-card ${c.id === s.charId ? 'sel' : ''}" data-char="${c.id}">
        <div class="cc-role">${c.role}</div>
        <div class="cc-name">${c.name}</div>
        <div class="cc-sp">${c.species}</div>
        <div class="cc-bars">
          <div class="cc-row"><i>生命</i>${bar(st.hp)}</div>
          <div class="cc-row"><i>速度</i>${bar(st.speed)}</div>
          <div class="cc-row"><i>护甲</i>${bar(st.armor)}</div>
          <div class="cc-row"><i>隐蔽</i>${bar(st.stealth)}</div>
        </div>
        <div class="cc-skill">✦ ${st.skill}</div>
      </div>`;
    }).join('');
    this.root.innerHTML = `
    <div id="lobby">
      <div class="lobby-top">
        <div class="lt-left">
          <h1 class="title">失落区</h1>
          <h2 class="sub">LOST ZONE · 1-4 人 PvPvE 搜打撤</h2>
        </div>
        <div class="lt-right stats">
          <span>旧币 <b>${fmt(s.gold)}</b></span>
          <span>出击 <b>${s.runs}</b></span>
          <span>撤离 <b>${s.extractions}</b></span>
          <span>阵亡 <b>${s.deaths}</b></span>
        </div>
      </div>
      <div class="lobby-bottom">
        <div class="char-row">${cards}</div>
        <div style="display:flex;gap:12px;align-items:center;margin-top:18px">
          <button class="btn primary big" id="btn-go">进入旧城区</button>
          <button class="btn" id="btn-shop">回收站 · 升级</button>
          <button class="btn" id="btn-lore">情报墙 (${s.lore.length}/10)</button>
          <button class="btn" id="btn-help">操作说明</button>
          <button class="btn" id="btn-settings">⚙ 设置</button>
        </div>
        <div class="lobby-hint">选择你的拾荒者 · 在旧城区找回被遗忘的真相</div>
      </div>
    </div>`;
    this.root.querySelectorAll('.char-card').forEach(el => {
      el.addEventListener('click', () => {
        sfx.ensure(); sfx.click();
        const id = (el as HTMLElement).dataset.char!;
        this.save.charId = id;
        storeSave(this.save);
        this.root.querySelectorAll('.char-card').forEach(x => x.classList.remove('sel'));
        el.classList.add('sel');
        this.selectPreview(id);
      });
    });
    this.root.querySelector('#btn-go')!.addEventListener('click', () => { sfx.ensure(); sfx.click(); this.onStart(this.save.charId); });
    this.root.querySelector('#btn-shop')!.addEventListener('click', () => { sfx.ensure(); sfx.click(); this.shop(); });
    this.root.querySelector('#btn-lore')!.addEventListener('click', () => { sfx.ensure(); sfx.click(); this.loreWall(); });
    this.root.querySelector('#btn-help')!.addEventListener('click', () => { sfx.ensure(); sfx.click(); this.helpScreen(); });
    this.root.querySelector('#btn-settings')!.addEventListener('click', () => { sfx.ensure(); sfx.click(); this.settingsScreen(); });
  }

  /** 隐藏大厅并移除 Pixi 预览场景 */
  hideLobby() {
    this.root.querySelector('#lobby')?.remove();
    if (this.app && this.lobbyScene) {
      this.app.stage.removeChild(this.lobbyScene);
      this.lobbyScene.destroy({ children: true });
      this.lobbyScene = null;
      this.previewChar = null;
      this.app.ticker.remove(this.lobbyTick);
    }
  }

  // ================= 加载 / 错误 =================
  showLoading(msg = '正在加载…') {
    let el = document.getElementById('loading-overlay');
    if (!el) {
      el = document.createElement('div');
      el.id = 'loading-overlay';
      el.style.cssText = 'position:fixed;inset:0;z-index:50;display:flex;flex-direction:column;gap:16px;align-items:center;justify-content:center;background:rgba(10,13,18,.88);color:#eef3fa;font-family:var(--font);font-size:16px;letter-spacing:2px';
      el.innerHTML = '<div style="font-size:20px;color:var(--amber2)">失落区 · LOST ZONE</div><div id="loading-msg">…</div><div style="width:180px;height:4px;border-radius:2px;background:#2c3648;overflow:hidden"><div class="loading-bar" style="width:40%;height:100%;background:var(--amber);border-radius:2px;animation:loading-slide 1s infinite linear"></div></div>';
      const st = document.createElement('style');
      st.textContent = '@keyframes loading-slide{0%{transform:translateX(-100%)}100%{transform:translateX(280%)}}';
      el.appendChild(st);
      document.body.appendChild(el);
    }
    const m = el.querySelector('#loading-msg');
    if (m) m.textContent = msg;
    el.style.display = 'flex';
  }
  hideLoading() { document.getElementById('loading-overlay')?.remove(); }

  showError(err: unknown) {
    const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err);
    const div = document.createElement('div');
    div.id = 'error-overlay';
    div.style.cssText = 'position:fixed;inset:0;z-index:99;display:flex;align-items:center;justify-content:center;background:rgba(8,10,14,.92)';
    div.innerHTML = `<div class="window panel" style="width:min(680px,92vw);max-height:86vh;overflow:auto;padding:24px 28px">
      <h2 style="color:#ff8a80;margin-bottom:10px">⚠️ 游戏运行出错</h2>
      <pre style="white-space:pre-wrap;font:12px/1.7 monospace;color:#ffb9b2;background:#1a1214;border:1px solid #5c2623;border-radius:10px;padding:14px;max-height:50vh;overflow:auto">${msg.replace(/</g, '&lt;')}</pre>
      <div style="display:flex;gap:10px;margin-top:16px;justify-content:flex-end">
        <button class="btn" id="err-reload">刷新重试</button>
        <button class="btn primary" id="err-copy">复制错误信息</button>
      </div></div>`;
    document.body.appendChild(div);
    div.querySelector('#err-reload')!.addEventListener('click', () => location.reload());
    div.querySelector('#err-copy')!.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(msg); } catch { /* ignore */ }
    });
  }

  // ================= 屏幕框架 =================
  private screen(id: string, html = ''): HTMLElement {
    const div = document.createElement('div');
    div.className = 'screen open'; div.id = id;
    div.innerHTML = `<div class="window panel"><div class="closebar"><button class="btn small">返回</button></div>${html}</div>`;
    div.querySelector('.closebar button')!.addEventListener('click', () => { sfx.click(); div.remove(); });
    div.addEventListener('click', (e) => { if (e.target === div) div.remove(); });
    this.root.querySelectorAll('.screen.open').forEach(x => x.remove());
    this.root.appendChild(div);
    return div;
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
      <p style="color:var(--sub);font-size:13px;margin:-6px 0 14px">出售战利品换取旧币。旧币 <b style="color:var(--amber2)">${fmt(s.gold)}</b></p>
      <div style="font-size:14px;color:var(--amber2);margin:8px 0 6px">仓库（撤离带回）</div>
      ${itemRows || '<div style="color:var(--sub);font-size:13px">仓库是空的——先撤离一次吧。</div>'}
      <div style="font-size:14px;color:var(--amber2);margin:18px 0 6px">升级</div>
      <div class="grid-items">${ups}</div>`);
    this.root.querySelectorAll('.sell').forEach(b => b.addEventListener('click', () => {
      const k = (b as HTMLElement).dataset.item!;
      const n = s.stash[k] || 0; s.gold += (ITEMS[k]?.value || 0) * n;
      delete s.stash[k]; storeSave(s); sfx.pickup(); this.shop();
    }));
    this.root.querySelectorAll('.up').forEach(b => b.addEventListener('click', () => {
      const id = (b as HTMLElement).dataset.up!;
      const u = UPGRADES.find(x => x.id === id)!;
      const lv = s.upgrades[id] || 0;
      const cost = u.costs[lv];
      if (s.gold >= cost) { s.gold -= cost; s.upgrades[id] = lv + 1; storeSave(s); sfx.unlock(); this.shop(); }
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
      <p style="color:var(--sub);font-size:13px;margin:-6px 0 14px">已收集 ${s.lore.length}/10 · 碎片永不丢失。</p>
      ${cards || '<div style="color:var(--sub);font-size:14px">还没有任何情报。进入旧城区，把纸条、日志和照片带回来。</div>'}
      ${missing.length ? `<div style="color:var(--sub);font-size:12px;margin-top:10px">未发现：${missing.map(m => `${m.tag}·${m.zone.split('·')[0]}`).join(' / ')}</div>` : ''}`);
  }

  // ---------- 操作说明 ----------
  private helpScreen() {
    this.screen('help', `
      <h2>🎮 操作说明</h2>
      <div class="control-grid">
        <span><kbd>W A S D</kbd>移动</span><span><kbd>Shift</kbd>奔跑</span>
        <span><kbd>鼠标</kbd>瞄准 / 攻击</span><span><kbd>E</kbd>交互·拾取·开门</span>
        <span><kbd>1-6</kbd>切换装备</span><span><kbd>R</kbd>换弹</span>
        <span><kbd>Tab</kbd>背包 / 情报</span><span><kbd>F</kbd>手电筒</span>
        <span><kbd>Esc</kbd>暂停 / 菜单</span><span><kbd>左键</kbd>近战挥砍 / 射击</span>
      </div>
      <h3 style="margin-top:16px;color:var(--amber2)">📖 玩法目标</h3>
      <p style="color:#d5deea;font-size:13.5px;line-height:2">进入旧城区 → 搜集纸条/日志（信息）→ 解开密码/谜题（决策）→ 遭遇锈犬与敌潮（风险）→ 拿到备用电源撤离（奖励）→ 回营升级再出发。<br>死亡会丢失本次战利品，情报永不丢失。<b>别信钟楼。</b></p>`);
  }

  // ---------- 设置 ----------
  private settingsScreen(onChange?: (k: string, v: number | boolean) => void) {
    const s = this.settings;
    const div = this.screen('settings', `
      <h2>⚙ 设置</h2>
      <div style="display:flex;flex-direction:column;gap:14px;max-width:420px">
        <div><div style="margin-bottom:6px;color:var(--sub);font-size:13px">音量 <b id="vol-lab">${Math.round(s.volume * 100)}%</b></div>
          <input type="range" min="0" max="1" step="0.05" value="${s.volume}" id="set-vol" style="width:100%"></div>
        <label class="set-row"><span>画面光影效果</span><input type="checkbox" id="set-light" ${s.lightFx ? 'checked' : ''}></label>
        <label class="set-row"><span>屏幕震动</span><input type="checkbox" id="set-shake" ${s.shake ? 'checked' : ''}></label>
      </div>`);
    div.querySelector('#set-vol')!.addEventListener('input', (e) => {
      const v = +(e.target as HTMLInputElement).value;
      this.settings.volume = v; storeSettings(this.settings);
      (div.querySelector('#vol-lab') as HTMLElement).textContent = `${Math.round(v * 100)}%`;
      sfx.setVolume(v);
      onChange?.('volume', v);
    });
    div.querySelector('#set-light')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      this.settings.lightFx = v; storeSettings(this.settings); onChange?.('lightFx', v);
    });
    div.querySelector('#set-shake')!.addEventListener('change', (e) => {
      const v = (e.target as HTMLInputElement).checked;
      this.settings.shake = v; storeSettings(this.settings); onChange?.('shake', v);
    });
  }

  // ================= 对局 HUD =================
  buildHud(app: any, world: World) {
    this.app = app;
    const el = document.createElement('div');
    el.id = 'hud'; el.innerHTML = `
      <div class="top-left">
        <div class="zone" id="hud-zone">旧城区</div>
        <div class="bars">
          <div class="bar hp"><div class="fill" id="hud-hp"></div><div class="lab" id="hud-hp-lab"></div></div>
          <div class="bar ar"><div class="fill" id="hud-ar"></div><div class="lab" id="hud-ar-lab"></div></div>
        </div>
        <div id="buff" style="display:none"></div>
      </div>
      <button class="menu-btn" id="hud-menu">☰ 菜单</button>
      <canvas id="minimap" width="212" height="212"></canvas>
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
    this.menuButtonEl = el.querySelector('#hud-menu')!;
    this.menuButtonEl.addEventListener('click', () => { sfx.click(); this.onMenuClick?.(); });
    this.buildMiniBase(world);
  }
  onMenuClick: (() => void) | null = null;
  flashMenuButton() { if (this.menuButtonEl) this.menuButtonEl.style.animation = 'menuPulse 1.2s ease 3'; }

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
      (el as HTMLElement).addEventListener('click', () => this.onSlotClick?.(+(el as HTMLElement).dataset.slot!));
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
  private buildMiniBase(world: World) {
    const cv = document.createElement('canvas'); cv.width = 96 * 3; cv.height = 96 * 3;
    const ctx = cv.getContext('2d')!;
    const g = new Map<number, string>([
      [0, '#55703f'], [1, '#59636f'], [2, '#b3a88f'], [3, '#333a44'],
      [10, '#c8a06a'], [12, '#cfe0e4'], [14, '#8f9287'], [16, '#2f5a66'], [18, '#6a5a72'], [20, '#7a6a52'], [22, '#b09a6a'],
    ]);
    const zoneCol: Record<string, string> = { '1': '#e8b25a', '2': '#d8e2e4', '3': '#c05a32', '4': '#26505e', '5': '#c4634a', '6': '#6a3d72', '7': '#59c46a', '8': '#9a856a' };
    for (let y = 0; y < 96; y++) for (let x = 0; x < 96; x++) {
      const id = world.grid.cells[y * 96 + x];
      const z = world.zoneId[y * 96 + x];
      const solid = id === 11 || id === 13 || id === 15 || id === 17 || id === 19 || id === 21;
      const c = solid ? '#2c3038' : z !== 0 ? (zoneCol[String(z)] || '#55703f') : (g.get(id) || '#55703f');
      ctx.fillStyle = c;
      ctx.fillRect(x * 3, y * 3, 3, 3);
    }
    this.miniBase = cv;
    this.miniFog = document.createElement('canvas');
    this.miniFog.width = 96 * 3; this.miniFog.height = 96 * 3;
    const fctx = this.miniFog.getContext('2d')!;
    fctx.fillStyle = 'rgba(8,10,14,0.82)'; fctx.fillRect(0, 0, 96 * 3, 96 * 3);
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
      ctx.fillStyle = '#59c46a';
      ctx.beginPath(); ctx.arc(48 / 96 * 212, 88.5 / 96 * 212, 3, 0, 7); ctx.fill();
      ctx.font = '9px sans-serif'; ctx.fillText('撤离', 48 / 96 * 212 + 5, 88.5 / 96 * 212 + 3);
      ctx.save();
      ctx.translate(mx, my); ctx.rotate(p.aim);
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -4); ctx.lineTo(-2, 0); ctx.lineTo(-4, 4); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  // ================= 弹窗 =================
  private modal(html: string): HTMLElement {
    const div = document.createElement('div');
    div.id = 'modal'; div.className = 'open';
    div.innerHTML = `<div class="window panel">${html}</div>`;
    document.body.appendChild(div);
    return div;
  }
  closeAll() {
    document.querySelectorAll('#modal, .screen.open, #pause.open').forEach(el => el.remove());
  }

  openLore(loreId: string, onClose?: () => void) {
    const l = LORE[loreId]; if (!l) return;
    const close = () => { this.closeAll(); onClose?.(); };
    const div = this.modal(`
      <div class="closebar"><button class="btn small">关闭</button></div>
      <h3>${l.zone}</h3>
      <div class="paper"><div class="head">${l.title}</div>${l.body}</div>
      <p style="color:var(--violet);font-size:12.5px;margin-top:10px">→ ${l.hint}</p>`);
    div.querySelector('.closebar button')!.addEventListener('click', () => close());
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
      if (hour === 3 && min === 33) { sfx.chime(); this.closeAll(); onDone(); }
      else { sfx.deny(); this.toast('咔哒。指针归位了——好像不对。', 'info'); hour = 12; min = 0; paint(); }
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
      <div style="display:flex;justify-content:center;gap:10px;margin:8px 0 12px">
        ${[0, 1, 2, 3].map(i => `<div style="width:44px;height:52px;background:#0c0f14;border:1px solid var(--line);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--amber2)" id="kp-${i}">·</div>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,64px);gap:8px;justify-content:center">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(n => `<button class="btn small" data-n="${n}" style="font-size:17px">${n}</button>`).join('')}
        <button class="btn small" id="kp-clear" style="font-size:13px">清空</button>
        <button class="btn primary" id="kp-ok" style="font-size:13px">确认</button>
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
      <div class="bagline">资源袋 <b>${Object.values(st.bag).reduce((a, b) => a + b, 0)} / ${st.bagCap}</b> · 备弹 <b>${st.ammo}</b> · 任务：${st.hasPowercell ? '✅备用电源' : '—'} ${st.keys.flower ? '🗝️' : ''} ${st.keys.pharmacy ? '💊' : ''}</div>
      <div class="grid-items" style="margin-top:10px;grid-template-columns:repeat(auto-fill,minmax(90px,1fr))">${bags || '<div style="color:var(--sub);font-size:13px">资源袋是空的</div>'}</div>`);
    div.querySelectorAll('[data-slot]').forEach(el => (el as HTMLElement).addEventListener('click', () => {
      const i = +(el as HTMLElement).dataset.slot!;
      if (this.onSlotClick) this.onSlotClick(i);
    }));
    div.querySelectorAll('.use').forEach(b => b.addEventListener('click', () => {
      const slotEl = b.closest('.slot') as HTMLElement;
      onUse(+slotEl.dataset.slot!);
      this.openInv(st, world, onUse, onClose);
    }));
    const closeI = () => { this.closeAll(); onClose?.(); };
    div.querySelector('.closebar button')!.addEventListener('click', () => closeI());
  }

  openResult(ok: boolean, lines: string[], onOk: () => void) {
    const div = this.modal(`
      <div class="window" id="result" style="text-align:center">
        <div class="big ${ok ? 'ok' : 'dead'}">${ok ? '✅ 撤离成功' : '☠️ 你倒下了'}</div>
        <div class="sum">${lines.map(l => `<div>${l}</div>`).join('')}</div>
        <button class="btn primary big" id="result-ok">回到营地</button>
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
        <span><kbd>鼠标</kbd>瞄准 / 开火</span><span><kbd>左键</kbd>近战挥砍</span>
        <span><kbd>E</kbd>交互·撬箱·开门</span><span><kbd>1-6</kbd>切换装备</span>
        <span><kbd>R</kbd>换弹</span><span><kbd>Tab</kbd>背包 / 情报</span>
        <span><kbd>F</kbd>手电</span><span><kbd>Esc</kbd>菜单</span>
      </div>
      <p style="margin-top:12px;color:#d5deea">目标：搜寻 → 收集纸条与日志 → 解锁钟楼谜题 → 拿到<b>备用电源</b> → 南部撤离点撤离。死亡会丢失本次战利品，情报永不丢失。</p>
      <div style="display:flex;justify-content:flex-end;margin-top:14px"><button class="btn primary" id="tut-ok">明白了，出发</button></div>
    </div>`;
    document.body.appendChild(div);
    div.querySelector('#tut-ok')!.addEventListener('click', () => { div.remove(); onDone(); });
  }

  // ---------- 菜单（☰） ----------
  openMenu(onResume: () => void, onExit: () => void, onSettings: (k: string, v: number | boolean) => void) {
    const div = document.createElement('div');
    div.id = 'pause'; div.className = 'open';
    div.innerHTML = `<div class="window panel menu-win">
      <h3 style="color:var(--amber2);text-align:center;margin-bottom:14px">菜单</h3>
      <button class="btn primary" id="p-res">▶ 继续游戏</button>
      <button class="btn" id="p-help">🎮 操作说明</button>
      <button class="btn" id="p-lore">🗂️ 情报墙（${this.save.lore.length}/10）</button>
      <button class="btn" id="p-settings">⚙ 设置</button>
      <button class="btn danger" id="p-exit">⌂ 返回营地</button>
    </div>`;
    document.body.appendChild(div);
    div.querySelector('#p-res')!.addEventListener('click', () => { div.remove(); onResume(); });
    div.querySelector('#p-help')!.addEventListener('click', () => { div.remove(); this.helpScreen(); });
    div.querySelector('#p-lore')!.addEventListener('click', () => { div.remove(); this.loreWall(); });
    div.querySelector('#p-settings')!.addEventListener('click', () => { div.remove(); this.settingsScreen(onSettings); });
    div.querySelector('#p-exit')!.addEventListener('click', () => { div.remove(); onExit(); });
  }
  openPause(onResume: () => void, onExit: () => void) { this.openMenu(onResume, onExit, () => {}); }

  onDeath() {}
}
