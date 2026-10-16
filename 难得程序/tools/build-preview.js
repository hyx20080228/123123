/**
 * 难得民谣 · 网页预览构建器
 *
 * 作用：把 miniprogram/ 里真实的 WXML + WXSS + 页面 JS 渲染成静态网页，
 *      没装微信开发者工具也能在浏览器里看界面长什么样。
 * 注意：它是「看样子」用的，真机行为以微信开发者工具为准。
 *
 * 用法：cd 难得程序/tools && npm install && npm run preview
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MP = path.join(ROOT, 'miniprogram');
const OUT = path.join(ROOT, 'preview');
const RPX = 375 / 750; // 以 iPhone 375pt 宽度折算

/* ============ 1. 微信环境的替身（够渲染用就行） ============ */

const storage = {};

function makeWx() {
  const noop = () => {};
  return {
    getStorageSync: (k) => (k in storage ? storage[k] : ''),
    setStorageSync: (k, v) => { storage[k] = v; },
    removeStorageSync: (k) => { delete storage[k]; },
    showToast: noop, hideToast: noop, showLoading: noop, hideLoading: noop,
    showModal: noop, showActionSheet: noop,
    navigateTo: noop, redirectTo: noop, switchTab: noop, navigateBack: noop, reLaunch: noop,
    makePhoneCall: noop, openLocation: noop, setClipboardData: noop,
    stopPullDownRefresh: noop, startPullDownRefresh: noop,
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 812, statusBarHeight: 44, platform: 'devtools' }),
    createSelectorQuery: () => ({ select: () => ({ boundingClientRect: () => ({ exec: noop }) }) }),
    cloud: null,
  };
}

let appInstance = null;
global.wx = makeWx();
global.App = (opts) => {
  appInstance = Object.assign({ globalData: {} }, opts);
  if (appInstance.onLaunch) appInstance.onLaunch();
};
global.getApp = () => appInstance;

function setByPath(obj, pathStr, value) {
  const keys = pathStr.replace(/\[(\d+)\]/g, '.$1').split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur[keys[i]] === undefined) cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function runPage(file, query) {
  let captured = null;
  global.Page = (opts) => { captured = opts; };
  global.Component = (opts) => { captured = opts; };
  delete require.cache[require.resolve(file)];
  require(file);
  if (!captured) throw new Error('页面没有调用 Page()：' + file);

  const inst = Object.assign({}, captured);
  inst.data = JSON.parse(JSON.stringify(captured.data || {}));
  inst.setData = function (patch, cb) {
    Object.keys(patch || {}).forEach((k) => setByPath(inst.data, k, patch[k]));
    if (cb) cb();
  };
  if (inst.onLoad) inst.onLoad(query || {});
  if (inst.onShow) inst.onShow();
  // 等 mock 接口的 Promise 跑完
  for (let i = 0; i < 24; i++) await sleep(25);
  return inst.data;
}

/* ============ 2. WXML 解析 ============ */

function parseWxml(src) {
  const root = { children: [] };
  const stack = [root];
  const tagRe = /<!--[\s\S]*?-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:\s+[^\s/>"'=]+(?:=(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>/g;
  let last = 0;
  let m;
  while ((m = tagRe.exec(src))) {
    if (m.index > last) {
      const text = src.slice(last, m.index);
      if (text.trim()) stack[stack.length - 1].children.push({ type: 'text', text });
    }
    last = tagRe.lastIndex;
    if (m[0].startsWith('<!--')) continue;
    if (m[1]) { // 闭合
      if (stack.length > 1) stack.pop();
      continue;
    }
    const node = { type: 'el', tag: m[2], attrs: parseAttrs(m[3] || ''), children: [] };
    stack[stack.length - 1].children.push(node);
    const selfClose = m[4] === '/' || ['image', 'input', 'br', 'icon'].indexOf(node.tag) > -1;
    if (!selfClose) stack.push(node);
  }
  if (last < src.length) {
    const text = src.slice(last);
    if (text.trim()) stack[stack.length - 1].children.push({ type: 'text', text });
  }
  return root.children;
}

function parseAttrs(str) {
  const attrs = {};
  const re = /([^\s/>"'=]+)(?:=(?:"([^"]*)"|'([^']*)'))?/g;
  let m;
  while ((m = re.exec(str))) {
    attrs[m[1]] = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : '';
  }
  return attrs;
}

/* ============ 3. 表达式求值 ============ */

const fnCache = new Map();
function evalExpr(expr, scope) {
  try {
    if (!fnCache.has(expr)) {
      fnCache.set(expr, new Function('$s', 'with($s){ return (' + expr + ') }'));
    }
    return fnCache.get(expr)(scope);
  } catch (e) {
    return '';
  }
}

function interpolate(str, scope) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/\{\{([\s\S]*?)\}\}/g, (_, expr) => {
    const v = evalExpr(expr.trim(), scope);
    return v === undefined || v === null || v === false ? '' : String(v);
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============ 4. 渲染 ============ */

const TAG_MAP = {
  view: 'div', 'scroll-view': 'div', 'cover-view': 'div', 'movable-view': 'div',
  text: 'span', image: 'img', input: 'input', textarea: 'textarea',
  button: 'button', navigator: 'a', form: 'form', label: 'label', swiper: 'div', 'swiper-item': 'div',
};

function renderNodes(nodes, scope) {
  let out = '';
  let cond = null;
  for (const node of nodes) {
    if (node.type === 'text') { out += interpolate(node.text, scope); continue; }
    const a = node.attrs;

    if ('wx:if' in a) { cond = !!evalExpr(stripBraces(a['wx:if']), scope); if (!cond) continue; }
    else if ('wx:elif' in a) { if (cond) continue; cond = !!evalExpr(stripBraces(a['wx:elif']), scope); if (!cond) continue; }
    else if ('wx:else' in a) { if (cond) continue; cond = true; }
    else cond = null;

    if ('wx:for' in a) {
      const list = evalExpr(stripBraces(a['wx:for']), scope) || [];
      const itemKey = a['wx:for-item'] || 'item';
      const idxKey = a['wx:for-index'] || 'index';
      const arr = Array.isArray(list) ? list : [];
      arr.forEach((it, i) => {
        const sub = Object.assign({}, scope);
        sub[itemKey] = it;
        sub[idxKey] = i;
        out += renderEl(node, sub);
      });
      continue;
    }
    out += renderEl(node, scope);
  }
  return out;
}

function stripBraces(v) {
  const m = String(v).trim().match(/^\{\{([\s\S]*)\}\}$/);
  return m ? m[1].trim() : JSON.stringify(v);
}

function renderEl(node, scope) {
  const a = node.attrs;
  const inner = renderNodes(node.children, scope);
  if (node.tag === 'block' || node.tag === 'template') return inner;

  const tag = TAG_MAP[node.tag] || 'div';
  const parts = [];
  const cls = [('wx-' + node.tag)];
  if (a.class) cls.push(interpolate(a.class, scope).trim());
  parts.push(`class="${escapeHtml(cls.join(' ').replace(/\s+/g, ' ').trim())}"`);
  if (a.style) parts.push(`style="${escapeHtml(interpolate(a.style, scope))}"`);

  if (node.tag === 'image') {
    let src = interpolate(a.src, scope);
    if (src.startsWith('/')) src = src.slice(1);
    parts.push(`src="${escapeHtml(src)}"`);
    const mode = a.mode || 'scaleToFill';
    const fit = mode.indexOf('aspectFill') > -1 ? 'cover' : mode.indexOf('aspectFit') > -1 ? 'contain' : 'fill';
    parts.push(`style="object-fit:${fit};${a.style ? escapeHtml(interpolate(a.style, scope)) : ''}"`);
    return `<img ${parts.join(' ')} alt="" />`;
  }
  if (node.tag === 'input') {
    const val = interpolate(a.value, scope);
    const ph = interpolate(a.placeholder, scope);
    parts.push(`value="${escapeHtml(val)}"`);
    parts.push(`placeholder="${escapeHtml(ph)}"`);
    if ('password' in a) parts.push('type="password"');
    return `<input ${parts.join(' ')} />`;
  }
  if (node.tag === 'textarea') {
    const val = interpolate(a.value, scope);
    parts.push(`placeholder="${escapeHtml(interpolate(a.placeholder, scope))}"`);
    return `<textarea ${parts.join(' ')}>${escapeHtml(val)}</textarea>`;
  }
  if (node.tag === 'scroll-view') {
    const dir = 'scroll-x' in a ? 'overflow-x:auto;overflow-y:hidden;white-space:nowrap;' : 'overflow-y:auto;';
    parts.push(`data-scroll="1"`);
    parts[1] = `style="${dir}${a.style ? escapeHtml(interpolate(a.style, scope)) : ''}"`;
  }
  return `<${tag} ${parts.join(' ')}>${inner}</${tag}>`;
}

/* ============ 5. WXSS -> CSS ============ */

function wxss2css(src, scopeSel) {
  let css = src
    .replace(/@import\s+["'][^"']+["'];/g, '')
    .replace(/([\d.]+)rpx/g, (_, n) => (parseFloat(n) * RPX).toFixed(2) + 'px');
  // page 选择器 -> 手机屏幕容器
  css = css.replace(/(^|[}\s])page\b/g, '$1' + scopeSel);
  return css;
}

/* ============ 6. 页面外壳 ============ */

const appJson = JSON.parse(fs.readFileSync(path.join(MP, 'app.json'), 'utf8'));
const tabList = appJson.tabBar.list;

function tabBarHtml(pagePath) {
  const items = tabList
    .map((t) => {
      const on = t.pagePath === pagePath;
      const icon = on ? t.selectedIconPath : t.iconPath;
      const color = on ? appJson.tabBar.selectedColor : appJson.tabBar.color;
      return `<div class="pv-tab"><img src="${icon}" /><span style="color:${color}">${t.text}</span></div>`;
    })
    .join('');
  return `<div class="pv-tabbar" style="background:${appJson.tabBar.backgroundColor}">${items}</div>`;
}

function shell({ title, body, css, isTab, pagePath }) {
  return `<!DOCTYPE html>
<html lang="zh-CN"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=375,initial-scale=1" />
<title>${title}</title>
<style>
html,body{margin:0;padding:0;width:375px;}
body{font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue','Microsoft YaHei',sans-serif;}
.pv-screen{width:375px;min-height:812px;position:relative;display:flex;flex-direction:column;background:#F6EFE3;}
.pv-statusbar{height:44px;display:flex;align-items:center;justify-content:space-between;padding:0 16px 0 24px;font-size:13px;font-weight:600;color:#2A241F;flex:none;}
.pv-nav{height:44px;display:flex;align-items:center;justify-content:center;position:relative;flex:none;background:${appJson.window.navigationBarBackgroundColor};}
.pv-nav__title{font-size:16px;font-weight:600;letter-spacing:1px;color:#2A241F;font-family:'Songti SC',serif;}
.pv-nav__back{position:absolute;left:14px;font-size:17px;color:#2A241F;}
.pv-nav__capsule{position:absolute;right:10px;width:76px;height:28px;border:1px solid rgba(42,36,31,.18);border-radius:14px;display:flex;align-items:center;justify-content:space-around;font-size:13px;color:#2A241F;background:rgba(255,255,255,.35);}
.pv-body{flex:1;overflow:auto;}
.pv-tabbar{height:54px;display:flex;align-items:center;border-top:1px solid #E0D2BA;flex:none;padding-bottom:6px;padding-top:4px;}
.pv-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;}
.pv-tab img{width:22px;height:22px;}
.pv-tab span{font-size:10px;letter-spacing:.5px;}
img{display:block;}
input,textarea{border:none;background:transparent;outline:none;font-family:inherit;}
.wx-text{display:inline;}
a{text-decoration:none;color:inherit;}
${css}
</style></head>
<body>
<div class="pv-screen">
  <div class="pv-statusbar"><span>20:36</span><span>●●●　令　■</span></div>
  <div class="pv-nav">
    ${isTab ? '' : '<span class="pv-nav__back">‹</span>'}
    <span class="pv-nav__title">${title}</span>
    <span class="pv-nav__capsule"><span>···</span><span>◉</span></span>
  </div>
  <div class="pv-body wxpage">${body}</div>
  ${isTab ? tabBarHtml(pagePath) : ''}
</div>
</body></html>`;
}

/* ============ 7. 造点样例数据，让预览不空 ============ */

const util = require(path.join(MP, 'utils', 'util.js'));

function seedOrders() {
  const today = util.todayYmd();
  const t = util.nextDays(4);
  return [
    {
      id: 'demo1', code: 'ND-' + today.replace(/-/g, '').slice(4) + '-07', status: 'confirmed',
      createdAt: Date.now() - 3600 * 1000 * 5,
      date: today, dateLabel: '今天', slot: '20:30', people: 2,
      tableId: 'B1', tableName: 'B1', zoneId: 'B', zoneName: '中庭散台', minSpend: 188, seats: 2,
      name: '小周', phone: '13812345678', remark: '想点歌；第一次来',
    },
    {
      id: 'demo2', code: 'ND-' + t[2].replace(/-/g, '').slice(4) + '-03', status: 'pending',
      createdAt: Date.now() - 3600 * 1000 * 26,
      date: t[2], dateLabel: '后天', slot: '21:00', people: 4,
      tableId: 'A4', tableName: 'A4', zoneId: 'A', zoneName: '临窗卡座', minSpend: 346, seats: 6,
      name: '李先生', phone: '13900001111', remark: '过生日，能不能帮忙唱一首',
    },
    {
      id: 'demo3', code: 'ND-0921-11', status: 'done',
      createdAt: Date.now() - 86400 * 1000 * 12,
      date: '2026-09-21', dateLabel: '', slot: '19:30', people: 3,
      tableId: 'C4', tableName: 'C4', zoneId: 'C', zoneName: '吧台高位', minSpend: 88, seats: 2,
      name: '小周', phone: '13812345678', remark: '',
    },
  ];
}

/* ============ 8. 跑起来 ============ */

const PAGES = [
  { path: 'pages/index/index', title: '难得民谣', caption: '首页 · 招牌与今晚', tab: true },
  { path: 'pages/reserve/reserve', title: '订一张桌子', caption: '订桌 · 日子/时段/人数/桌位图' },
  { path: 'pages/confirm/confirm', title: '确认订座', caption: '确认 · 票根摘要与留言' },
  { path: 'pages/order-detail/order-detail', title: '订座凭条', caption: '凭条 · 到店出示', query: { id: 'demo1' } },
  { path: 'pages/orders/orders', title: '我的预约', caption: '我的预约 · 列表', tab: true },
  { path: 'pages/shows/shows', title: '这周唱什么', caption: '演出 · 两周歌单', tab: true },
  { path: 'pages/mine/mine', title: '我的', caption: '我的 · 名片与路线图', tab: true },
  { path: 'pages/staff/staff', title: '店员模式', caption: '店员 · 吧台看今日订桌' },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // 拷贝素材
  copyDir(path.join(MP, 'assets'), path.join(OUT, 'assets'));

  // 预埋示例数据
  storage['nd_orders_v2'] = seedOrders();
  storage['nd_profile_v1'] = { name: '小周', phone: '13812345678' };

  // app.js 要先跑，getApp() 才有东西
  delete require.cache[require.resolve(path.join(MP, 'app.js'))];
  require(path.join(MP, 'app.js'));
  // 预约流程的草稿（确认页需要）
  appInstance.globalData.draft = {
    date: util.todayYmd(), dateLabel: util.dateMeta(util.todayYmd()).month + '月' + util.dateMeta(util.todayYmd()).day + '日 ' + util.dateMeta(util.todayYmd()).week,
    slot: '20:30', people: 2, tableId: 'B3', tableName: 'B3', zoneId: 'B', zoneName: '中庭散台', minSpend: 188, seats: 4,
  };
  appInstance.globalData.staffUnlocked = true;

  const appWxss = wxss2css(fs.readFileSync(path.join(MP, 'app.wxss'), 'utf8'), '.wxpage');
  const built = [];

  for (const p of PAGES) {
    const dir = path.join(MP, p.path.split('/').slice(0, -1).join('/'));
    const name = p.path.split('/').pop();
    const data = await runPage(path.join(dir, name + '.js'), p.query);
    const nodes = parseWxml(fs.readFileSync(path.join(dir, name + '.wxml'), 'utf8'));
    const body = renderNodes(nodes, Object.assign({}, data));
    const pageCss = fs.existsSync(path.join(dir, name + '.wxss'))
      ? wxss2css(fs.readFileSync(path.join(dir, name + '.wxss'), 'utf8'), '.wxpage')
      : '';
    const file = p.path.replace(/\//g, '_') + '.html';
    fs.writeFileSync(
      path.join(OUT, file),
      shell({ title: p.title, body, css: appWxss + '\n' + pageCss, isTab: !!p.tab, pagePath: p.path })
    );
    built.push(Object.assign({ file }, p));
    console.log('  ✓', p.path, '->', file);
  }

  fs.writeFileSync(path.join(OUT, 'index.html'), gallery(built));
  console.log('预览生成完毕 ->', OUT);
}

function gallery(pages) {
  const cards = pages
    .map(
      (p) => `<div class="g-item">
      <div class="g-phone"><iframe src="${p.file}" loading="lazy"></iframe></div>
      <div class="g-cap">${p.caption}</div>
      <a class="g-link" href="${p.file}" target="_blank">单独打开 ›</a>
    </div>`
    )
    .join('');
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>难得民谣 · 小程序界面预览</title>
<style>
body{margin:0;background:#EFE5D5;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Microsoft YaHei',sans-serif;color:#2A241F;
background-image:radial-gradient(rgba(122,96,58,.06) 1px,transparent 1px);background-size:7px 7px;}
header{padding:48px 32px 10px;text-align:center;}
h1{font-family:'Songti SC','STSong',serif;font-size:34px;letter-spacing:8px;margin:0 0 6px;}
.sub{color:#8A7B68;font-size:13px;letter-spacing:2px;}
.note{max-width:760px;margin:22px auto 0;font-size:13px;line-height:1.9;color:#6B6056;background:#FBF6EC;border:1px solid #E0D2BA;border-radius:8px;padding:16px 22px;text-align:left;}
.wrap{display:flex;flex-wrap:wrap;gap:34px;justify-content:center;padding:40px 24px 80px;}
.g-item{width:375px;}
.g-phone{width:375px;height:812px;border:10px solid #2A241F;border-radius:38px;overflow:hidden;box-shadow:0 18px 40px rgba(42,36,31,.22);background:#F6EFE3;}
iframe{width:375px;height:792px;border:0;display:block;}
.g-cap{text-align:center;margin-top:14px;font-size:14px;letter-spacing:2px;font-family:'Songti SC',serif;}
.g-link{display:block;text-align:center;font-size:12px;color:#C2743A;margin-top:4px;text-decoration:none;}
footer{text-align:center;padding:0 0 60px;color:#9C8B74;font-size:12px;letter-spacing:3px;}
</style></head>
<body>
<header>
  <h1>难得民谣</h1>
  <div class="sub">NANDE FOLK · 订座小程序 一期界面预览</div>
  <div class="note">
    这一页是用脚本把小程序真实的 WXML / WXSS / 页面 JS 渲染出来的静态快照，改了代码重新跑
    <code>npm run preview</code> 就会同步更新。<br />
    它只用来看样子：点击、滑动、下单这些交互请在微信开发者工具里体验（导入 <code>难得程序/</code> 目录即可）。
  </div>
</header>
<div class="wrap">${cards}</div>
<footer>难得今宵，难得你来</footer>
</body></html>`;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f);
    const d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
