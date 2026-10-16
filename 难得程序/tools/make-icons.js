/**
 * 难得民谣 · 图标生成脚本
 * 手写 SVG 线稿 -> PNG（小程序 tabBar 只认位图，所以统一转 PNG）
 * 用法：cd 难得程序/tools && npm install && npm run icons
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT = path.join(__dirname, '..', 'miniprogram', 'assets', 'icons');
fs.mkdirSync(OUT, { recursive: true });

// 线稿统一 24x24 画布，描边风格，像手绘速写
const P = {
  // 一间亮着灯的小屋（首页）
  home: `<path d="M3.2 10.8 12 3.6l8.8 7.2"/><path d="M5.2 9.6V20a.8.8 0 0 0 .8.8h12a.8.8 0 0 0 .8-.8V9.6"/><path d="M10 20.6v-5.2h4v5.2"/><path d="M11 7.4h2"/>`,
  // 老式麦克风（演出）
  mic: `<rect x="9.2" y="2.6" width="5.6" height="9.6" rx="2.8"/><path d="M6 10.4a6 6 0 0 0 12 0"/><path d="M12 16.6v4.8"/><path d="M8.6 21.4h6.8"/><path d="M10.4 5.6h3.2M10.4 7.6h3.2"/>`,
  // 票根（我的预约）
  ticket: `<path d="M3 7.2h18v3a1.8 1.8 0 0 0 0 3.6v3H3v-3a1.8 1.8 0 0 0 0-3.6z"/><path d="M9.4 7.6v1.6M9.4 11.2v1.6M9.4 14.8v1.6"/><path d="M12.6 11.4h5.2M12.6 14.2h3.2"/>`,
  // 酒杯（我的）
  cup: `<path d="M7 3.4h10l-1.1 4.2a4.2 4.2 0 0 1-3.9 3v6"/><path d="M12 16.6a4.2 4.2 0 0 1-3.9-3L7 9.4"/><path d="M8.2 20.6h7.6"/><path d="M12 16.6v4"/><path d="M7.7 6.2h8.6"/>`,
  // 木吉他（琴身 + 琴颈 + 琴头）
  guitar: `<path d="M12 8.6c2.5 0 3.9 1.5 3.9 3.1 0 1-.7 1.8-.7 2.8 0 1.3 1.5 2 1.5 4 0 2.5-2.1 4.3-4.7 4.3s-4.7-1.8-4.7-4.3c0-2 1.5-2.7 1.5-4 0-1-.7-1.8-.7-2.8 0-1.6 1.4-3.1 3.9-3.1z"/><circle cx="12" cy="15.6" r="1.6"/><path d="M12 8.6V3.6"/><path d="M10.4 1.6h3.2v2h-3.2z"/>`,
  // 月亮（今晚）
  moon: `<path d="M20 14.4A8.4 8.4 0 1 1 9.6 4a6.9 6.9 0 0 0 10.4 10.4z"/><path d="M17.6 4.6l.5 1.4 1.4.5-1.4.5-.5 1.4-.5-1.4-1.4-.5 1.4-.5z"/>`,
  // 定位
  location: `<path d="M12 21.2s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10.1" r="2.6"/>`,
  // 电话
  phone: `<path d="M7.4 3.4 9.8 3l2 4.2-2 1.6a11 11 0 0 0 5.4 5.4l1.6-2 4.2 2-.4 2.4a2 2 0 0 1-2.2 1.7C12.6 17.6 6.4 11.4 5.7 5.6a2 2 0 0 1 1.7-2.2z"/>`,
  // 时钟
  clock: `<circle cx="12" cy="12" r="8.6"/><path d="M12 6.8V12l3.4 2.2"/>`,
  // 人数
  people: `<circle cx="9" cy="8.4" r="3.2"/><path d="M3.4 20c0-3.4 2.5-5.6 5.6-5.6s5.6 2.2 5.6 5.6"/><path d="M16 5.6a3.2 3.2 0 0 1 0 6.1"/><path d="M17.2 14.8c2.1.6 3.4 2.5 3.4 5.2"/>`,
  // 日历
  calendar: `<rect x="3.4" y="5.2" width="17.2" height="15.4" rx="2"/><path d="M3.4 10h17.2"/><path d="M8 3.4v3.6M16 3.4v3.6"/><path d="M7.6 13.6h2.6M13.8 13.6h2.6M7.6 17h2.6M13.8 17h2.6"/>`,
  // 对勾
  check: `<circle cx="12" cy="12" r="8.6"/><path d="M8 12.2 11 15.2l5.2-5.6"/>`,
  // 右箭头
  arrow: `<path d="M9.4 5.2 16.4 12l-7 6.8"/>`,
  // 音符
  note: `<path d="M9.4 18V5.4l9.2-2v12.2"/><ellipse cx="6.8" cy="18" rx="2.6" ry="2.2"/><ellipse cx="16" cy="15.6" rx="2.6" ry="2.2"/><path d="M9.4 8.6l9.2-2"/>`,
  // 舞台聚光
  stage: `<path d="M8.6 3.4h6.8l4.6 8.2H4z"/><path d="M4 11.6h16v2.6H4z"/><path d="M6.4 14.2v6.4M17.6 14.2v6.4"/>`,
};

function svg(body, color, size, stroke = 1.7) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">
<g fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

const COLOR = {
  off: '#9C8B74',   // tabBar 未选中
  on: '#C2743A',    // tabBar 选中 / 主色
  ink: '#6B6056',   // 正文灰
  paper: '#F6EFE3', // 纸色（深底上用）
};

async function render(name, body, color, size, stroke) {
  const file = path.join(OUT, `${name}.png`);
  await sharp(Buffer.from(svg(body, color, size, stroke))).png({ compressionLevel: 9 }).toFile(file);
  return file;
}

(async () => {
  const tabs = [['home', 'tab-home'], ['mic', 'tab-show'], ['ticket', 'tab-order'], ['cup', 'tab-mine']];
  for (const [key, out] of tabs) {
    await render(out, P[key], COLOR.off, 81, 1.6);
    await render(out + '-on', P[key], COLOR.on, 81, 1.8);
  }
  const inline = ['location', 'phone', 'clock', 'people', 'calendar', 'check', 'arrow', 'note', 'moon', 'guitar', 'stage', 'mic', 'ticket'];
  for (const key of inline) {
    await render('ic-' + key, P[key], COLOR.ink, 72, 1.7);
    await render('ic-' + key + '-amber', P[key], COLOR.on, 72, 1.7);
  }
  await render('ic-moon-paper', P.moon, COLOR.paper, 72, 1.7);
  await render('ic-note-paper', P.note, COLOR.paper, 72, 1.7);

  // 头图：裁成横幅并压成 jpg，控制包体
  const src = path.join(__dirname, '..', 'miniprogram', 'assets', 'images', 'hero-src.png');
  if (fs.existsSync(src)) {
    await sharp(src).resize(1050, 560, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 76, mozjpeg: true })
      .toFile(path.join(__dirname, '..', 'miniprogram', 'assets', 'images', 'hero.jpg'));
  }
  console.log('图标输出完毕 ->', OUT);
})();
