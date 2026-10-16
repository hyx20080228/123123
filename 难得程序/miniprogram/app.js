// 难得民谣 · 小程序入口
App({
  globalData: {
    // 预约流程中的临时选择（reserve -> confirm 之间传递）
    draft: null,
    // 店员模式是否已解锁
    staffUnlocked: false,
    systemInfo: null,
  },

  onLaunch() {
    try {
      this.globalData.systemInfo = wx.getSystemInfoSync();
    } catch (e) {}

    // 以后接云开发，把下面这段打开即可（并在 project.config.json 里配好 cloudfunctionRoot）
    // if (wx.cloud) {
    //   wx.cloud.init({ env: 'nande-folk-xxxx', traceUser: true });
    // }
  },

  setDraft(draft) {
    this.globalData.draft = draft;
  },

  getDraft() {
    return this.globalData.draft;
  },
});
