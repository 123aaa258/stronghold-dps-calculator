import type { BondData, BondSetting } from '../../engine/types';

/**
 * 激活后带「忽略 / 直接按上限 / 默认敌人……」假设的盟约效果。
 * tier：'active' = 激活档起生效，'power' = 强化档起生效；defaultBand：只在默认策略（非裁度等策略版）时适用。
 */
const NOTES: { bondId: string; tier: 'active' | 'power'; text: string; defaultBand?: boolean }[] = [
  { bondId: 'yanShip', tier: 'power', text: '6 人随机元素损伤忽略' },
  { bondId: 'sargonShip', tier: 'active', text: '攻击速度直接按叠满（+300）计算' },
  { bondId: 'sargonShip', tier: 'power', text: '默认敌人始终位于流沙上' },
  { bondId: 'kjeragShip', tier: 'active', text: '默认敌人始终处于寒冷或冻结' },
  { bondId: 'kjeragShip', tier: 'power', text: '雪人伤害忽略' },
  { bondId: 'siracusaShip', tier: 'power', text: '默认敌人始终处于 2 种以上异常状态', defaultBand: true },
  { bondId: 'kazimierzShip', tier: 'active', text: '攻击力直接按叠到上限计算' },
  { bondId: 'kazimierzShip', tier: 'power', text: '被击倒后召唤干员的效果忽略' },
  { bondId: 'ursusShip', tier: 'active', text: '临时层数与阻挡敌人的法术伤害忽略' },
  { bondId: 'iberiaShip', tier: 'active', text: '持续法术伤害直接按叠满计算' },
  { bondId: 'iberiaShip', tier: 'power', text: '弹射忽略' },
  { bondId: 'lethaniaShip', tier: 'active', text: '「一个乐部」攻速提升忽略（无法确定场上召唤物数量）' },
  { bondId: 'skillfulShip', tier: 'active', text: '默认干员处于【灵巧】干员周围' },
  { bondId: 'steadShip', tier: 'power', text: '只计脆弱增伤，反伤忽略' },
  { bondId: 'raidShip', tier: 'active', text: '默认【突袭】干员吃到再部署加攻' },
  { bondId: 'arcaneShip', tier: 'power', text: '默认敌人已叠满法术抗性降低' },
];

/**
 * 当前设置下生效的假设说明，每条形如「【谢拉格】默认敌人始终处于寒冷或冻结」。
 * `relevant` 用于只保留对当前干员有效的盟约（计算器）；排行页不传，列出全部已激活的。
 */
export function assumedNotes(settings: BondSetting[], byId: Map<string, BondData>, relevant: (bondId: string) => boolean = () => true): string[] {
  const set = new Map(settings.map((s) => [s.bondId, s]));
  const out: string[] = [];
  for (const n of NOTES) {
    const s = set.get(n.bondId), b = byId.get(n.bondId);
    if (!s || !b || !relevant(n.bondId)) continue;
    const need = n.tier === 'power' ? b.powerCount ?? Infinity : b.activeCount;
    if (s.activeChars < need || (n.defaultBand && s.bandId)) continue;
    out.push(`【${b.name}】${n.text}`);
  }
  return out;
}
