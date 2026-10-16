// 难得民谣 · 静态配置与座位数据
// —— 这里的内容以后会搬到云数据库，现在先放本地，改店名/桌子/演出只改这一个文件。

const shop = {
  name: '难得民谣',
  enName: 'NANDE FOLK',
  subtitle: '民谣酒馆 · 小型现场',
  slogan: '难得今宵，难得你来',
  intro: '一间只有十几张桌子的小酒馆。木头、暖灯、一把吉他，和愿意安静听歌的人。\n我们不卖喧哗，只卖一点酒和一点晚上。',
  address: '（待填）XX 市 XX 区 XX 路 123 号 2 楼',
  addressShort: 'XX 路 123 号 2 楼',
  latitude: 30.26,
  longitude: 120.15,
  tel: '13800000000',
  hours: '18:30 - 次日 02:00',
  closedWeekdays: [1], // 周一休整
  closedTip: '周一歇一天，我们也要听歌',
  bookAheadDays: 14,
  holdMinutes: 15,
  maxPeople: 12,
  notices: [
    '桌位为您保留 15 分钟，晚到请提前来个电话',
    '每桌有最低消费，演出日周末低消会高一些',
    '演出进行时请把说话声音放轻，台上的人会听见',
    '可以带朋友、带故事、带吉他，不要带外带酒水',
  ],
  wifi: 'nande-folk',
};

// 桌位：舞台在最上方，往下依次是卡座、散台、吧台、厢房
const zones = [
  {
    id: 'A',
    name: '临窗卡座',
    desc: '靠窗软沙发，看得见街灯',
    tags: ['靠窗', '软沙发'],
    minSpend: 288,
    minSpendWeekend: 388,
    tables: [
      { id: 'A1', name: 'A1', seats: 4, tag: '靠窗第一排' },
      { id: 'A2', name: 'A2', seats: 4, tag: '靠窗' },
      { id: 'A3', name: 'A3', seats: 4, tag: '靠窗' },
      { id: 'A4', name: 'A4', seats: 6, tag: '转角大卡座' },
    ],
  },
  {
    id: 'B',
    name: '中庭散台',
    desc: '正对舞台，离歌声最近',
    tags: ['正对舞台'],
    minSpend: 188,
    minSpendWeekend: 248,
    tables: [
      { id: 'B1', name: 'B1', seats: 2, tag: '台前第一桌' },
      { id: 'B2', name: 'B2', seats: 2, tag: '台前' },
      { id: 'B3', name: 'B3', seats: 4, tag: '正中' },
      { id: 'B4', name: 'B4', seats: 4, tag: '正中' },
      { id: 'B5', name: 'B5', seats: 4, tag: '后排' },
      { id: 'B6', name: 'B6', seats: 2, tag: '后排安静' },
    ],
  },
  {
    id: 'C',
    name: '吧台高位',
    desc: '一个人来也很好，可以和调酒师聊天',
    tags: ['单人友好'],
    minSpend: 88,
    minSpendWeekend: 128,
    tables: [
      { id: 'C1', name: 'C1', seats: 1, tag: '' },
      { id: 'C2', name: 'C2', seats: 1, tag: '' },
      { id: 'C3', name: 'C3', seats: 1, tag: '' },
      { id: 'C4', name: 'C4', seats: 2, tag: '可并座' },
      { id: 'C5', name: 'C5', seats: 2, tag: '可并座' },
    ],
  },
  {
    id: 'D',
    name: '里间小厢房',
    desc: '可关门说话，适合聚会和生日',
    tags: ['可闭门', '聚会'],
    minSpend: 688,
    minSpendWeekend: 888,
    tables: [
      { id: 'D1', name: '厢房·南', seats: 8, tag: '8 人' },
      { id: 'D2', name: '厢房·北', seats: 10, tag: '10 人' },
    ],
  },
];

// 可选时段（营业日通用）
const slots = [
  { time: '18:30', tip: '刚开门，人少' },
  { time: '19:00', tip: '' },
  { time: '19:30', tip: '' },
  { time: '20:00', tip: '演出前' },
  { time: '20:30', tip: '开场' },
  { time: '21:00', tip: '热闹' },
  { time: '21:30', tip: '' },
  { time: '22:00', tip: '下半场' },
];

// 每周固定节目单（按星期几排）
const weeklyLineup = {
  0: { title: '黑胶之夜', artist: '唱片与清酒', style: ['不插电', '放唱片'], start: '20:00', hasLive: false, desc: '没有现场，只放老唱片。适合谁都不想说话的星期天。' },
  1: { title: '歇一天', artist: '', style: [], start: '', hasLive: false, closed: true, desc: '周一不营业，我们也要去听别人的歌。' },
  2: { title: '开放麦', artist: '主持 · 阿树', style: ['开放麦', '随便唱'], start: '20:30', hasLive: true, desc: '谁都可以上台唱三首，报名在吧台。唱砸了也有人鼓掌。' },
  3: { title: '民谣夜', artist: '驻唱 · 林野', style: ['民谣', '原创'], start: '20:30', hasLive: true, desc: '林野的声音像旧收音机，唱自己写的词。' },
  4: { title: '双人场', artist: '南山 与 阿树', style: ['民谣', '翻唱'], start: '20:30', hasLive: true, desc: '一把木吉他加一把口琴，老歌为主，可以点歌。' },
  5: { title: '周五现场', artist: '巷口三人组', style: ['布鲁斯', '民谣'], start: '21:00', hasLive: true, desc: '这天来得早才有好位置，建议提前订桌。' },
  6: { title: '难得现场', artist: '黄昏合唱团', style: ['现场', '合唱'], start: '21:00', hasLive: true, hot: true, desc: '一周里最吵也最好的一晚，最后一首大家一起唱。' },
};

// 到店备注的快捷标签
const remarkTags = ['过生日', '想点歌', '要安静角落', '靠窗', '朋友聚会', '第一次来', '会晚到一点'];

// 二期路线预告（在「我的」页面展示）
const roadmap = [
  { stage: '一期', title: '预约桌位', status: 'doing', desc: '自家店里试点，先把客人和桌子接上' },
  { stage: '二期', title: '扫码点单', status: 'todo', desc: '替换美团点单，省掉平台佣金' },
  { stage: '三期', title: '会员与点歌', status: 'todo', desc: '储值、常客、线上点歌台' },
];

module.exports = { shop, zones, slots, weeklyLineup, remarkTags, roadmap };
