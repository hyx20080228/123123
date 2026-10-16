// 难得民谣 · 数据层
// 目前全部跑在本地（mock + 本地缓存），所有方法都返回 Promise。
// 以后接云开发时，只需要把每个方法体换成 wx.cloud.callFunction，页面代码一行都不用改。

const { shop, zones, slots, weeklyLineup, remarkTags, roadmap } = require('./data.js');
const util = require('./util.js');

const ORDER_KEY = 'nd_orders_v2';
const PROFILE_KEY = 'nd_profile_v1';
const MOCK_DELAY = 120;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms === undefined ? MOCK_DELAY : ms));
}

function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function readOrders() {
  try {
    return wx.getStorageSync(ORDER_KEY) || [];
  } catch (e) {
    return [];
  }
}

function writeOrders(list) {
  try {
    wx.setStorageSync(ORDER_KEY, list);
  } catch (e) {}
}

/* ---------------- 店铺 / 演出 ---------------- */

function getShop() {
  return Promise.resolve(clone(shop));
}

function isClosed(dateStr) {
  const meta = util.dateMeta(dateStr);
  return shop.closedWeekdays.indexOf(meta.weekday) > -1;
}

/** 某天的节目 */
function buildShow(dateStr) {
  const meta = util.dateMeta(dateStr);
  const base = weeklyLineup[meta.weekday] || {};
  return Object.assign({}, clone(base), {
    date: dateStr,
    md: meta.md,
    week: meta.week,
    label: meta.label,
    isToday: meta.isToday,
    closed: !!base.closed,
    styleText: (base.style || []).join(' · '),
  });
}

/** 节目单：往后 n 天 */
function getShows(n) {
  const days = util.nextDays(n || 7);
  return delay().then(() => days.map(buildShow));
}

/** 今晚的节目 */
function getTonight() {
  return delay(60).then(() => buildShow(util.todayYmd()));
}

/* ---------------- 日期 / 时段 / 桌位 ---------------- */

/** 可预约日期（含是否休息、是否有演出） */
function getDates() {
  const days = util.nextDays(shop.bookAheadDays);
  return delay(60).then(() =>
    days.map((d) => {
      const meta = util.dateMeta(d);
      const show = buildShow(d);
      return {
        ymd: d,
        md: `${meta.month}.${meta.day}`,
        day: meta.day,
        label: meta.label,
        week: meta.week,
        closed: show.closed,
        hasLive: show.hasLive,
        hot: !!show.hot,
        showTitle: show.title,
      };
    })
  );
}

/** 某天的时段（过去的时段不可选；休息日全不可选） */
function getSlots(dateStr) {
  const meta = util.dateMeta(dateStr);
  const closed = isClosed(dateStr);
  const show = buildShow(dateStr);
  return delay(60).then(() =>
    slots.map((s) => {
      const past = meta.isToday && util.hm2min(s.time) <= util.nowMin() + 30;
      // 用稳定哈希造一点「紧张感」，演出日更紧张
      const seed = util.hash(dateStr + s.time) % 100;
      const tight = seed < (show.hot ? 42 : show.hasLive ? 26 : 12);
      return {
        time: s.time,
        tip: s.time === show.start && show.hasLive ? '演出开场' : s.tip,
        disabled: closed || past,
        reason: closed ? '今日休息' : past ? '已过时间' : '',
        tight,
      };
    })
  );
}

/** 某天某时段的桌位图 */
function getTables(dateStr, slot, people) {
  const orders = readOrders();
  const taken = orders
    .filter((o) => o.date === dateStr && o.slot === slot && ['pending', 'confirmed', 'seated'].indexOf(o.status) > -1)
    .map((o) => o.tableId);
  const show = buildShow(dateStr);
  const weekend = util.dateMeta(dateStr).isWeekend;

  return delay().then(() =>
    zones.map((z) => {
      const zone = clone(z);
      zone.tables = zone.tables.map((t) => {
        const seed = util.hash(dateStr + slot + t.id) % 100;
        const busyLine = show.hot ? 45 : show.hasLive ? 28 : 14;
        const booked = taken.indexOf(t.id) > -1 || seed < busyLine;
        const tooSmall = people > t.seats;
        const minSpend = weekend && z.minSpendWeekend ? z.minSpendWeekend : z.minSpend;
        return Object.assign({}, t, {
          zoneId: z.id,
          zoneName: z.name,
          minSpend,
          booked,
          tooSmall,
          disabled: booked || tooSmall,
          state: booked ? 'booked' : tooSmall ? 'small' : 'free',
          stateText: booked ? '已订出' : tooSmall ? `坐不下 ${people} 位` : `可坐 ${t.seats} 位`,
          seatText: t.seats === 1 ? '1 位' : `${t.seats} 位`,
        });
      });
      zone.minSpendText = `低消 ¥${weekend && z.minSpendWeekend ? z.minSpendWeekend : z.minSpend}`;
      zone.freeCount = zone.tables.filter((t) => !t.disabled).length;
      zone.tagText = zone.tags.join(' · ');
      return zone;
    })
  );
}

/** 今晚还剩几张桌（首页用） */
function countFreeTonight() {
  const date = util.todayYmd();
  if (isClosed(date)) return Promise.resolve(0);
  return getTables(date, '20:30', 2).then((zs) =>
    zs.reduce((sum, z) => sum + z.tables.filter((t) => !t.booked).length, 0)
  );
}

/* ---------------- 预约单 ---------------- */

const STATUS_TEXT = {
  pending: '待确认',
  confirmed: '已确认',
  seated: '已到店',
  cancelled: '已取消',
  done: '已完成',
};

function decorate(o) {
  const meta = util.dateMeta(o.date);
  const show = buildShow(o.date);
  return Object.assign({}, o, {
    statusText: STATUS_TEXT[o.status] || o.status,
    dateText: `${meta.month}月${meta.day}日`,
    md: meta.md,
    week: meta.week,
    label: meta.label,
    isToday: meta.isToday,
    upcoming: ['pending', 'confirmed', 'seated'].indexOf(o.status) > -1 && meta.diff >= 0,
    showTitle: show.hasLive ? `${show.title} · ${show.artist}` : show.title,
    createdText: util.formatDateTime(o.createdAt),
    phoneMask: util.maskPhone(o.phone),
  });
}

function createOrder(payload) {
  const list = readOrders();
  const id = 'o' + Date.now();
  const order = Object.assign(
    {
      id,
      code: util.orderCode(payload.date, list.length + 7),
      status: 'pending',
      createdAt: Date.now(),
    },
    payload
  );
  list.unshift(order);
  writeOrders(list);
  // 顺手记住联系人，下次不用再填
  try {
    wx.setStorageSync(PROFILE_KEY, { name: payload.name, phone: payload.phone });
  } catch (e) {}
  return delay(300).then(() => decorate(order));
}

function listOrders() {
  return delay(80).then(() => readOrders().map(decorate));
}

function getOrder(id) {
  return delay(80).then(() => {
    const found = readOrders().filter((o) => o.id === id)[0];
    return found ? decorate(found) : null;
  });
}

function updateStatus(id, status) {
  const list = readOrders();
  const idx = list.findIndex((o) => o.id === id);
  if (idx > -1) {
    list[idx].status = status;
    list[idx].updatedAt = Date.now();
    writeOrders(list);
  }
  return delay(200).then(() => (idx > -1 ? decorate(list[idx]) : null));
}

function cancelOrder(id) {
  return updateStatus(id, 'cancelled');
}

/** 店员模式：今天的预约 */
function listTodayOrders() {
  const today = util.todayYmd();
  return delay(120).then(() =>
    readOrders()
      .filter((o) => o.date === today)
      .map(decorate)
      .sort((a, b) => (a.slot > b.slot ? 1 : -1))
  );
}

function getProfile() {
  try {
    return wx.getStorageSync(PROFILE_KEY) || {};
  } catch (e) {
    return {};
  }
}

module.exports = {
  getShop, getShows, getTonight, getDates, getSlots, getTables, countFreeTonight,
  createOrder, listOrders, getOrder, cancelOrder, updateStatus, listTodayOrders,
  getProfile, isClosed, STATUS_TEXT,
  statics: { shop, zones, slots, remarkTags, roadmap },
};
