// ============ 核心定义：物品 / 武器 / 资源 / 叙事碎片 / 角色 ============

export type ItemKind =
  | 'melee' | 'gun' | 'armor' | 'consumable' | 'ammo'
  | 'common' | 'rare' | 'quest' | 'lore';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  icon: string;          // emoji 图标（临时，后续换程序化图标）
  color: string;         // 主题色（发光描边）
  desc: string;
  value: number;         // 旧币价值
  stack: number;         // 单格最大堆叠
  // 武器
  dmg?: number;
  rate?: number;         // 发/秒
  range?: number;        // px
  mag?: number;
  spread?: number;       // 弧度
  speed?: number;        // 弹速(射线=false)
  auto?: boolean;
  meleeArc?: number;     // 近战扇形弧度
  reload?: number;
  // 护甲
  armorVal?: number;
  // 消耗品
  heal?: number;
  // 稀有资源
  isRare?: boolean;
  isQuest?: boolean;
}

export const ITEMS: Record<string, ItemDef> = {
  // ---- 武器 ----
  cleaver: { id:'cleaver', name:'砍肉刀', kind:'melee', icon:'🔪', color:'#ff4fa0',
    desc:'居民区杂货铺的旧砍刀。挥砍时发出让人安心的风声。', value:30, stack:1, dmg:62, rate:2.2, range:74, meleeArc:1.5 },
  p9: { id:'p9', name:'P9 手枪', kind:'gun', icon:'🔫', color:'#ff4a3c',
    desc:'老式警用手枪，稳定可靠。', value:120, stack:1, dmg:24, rate:4.5, range:620, mag:12, speed:1400, spread:0.035, reload:1.1 },
  smg: { id:'smg', name:'拾荒者冲锋枪', kind:'gun', icon:'⚡', color:'#ff4a3c',
    desc:'仓库里拼出来的自动武器，射速惊人但准头堪忧。', value:240, stack:1, dmg:14, rate:9, range:520, mag:30, speed:1300, spread:0.09, auto:true, reload:1.5 },
  // ---- 护甲 ----
  vest: { id:'vest', name:'塑料拼甲', kind:'armor', icon:'🛡️', color:'#3fa9ff',
    desc:'三层自行车内胎压制的护甲，挡不住子弹但能少挨几下。', value:90, stack:1, armorVal:40 },
  // ---- 消耗品 ----
  can: { id:'can', name:'过期罐头', kind:'consumable', icon:'🥫', color:'#59c46a',
    desc:'还能吃。恢复 35 生命。', value:18, stack:5, heal:35 },
  // ---- 弹药 ----
  ammo: { id:'ammo', name:'9mm 弹药', kind:'ammo', icon:'▪️', color:'#e8e6d0',
    desc:'手枪与冲锋枪共用弹药。', value:2, stack:120 },
  // ---- 普通资源 x5 ----
  cloth: { id:'cloth', name:'破布', kind:'common', icon:'🧣', color:'#e8f6ff', desc:'晾衣绳上扯下来的旧布。', value:6, stack:99 },
  bolt:  { id:'bolt', name:'螺丝', kind:'common', icon:'🔩', color:'#e8f6ff', desc:'锈迹斑斑的标准件。', value:8, stack:99 },
  wire:  { id:'wire', name:'铜线', kind:'common', icon:'🧵', color:'#e8f6ff', desc:'还能导电的铜线，值钱。', value:14, stack:99 },
  canfood: { id:'canfood', name:'罐头', kind:'common', icon:'🥫', color:'#e8f6ff', desc:'未过期的一批罐头。', value:12, stack:99 },
  cell:  { id:'cell', name:'电池', kind:'common', icon:'🔋', color:'#e8f6ff', desc:'还能用的旧电池。', value:16, stack:99 },
  // ---- 高级资源 x3 ----
  titanium: { id:'titanium', name:'钛合金板', kind:'rare', icon:'⬜', color:'#ffc23c', desc:'军工级板材，回收市场抢手货。', value:120, stack:20, isRare:true },
  antir: { id:'antir', name:'抗辐药剂', kind:'rare', icon:'🧪', color:'#ffc23c', desc:'医院地下药房的库存品，谁需要它？', value:150, stack:20, isRare:true },
  sigcell: { id:'sigcell', name:'信号电源', kind:'rare', icon:'⚡', color:'#ffc23c', desc:'广播站同型号电源模块。', value:130, stack:20, isRare:true },
  // ---- 任务物品 ----
  powercell: { id:'powercell', name:'备用电源', kind:'quest', icon:'🔌', color:'#59e6d9',
    desc:'藏在钟楼地窖的秘密电源——撤离点通电全靠它。', value:0, stack:1, isQuest:true },
  tape: { id:'tape', name:'录音带「倒放 33」', kind:'quest', icon:'📼', color:'#59e6d9',
    desc:'值班员留下的磁带。可以在钟楼旁的旧点唱机播放。', value:0, stack:1, isQuest:true },
  // ---- 叙事碎片（地面拾取物） ----
  note1: { id:'note1', name:'纸条 · 花盆钥匙', kind:'lore', icon:'📄', color:'#b26bff', desc:'一张被压皱的便条。', value:0, stack:1 },
  note2: { id:'note2', name:'纸条 · 别信钟楼', kind:'lore', icon:'📄', color:'#b26bff', desc:'处方笺背面的字。', value:0, stack:1 },
  note3: { id:'note3', name:'纸条 · 1024', kind:'lore', icon:'📄', color:'#b26bff', desc:'夹在账本里的纸条。', value:0, stack:1 },
  note4: { id:'note4', name:'纸条 · 818', kind:'lore', icon:'📄', color:'#b26bff', desc:'撕破的站务册。', value:0, stack:1 },
  note5: { id:'note5', name:'纸条 · 第三十三频道', kind:'lore', icon:'📄', color:'#b26bff', desc:'值班员的绝笔。', value:0, stack:1 },
  log1:  { id:'log1', name:'日志 · 封锁日志', kind:'lore', icon:'📔', color:'#b26bff', desc:'市立二院封锁日志。', value:0, stack:1 },
  log2:  { id:'log2', name:'日志 · 末班车', kind:'lore', icon:'📔', color:'#b26bff', desc:'地铁运营日志。', value:0, stack:1 },
  photo1:{ id:'photo1', name:'照片 · 全家福', kind:'lore', icon:'🖼️', color:'#b26bff', desc:'一家三口的旧照片。', value:0, stack:1 },
  // ---- 钥匙/密码类（交互道具） ----
  flowerkey: { id:'flowerkey', name:'花盆下的钥匙', kind:'quest', icon:'🗝️', color:'#59e6d9',
    desc:'锈迹斑斑的抽屉钥匙，医院护士站抽屉上用。', value:0, stack:1, isQuest:true },
  pharmacykey: { id:'pharmacykey', name:'药房钥匙', kind:'quest', icon:'🗝️', color:'#59e6d9',
    desc:'开地下药房的门。', value:0, stack:1, isQuest:true },
};

// --------- 叙事碎片 ---------
export interface LoreNote { id:string; tag:'纸条'|'日志'|'照片'|'录音'; zone:string; title:string; body:string; hint:string; }
export const LORE: Record<string, LoreNote> = {
  note1: { id:'note1', tag:'纸条', zone:'居民区 · 14号院药铺',
    title:'一张被压皱的便条',
    body:'小远：\n药柜钥匙我埋在院里那盆月季下面了。要拿药就自己去拿，别等妈妈。\n\n——妈',
    hint:'钥匙在居民区某处花盆下 → 可开 医院护士站抽屉' },
  note2: { id:'note2', tag:'纸条', zone:'废弃医院 · 接种室',
    title:'处方笺背面',
    body:'广播站每晚 3:33 播同一段旋律，像在数数。\n我把录音倒放，听了三遍——\n\n三个字：别信钟楼。',
    hint:'钟楼控制柜 → 把指针拨到 3:33' },
  note3: { id:'note3', tag:'纸条', zone:'仓库区 · B7 集装箱',
    title:'夹在账本里的纸条',
    body:'老李把最后一箱「样品」锁进隧道尽头的储物间了。\n密码是他生日：1024。',
    hint:'地铁隧道尽头的储物间密码 = 1024' },
  note4: { id:'note4', tag:'纸条', zone:'地铁站 · 售票厅',
    title:'撕破的站务册',
    body:'封站前一晚，那辆信号车开进了旧城……\n车牌后三位：818。',
    hint:'仓库区车牌尾号 818 的皮卡 → 后备箱' },
  note5: { id:'note5', tag:'纸条', zone:'北部广播站 · 控制室',
    title:'值班员的绝笔',
    body:'如果有人看到：别让钟楼响第四次。\n我们数错了——第五声不在钟里。\n\n翻到 33 频道。',
    hint:'录音带可在 中央街区旧点唱机 播放' },
  log1: { id:'log1', tag:'日志', zone:'废弃医院 · 护士站抽屉',
    title:'市立二院封锁日志 · 9/14',
    body:'23:10  急诊涌入十二名患者，症状一致：高烧、嗜睡、说梦话。\n23:26  穿防护服的一队人进院，反复问同一句——「谁见过戴红围巾的兔子？」\n23:40  全院断电。值班医生把最后一支特效药锁进了地下药房。\n23:55  广播里开始放那首曲子。所有人都说困。\n\n只有我没睡。我在窗边看见：钟楼的影子，比钟楼长。',
    hint:'解锁：地下药房（抗辐药剂）· 红围巾的来客' },
  log2: { id:'log2', tag:'日志', zone:'地铁站 · 隧道储物间',
    title:'地铁运营日志 · 末班车 9/13 23:59',
    body:'司机报告：旧城区站未停，他说站台上有人招手，穿红围巾。\n调度室监控拍到一辆不在台账上的信号车开进隧道，随后消失。\n\n日志里夹着一张手绘地图，标注：「隧道尽头第三个出口——通往钟楼底下」。',
    hint:'解锁：钟楼地窖后门 · 信号电源' },
  photo1: { id:'photo1', tag:'照片', zone:'钟楼地窖',
    title:'一张全家福',
    body:'照片里是一家三口，背景是旧城区钟楼。\n背面写着：「3 月 3 日，33 岁，我们仨。三三。」\n\n有人把「33」念了四遍，又擦掉了一个。',
    hint:'—— 世界碎片 · 已收藏' },
  tapeLore: { id:'tapeLore', tag:'录音', zone:'北部广播站 · 控制室',
    title:'录音带「倒放 33」',
    body:'倒放后可以清晰听到：不是旋律，是一个声音在数数。\n「……一、二、三、四。\n\n第五声，不在钟里。」',
    hint:'—— 世界碎片 · 已收藏' },
};

// --------- 角色 ---------
export interface CharDef { id:string; name:string; species:string; body:string; belly:string; ear:string; accent:string; desc:string; }
export const CHARS: CharDef[] = [
  { id:'cat', name:'阿橘', species:'橘猫', body:'#e8923c', belly:'#f8d9a8', ear:'#c96f2a', accent:'#5c4a35',
    desc:'杂货铺的猫。镇上第一个听见钟楼声音的人。' },
  { id:'rabbit', name:'小白', species:'垂耳兔', body:'#cdd6e4', belly:'#f2f4fa', ear:'#b9c4d8', accent:'#c23b3b',
    desc:'红围巾是「十四日」当晚唯一的未解线索，她却不记得任何事。' },
  { id:'raccoon', name:'老浣', species:'浣熊', body:'#8a7a68', belly:'#e6ded2', ear:'#6d5f50', accent:'#3f6b5c',
    desc:'旧城水管工，知道所有地下通道——包括不该存在的。' },
  { id:'fowl', name:'灰鸮', species:'狐鸮', body:'#9fb3c9', belly:'#dce8f2', ear:'#7e93ac', accent:'#2f4c78',
    desc:'事件前最后一卷胶卷，还在他相机里。' },
];

// --------- 升级 ---------
export interface UpgradeDef { id:string; name:string; desc:string; max:number; costs:number[]; }
export const UPGRADES: UpgradeDef[] = [
  { id:'guns', name:'武器改装', desc:'全武器伤害 +15% / 级', max:3, costs:[200,500,1200] },
  { id:'armor', name:'护甲强化', desc:'出击护甲值 +20 / 级', max:3, costs:[150,400,1000] },
  { id:'bag', name:'背包扩容', desc:'资源背包容纳 +4 / 级', max:2, costs:[300,900] },
];

export interface SaveData {
  charId: string;
  gold: number;
  upgrades: Record<string, number>;
  stash: Record<string, number>;      // 仓库（撤离保留的物品/资源）
  lore: string[];                     // 已收集碎片 id
  runs: number; extractions: number; deaths: number;
  seenTutorial: boolean;
  radioDoorOpen: boolean;             // 「第五声」奖励：广播站后门
  bestTime: number;
}

export const DEFAULT_SAVE: SaveData = {
  charId: 'cat', gold: 0, upgrades: { guns:0, armor:0, bag:0 }, stash: {},
  lore: [], runs:0, extractions:0, deaths:0, seenTutorial:false, radioDoorOpen:false, bestTime:0,
};

// --------- 实用 ---------
export function fmt(n: number): string { return n.toLocaleString('zh-CN'); }
