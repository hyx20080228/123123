const api = require('../../utils/api.js');

Page({
  data: {
    shows: [],
    shop: {},
  },

  onLoad() {
    api.getShop().then((shop) => this.setData({ shop }));
    api.getShows(14).then((shows) => this.setData({ shows }));
  },

  book(e) {
    const item = e.currentTarget.dataset.item;
    if (item.closed) {
      wx.showToast({ title: '这天歇业哦', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/reserve/reserve?date=' + item.date });
  },
});
