import type { BondData } from '../../engine/types';

/** 盟约档位：界面用档位按钮代替「在场人数」输入。value 写入 BondSetting.activeChars。 */
export interface BondTier {
  value: number;
  label: string;
  /** 策略版本（BondData.variants，如叙拉古「裁度」）；与同人数的默认档互斥。 */
  bandId?: string;
}

const BINARY = new Set(['egirShip', 'ursusShip', 'lethaniaShip', 'emptyShip', 'soloShip']);

export function bondTiers(b: BondData): BondTier[] {
  const nums = b.buffs[0]?.blackboard.nums ?? {};
  let counts: number[];
  let unit = '人';
  if (b.bondId === 'suntShip') {
    // 绝技：「在场 2 名精锐…攻击力+30%；在场 5 名精锐…技力消耗-30%」
    counts = [nums.power_char_cnt ?? 2, nums.ex_char_cnt ?? 5];
    unit = '精锐';
  } else {
    counts = [b.activeCount, ...(b.powerCount !== null && b.powerCount > b.activeCount ? [b.powerCount] : [])];
  }
  const tiers: BondTier[] = [{ value: 0, label: '不激活' }];
  // 只分激活与否的盟约：更高档位的效果不计入（阿戈尔、乌萨斯、莱塔尼亚、协防、独行）
  if (BINARY.has(b.bondId)) return [...tiers, { value: b.activeCount, label: '激活' }];
  // 坚守只计 3 人档的脆弱，2 人档（加生命）与 DPS 无关
  if (b.bondId === 'steadShip' && b.powerCount !== null) return [...tiers, { value: b.powerCount, label: `${b.powerCount} 人` }];
  if (b.activeCount <= 1 && counts.length === 1) tiers.push({ value: counts[0], label: '激活' });
  else for (const n of counts) tiers.push({ value: n, label: `${n} ${unit}` });
  // 策略替换的强化效果单独成一档（如「6 人·裁度」），选它时 activeChars 同强化档、另写 bandId
  if (b.powerCount !== null) for (const v of b.variants ?? []) tiers.push({ value: b.powerCount, label: `${b.powerCount} ${unit}·${v.bandName}`, bandId: v.bandId });
  return tiers;
}

/**
 * 全场盟约区（本干员不是成员）只列对非成员有效的档位。
 * 奥术、精准的 2 人效果只有成员吃得到，对其他干员只有「不激活 / 3 人」两档（玩家口径）。
 * 已存的 2 人设置在这里按「不激活」显示，与引擎对非成员的结算一致。
 */
const TEAM_POWER_ONLY = new Set(['arcaneShip', 'preciShip']);
export function teamTiers(b: BondData): BondTier[] {
  const all = bondTiers(b);
  if (!TEAM_POWER_ONLY.has(b.bondId) || b.powerCount === null) return all;
  return all.filter((t) => t.value === 0 || t.value >= b.powerCount!);
}

/** 当前 activeChars 落在哪一档（取不超过它的最高档） */
export function currentTier(tiers: BondTier[], activeChars: number): number {
  let v = 0;
  for (const t of tiers) if (t.value <= activeChars) v = t.value;
  return v;
}

/** 当前选中的是哪个档位按钮：人数相同时按 bandId 区分默认版与策略版（bandId 只在当前档确有该版本时算数） */
export function tierSelected(tiers: BondTier[], t: BondTier, tier: number, bandId: string | undefined): boolean {
  if (t.value !== tier) return false;
  const band = bandId && tiers.some((x) => x.value === tier && x.bandId === bandId) ? bandId : undefined;
  return t.bandId === band;
}

/** 层数是否影响该盟约（无层数相关键的盟约不显示层数条） */
export function hasStacks(b: BondData): boolean {
  return b.buffs.some((f) => Object.keys(f.blackboard.nums).some((k) => /per_stack|stack_cnt|layer/.test(k)));
}

export const ATK_MAX = 99999;
export const STACK_MAX = 999;
