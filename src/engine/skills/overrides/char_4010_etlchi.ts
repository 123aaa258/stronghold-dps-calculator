import { operatorRotation } from './batches/phase-07-09.ts';
// 同一敌人反复被攻击刷新「萃血」，固定数值每秒单独结算法抗。
export const override = operatorRotation('physical', ({ slot, skill: s, talent }) => {
  const t = talent(0);
  const extra = [{ label: '萃血', strike: { type: 'arts' as const, scale: 0, attackAdd: t.magic_value, fixedInterval: t.interval } }];
  const assumptions = ['目标持续在攻击范围内，萃血按命中刷新；偷取生命上限不计作直接伤害。'];
  if (slot === 1) return { idle: { extra }, active: { body: { scale: s.atk_scale, hits: 2 }, extra }, lifecycle: 'instant', assumptions };
  if (slot === 2) {
    // UOEP「输出」L144、L179 与 Ark-DPS 的双血镰配置均只有一份萃血持续法伤。
    assumptions.push('单人只部署自身位置的一把血镰；持续切割同一目标时刷新一份萃血，不重复叠加。参考 UOEP 绯红壁合双血镰数据。');
    return { idle: { extra }, active: { body: { scale: s.atk_scale, fixedInterval: s.interval, ownerActions: 0 }, extra }, assumptions };
  }
  assumptions.push('心烛与本体目标均在范围内；按心烛伤害传导，暂未跟踪心烛生命耗尽时点。');
  return { idle: { extra }, active: { body: { atk: s.atk, speed: s.attack_speed }, extra: [...extra,
    { label: '心烛传导', strike: { type: 'physical' }, floorRatio: .35 }] }, assumptions };
});
