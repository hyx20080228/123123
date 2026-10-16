const api = require('../../utils/api.js');

Page({
  data: {
    shop: {},
    tonight: {},
    zones: [],
    week: [],
    freeText: '',
    loaded: false,
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (this.data.loaded) this.refreshSeats();
  },

  load() {
    Promise.all([api.getShop(), api.getTonight(), api.getShows(7), api.getTables(require('../../utils/util.js').todayYmd(), '20:30', 1)])
      .then(([shop, tonight, week, zones]) => {
        const free = zones.reduce((s, z) => s + z.tables.filter((t) => !t.booked).length, 0);
        this.setData({
          shop,
          tonight,
          week: week.slice(0, 7),
          zones: zones.map((z) => ({
            id: z.id,
            name: z.name,
            desc: z.desc,
            minSpendText: z.minSpendText,
            countText: z.tables.length + ' 桌',
            tagText: z.tagText,
          })),
          freeText: tonight.closed ? '今晚歇一天' : '今晚还剩 ' + free + ' 张桌子',
          loaded: true,
        });
      });
  },

  refreshSeats() {
    api.countFreeTonight().then((free) => {
      this.setData({
        freeText: this.data.tonight.closed ? '今晚歇一天' : '今晚还剩 ' + free + ' 张桌子',
      });
    });
  },

  goReserve() {
    wx.navigateTo({ url: '/pages/reserve/reserve' });
  },

  goReserveDate(e) {
    const date = e.currentTarget.dataset.date;
    wx.navigateTo({ url: '/pages/reserve/reserve?date=' + date });
  },

  goShows() {
    wx.switchTab({ url: '/pages/shows/shows' });
  },

  call() {
    wx.makePhoneCall({ phoneNumber: this.data.shop.tel });
  },

  openMap() {
    const { latitude, longitude, name, address } = this.data.shop;
    wx.openLocation({ latitude, longitude, name, address, scale: 16 });
  },

  copyAddress() {
    wx.setClipboardData({ data: this.data.shop.address });
  },
});
