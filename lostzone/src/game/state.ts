// ============ 存档 & 对局状态 ============
import { SaveData, DEFAULT_SAVE, ITEMS, CHARS, UPGRADES } from '../core/defs';

const KEY = 'lostzone.save.v1';

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_SAVE);
    const s = JSON.parse(raw) as SaveData;
    return { ...structuredClone(DEFAULT_SAVE), ...s };
  } catch { return structuredClone(DEFAULT_SAVE); }
}
export function storeSave(s: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// ---------- 对局背包 ----------
export interface Slot { item: string; count: number; id: number }
export interface RunState {
  hp: number; maxHp: number; armor: number; maxArmor: number;
  slots: (Slot | null)[];      // 快速栏 6
  bag: Record<string, number>; // 资源袋
  bagCap: number;
  ammo: number;                // 备弹
  keys: Record<string, boolean>;
  hasPowercell: boolean;
  hasTape: boolean;
  infoMult: number;            // 「第五声」情报倍率
  time: number;                // 对局时长(秒)
  goals: Record<string, boolean>;
  slotSeq: number;
}

export const BAG_CAP = 8;
export const HOTBAR = 6;

export function newRun(upgrades: Record<string, number>, charId: string, loadout: string[]): RunState {
  const st: RunState = {
    hp: 100, maxHp: 100,
    armor: 0, maxArmor: 40 + (upgrades.armor || 0) * 20,
    slots: new Array(HOTBAR).fill(null),
    bag: {}, bagCap: BAG_CAP + (upgrades.bag || 0) * 4,
    ammo: 30, keys: {}, hasPowercell: false, hasTape: false,
    infoMult: 1, time: 0, goals: {}, slotSeq: 1,
  };
  // 出击配置：砍刀 + 库存武器/护甲
  const guns = loadout.filter(i => i && ITEMS[i]?.kind === 'gun');
  const armors = loadout.filter(i => i && ITEMS[i]?.kind === 'armor');
  addSlot(st, 'cleaver');
  if (guns[0]) addSlot(st, guns[0]);
  if (armors[0]) { st.maxArmor = ITEMS[armors[0]].armorVal! + (upgrades.armor || 0) * 20; st.armor = st.maxArmor; }
  // 罐头打底
  addBag(st, 'can', 2);
  return st;
}

export function addSlot(st: RunState, item: string): boolean {
  for (let i = 0; i < st.slots.length; i++) {
    if (!st.slots[i]) { st.slots[i] = { item, count: 1, id: st.slotSeq++ }; return true; }
  }
  return false;
}
export function removeSlot(st: RunState, idx: number) { st.slots[idx] = null; }

export function addBag(st: RunState, item: string, n: number): number {
  const def = ITEMS[item]; if (!def) return 0;
  const cur = st.bag[item] || 0;
  const can = Math.min(def.stack - cur, n);
  const added = Math.max(0, Math.min(can, st.bagCap - bagCount(st)));
  if (added > 0) st.bag[item] = cur + added;
  return added;
}
export function bagCount(st: RunState): number {
  return Object.values(st.bag).reduce((a, b) => a + b, 0);
}

// ---------- 出击装备自动配置 ----------
export function autoLoadout(save: SaveData): string[] {
  const items = Object.keys(save.stash).filter(k => save.stash[k] > 0);
  const gun = items.find(i => ITEMS[i]?.kind === 'gun');
  const armor = items.find(i => ITEMS[i]?.kind === 'armor');
  return [gun || '', armor || ''];
}

export function upgradeCost(id: string, lv: number): number | null {
  const u = UPGRADES.find(u => u.id === id)!;
  if (lv >= u.max) return null;
  return u.costs[lv];
}
export function charById(id: string) { return CHARS.find(c => c.id === id) ?? CHARS[0]; }
