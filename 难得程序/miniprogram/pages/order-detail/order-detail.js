const api = require('../../utils/api.js');
const util = require('../../utils/util.js');

const STAMP = {
  pending: 'nd-stamp',
  confirmed: 'nd-stamp nd-stamp-moss',
  seated: 'nd-stamp nd-stamp-moss',
  cancelled: 'nd-stamp nd-stamp-gray',
  done: 'nd-stamp nd-stamp-gray',
};

const HINT = {
  pending: '已经把条子递到吧台，等店里确认一下',
  confirmed: '桌子给你留着了，晚到超过 15 分钟请来个电话',
  seated: '已到店，祝你今晚愉快',
  cancelled: '这次取消了，下次再来听歌',
  done: '谢谢你来过，欢迎下次再订',
};

Page({
  data: {
    order: null,
    shop: {},
    bars: [],
    stampClass: 'nd-stamp',
    hint: '',
    fresh: false,
  },

  onLoad(query) {
    this.id = query.id;
    this.setData({ fresh: query.fresh === '1' });
    api.getShop().then((shop) => this.setData({ shop }));
    this.load();
    if (query.fresh === '1') {
      wx.showToast({ title: '座位留好了', icon: 'success' });
    }
  },

  onShow() {
    if (this.data.order) this.load();
  },

  load() {
    api.getOrder(this.id).then((order) => {
      if (!order) return;
      // 用订单号生成一段条码（纯装饰，像一张真票）
      const bars = [];
      for (let i = 0; i < 42; i++) {
        const w = (util.hash(order.code + i) % 4) + 2;
        bars.push({ w: w * 2, k: i });
      }
      this.setData({
        order,
        bars,
        stampClass: STAMP[order.status] || 'nd-stamp',
        hint: HINT[order.status] || '',
      });
    });
  },

  call() {
    wx.makePhoneCall({ phoneNumber: this.data.shop.tel });
  },

  openMap() {
    const { latitude, longitude, name, address } = this.data.shop;
    wx.openLocation({ latitude, longitude, name, address, scale: 16 });
  },

  change() {
    wx.navigateTo({ url: '/pages/reserve/reserve?date=' + this.data.order.date });
  },

  cancel() {
    wx.showModal({
      title: '取消这次预约？',
      content: '取消后桌子会放回去给别人，确定吗',
      confirmText: '取消预约',
      cancelText: '再想想',
      confirmColor: '#8C3B2E',
      success: (res) => {
        if (!res.confirm) return;
        api.cancelOrder(this.id).then(() => {
          wx.showToast({ title: '已取消', icon: 'none' });
          this.load();
        });
      },
    });
  },

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },
});
