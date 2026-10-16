// 难得民谣 · 通用小工具
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

/** Date -> 2026-10-16 */
function ymd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 2026-10-16 -> Date（当天 00:00，避免 iOS 解析横杠日期的坑） */
function parseYmd(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, m - 1, d);
}

function todayYmd() {
  return ymd(new Date());
}

/** 2026-10-16 -> { md: '10.16', week: '周四', isToday, isTomorrow, label } */
function dateMeta(str) {
  const date = parseYmd(str);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - today) / 86400000);
  const week = WEEK[date.getDay()];
  let label = week;
  if (diff === 0) label = '今天';
  else if (diff === 1) label = '明天';
  else if (diff === 2) label = '后天';
  return {
    ymd: str,
    md: `${date.getMonth() + 1}.${date.getDate()}`,
    month: date.getMonth() + 1,
    day: date.getDate(),
    week,
    weekday: date.getDay(),
    diff,
    isToday: diff === 0,
    isWeekend: date.getDay() === 5 || date.getDay() === 6,
    label,
  };
}

/** 往后 n 天的日期字符串数组（含今天） */
function nextDays(n) {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    out.push(ymd(new Date(base.getTime() + i * 86400000)));
  }
  return out;
}

/** '20:30' -> 分钟数 */
function hm2min(hm) {
  const [h, m] = hm.split(':').map(Number);
  return h * 60 + m;
}

function nowMin() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/** 稳定哈希：同样的入参永远得到同样的结果（mock 数据不乱跳） */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/** 取号：ND-1016-07 */
function orderCode(dateStr, seq) {
  const m = dateStr.replace(/-/g, '').slice(4);
  return `ND-${m}-${pad(seq % 100)}`;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function maskPhone(phone) {
  if (!phone || phone.length < 7) return phone || '';
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

module.exports = {
  WEEK, pad, ymd, parseYmd, todayYmd, dateMeta, nextDays,
  hm2min, nowMin, hash, orderCode, formatDateTime, maskPhone,
};
