const api = require('../../utils/api.js');

Page({
  data: {
    profile: {},
    shop: {},
    roadmap: [],
    count: 0,
    upcoming: 0,
    hasProfile: false,
    version: 'v0.1 · 试点版',
  },

  onShow() {
    const profile = api.getProfile();
    api.getShop().then((shop) => this.setData({ shop }));
    api.listOrders().then((list) => {
      this.setData({
        count: list.length,
        upcoming: list.filter((o) => o.upcoming).length,
      });
    });
    this.setData({
      profile,
      hasProfile: !!profile.phone,
      roadmap: api.statics.roadmap,
    });
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  goReserve() {
    wx.navigateTo({ url: '/pages/reserve/reserve' });
  },

  call() {
    wx.makePhoneCall({ phoneNumber: this.data.shop.tel });
  },

  openMap() {
    const { latitude, longitude, name, address } = this.data.shop;
    wx.openLocation({ latitude, longitude, name, address, scale: 16 });
  },

  soon() {
    wx.showToast({ title: '这个功能还在路上', icon: 'none' });
  },

  goStaff() {
    wx.navigateTo({ url: '/pages/staff/staff' });
  },

  about() {
    wx.showModal({
      title: '难得民谣',
      content: this.data.shop.intro,
      showCancel: false,
      confirmText: '知道了',
      confirmColor: '#C2743A',
    });
  },
});
