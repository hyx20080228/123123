const api = require('../../utils/api.js');

Page({
  data: {
    tab: 'upcoming',
    upcoming: [],
    history: [],
    list: [],
    loaded: false,
  },

  onShow() {
    this.load();
  },

  onPullDownRefresh() {
    this.load().then(() => wx.stopPullDownRefresh());
  },

  load() {
    return api.listOrders().then((all) => {
      const upcoming = all.filter((o) => o.upcoming);
      const history = all.filter((o) => !o.upcoming);
      this.setData({
        upcoming,
        history,
        list: this.data.tab === 'upcoming' ? upcoming : history,
        loaded: true,
      });
    });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    this.setData({ tab, list: tab === 'upcoming' ? this.data.upcoming : this.data.history });
  },

  open(e) {
    wx.navigateTo({ url: '/pages/order-detail/order-detail?id=' + e.currentTarget.dataset.id });
  },

  goReserve() {
    wx.navigateTo({ url: '/pages/reserve/reserve' });
  },
});
