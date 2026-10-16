const api = require('../../utils/api.js');
const util = require('../../utils/util.js');
const app = getApp();

Page({
  data: {
    dates: [],
    slots: [],
    zones: [],
    date: '',
    dateLabel: '',
    slot: '',
    people: 2,
    tableId: '',
    table: null,
    show: null,
    maxPeople: 12,
    summary: '先挑个日子',
    canNext: false,
    loadingTables: false,
  },

  onLoad(query) {
    const maxPeople = api.statics.shop.maxPeople;
    api.getDates().then((dates) => {
      const first = dates.filter((d) => !d.closed)[0];
      const date = query && query.date && dates.filter((d) => d.ymd === query.date && !d.closed)[0] ? query.date : first.ymd;
      this.setData({ dates, maxPeople });
      this.pickDate(date);
    });
  },

  /* ---------- 日期 ---------- */
  onDateTap(e) {
    const item = e.currentTarget.dataset.item;
    if (item.closed) {
      wx.showToast({ title: api.statics.shop.closedTip, icon: 'none' });
      return;
    }
    this.pickDate(item.ymd);
  },

  pickDate(date) {
    const meta = util.dateMeta(date);
    this.setData({
      date,
      dateLabel: `${meta.month}月${meta.day}日 ${meta.week}`,
      slot: '',
      tableId: '',
      table: null,
      zones: [],
    });
    Promise.all([api.getSlots(date), api.getShows(14)]).then(([slots, shows]) => {
      const show = shows.filter((s) => s.date === date)[0];
      const firstFree = slots.filter((s) => !s.disabled)[0];
      this.setData({ slots, show });
      if (firstFree) this.pickSlot(firstFree.time);
      else this.updateSummary();
    });
  },

  /* ---------- 时段 ---------- */
  onSlotTap(e) {
    const item = e.currentTarget.dataset.item;
    if (item.disabled) {
      wx.showToast({ title: item.reason || '这个点订不了啦', icon: 'none' });
      return;
    }
    this.pickSlot(item.time);
  },

  pickSlot(time) {
    this.setData({ slot: time, tableId: '', table: null });
    this.loadTables();
  },

  /* ---------- 人数 ---------- */
  minus() {
    if (this.data.people <= 1) return;
    this.setData({ people: this.data.people - 1 });
    this.afterPeopleChange();
  },

  plus() {
    if (this.data.people >= this.data.maxPeople) {
      wx.showToast({ title: '超过 ' + this.data.maxPeople + ' 位，打个电话给我们', icon: 'none' });
      return;
    }
    this.setData({ people: this.data.people + 1 });
    this.afterPeopleChange();
  },

  afterPeopleChange() {
    const t = this.data.table;
    if (t && this.data.people > t.seats) {
      this.setData({ tableId: '', table: null });
    }
    this.loadTables();
  },

  /* ---------- 桌位 ---------- */
  loadTables() {
    if (!this.data.date || !this.data.slot) return;
    this.setData({ loadingTables: true });
    api.getTables(this.data.date, this.data.slot, this.data.people).then((zones) => {
      this.setData({ zones, loadingTables: false });
      this.updateSummary();
    });
  },

  onTableTap(e) {
    const t = e.currentTarget.dataset.table;
    if (t.booked) {
      wx.showToast({ title: '这桌已经有人订了', icon: 'none' });
      return;
    }
    if (t.tooSmall) {
      wx.showToast({ title: '这桌坐不下 ' + this.data.people + ' 位', icon: 'none' });
      return;
    }
    this.setData({ tableId: t.id, table: t });
    this.updateSummary();
  },

  updateSummary() {
    const d = this.data;
    let summary = '';
    if (!d.slot) summary = '今天这天没有可订的时段了';
    else if (!d.table) summary = `${d.dateLabel} · ${d.slot} · ${d.people} 位 · 挑张桌子`;
    else summary = `${d.table.zoneName} ${d.table.name} · ${d.slot} · ${d.people} 位 · 低消 ¥${d.table.minSpend}`;
    this.setData({ summary, canNext: !!(d.slot && d.table) });
  },

  next() {
    const d = this.data;
    if (!d.canNext) {
      wx.showToast({ title: '先挑一张桌子吧', icon: 'none' });
      return;
    }
    app.setDraft({
      date: d.date,
      dateLabel: d.dateLabel,
      slot: d.slot,
      people: d.people,
      tableId: d.table.id,
      tableName: d.table.name,
      zoneId: d.table.zoneId,
      zoneName: d.table.zoneName,
      minSpend: d.table.minSpend,
      seats: d.table.seats,
    });
    wx.navigateTo({ url: '/pages/confirm/confirm' });
  },
});
