// 店员模式：吧台用。一期先做最简单的——看今天谁要来、改个状态。
const api = require('../../utils/api.js');
const util = require('../../utils/util.js');
const app = getApp();

// 口令以后挪到云端校验，现在先写死，方便店里试用
const PASS = ['nande', '难得', '2026'];

Page({
  data: {
    unlocked: false,
    pwd: '',
    orders: [],
    today: '',
    stat: { tables: 0, people: 0, pending: 0 },
    loaded: false,
  },

  onLoad() {
    const meta = util.dateMeta(util.todayYmd());
    this.setData({
      today: `${meta.month}月${meta.day}日 ${meta.week}`,
      unlocked: !!app.globalData.staffUnlocked,
    });
    if (this.data.unlocked) this.load();
  },

  onPwd(e) {
    this.setData({ pwd: e.detail.value });
  },

  unlock() {
    if (PASS.indexOf(this.data.pwd.trim()) === -1) {
      wx.showToast({ title: '口令不对', icon: 'none' });
      return;
    }
    app.globalData.staffUnlocked = true;
    this.setData({ unlocked: true });
    this.load();
  },

  load() {
    api.listTodayOrders().then((orders) => {
      const live = orders.filter((o) => o.status !== 'cancelled');
      this.setData({
        orders,
        loaded: true,
        stat: {
          tables: live.length,
          people: live.reduce((s, o) => s + (o.people || 0), 0),
          pending: orders.filter((o) => o.status === 'pending').length,
        },
      });
    });
  },

  onPullDownRefresh() {
    this.load();
    wx.stopPullDownRefresh();
  },

  act(e) {
    const { id, status } = e.currentTarget.dataset;
    api.updateStatus(id, status).then(() => {
      wx.showToast({ title: '已更新', icon: 'none' });
      this.load();
    });
  },

  callGuest(e) {
    wx.makePhoneCall({ phoneNumber: e.currentTarget.dataset.phone });
  },
});
