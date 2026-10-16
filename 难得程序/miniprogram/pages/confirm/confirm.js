const api = require('../../utils/api.js');
const app = getApp();

Page({
  data: {
    draft: null,
    show: null,
    name: '',
    phone: '',
    remark: '',
    tags: [],
    picked: [],
    notices: [],
    submitting: false,
  },

  onLoad() {
    const draft = app.getDraft();
    if (!draft) {
      wx.showToast({ title: '请先选桌子', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 600);
      return;
    }
    const profile = api.getProfile();
    api.getShows(14).then((shows) => {
      this.setData({ show: shows.filter((s) => s.date === draft.date)[0] });
    });
    this.setData({
      draft,
      tags: api.statics.remarkTags,
      notices: api.statics.shop.notices,
      name: profile.name || '',
      phone: profile.phone || '',
    });
  },

  onName(e) {
    this.setData({ name: e.detail.value });
  },

  onPhone(e) {
    this.setData({ phone: e.detail.value });
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  toggleTag(e) {
    const tag = e.currentTarget.dataset.tag;
    const picked = this.data.picked.slice();
    const i = picked.indexOf(tag);
    if (i > -1) picked.splice(i, 1);
    else picked.push(tag);
    this.setData({ picked });
  },

  submit() {
    const d = this.data;
    if (d.submitting) return;
    if (!d.name.trim()) {
      wx.showToast({ title: '怎么称呼你呢', icon: 'none' });
      return;
    }
    if (!/^1\d{10}$/.test(d.phone)) {
      wx.showToast({ title: '手机号好像不太对', icon: 'none' });
      return;
    }
    this.setData({ submitting: true });
    wx.showLoading({ title: '正在留座…', mask: true });

    const remark = [d.picked.join('、'), d.remark.trim()].filter(Boolean).join('；');
    api
      .createOrder(Object.assign({}, d.draft, {
        name: d.name.trim(),
        phone: d.phone.trim(),
        remark,
      }))
      .then((order) => {
        wx.hideLoading();
        app.setDraft(null);
        wx.redirectTo({ url: '/pages/order-detail/order-detail?id=' + order.id + '&fresh=1' });
      })
      .catch(() => {
        wx.hideLoading();
        this.setData({ submitting: false });
        wx.showToast({ title: '没订上，再试一次', icon: 'none' });
      });
  },
});
