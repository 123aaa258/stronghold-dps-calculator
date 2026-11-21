import { operatorRotation } from './batches/phase-07-09.ts';
import { stats } from '../../stats.ts';
// 浮游单元从初始倍率起，连续攻击同一个目标逐击累加，达到上限后不再增加。
export const override = operatorRotation('arts', ({ ctx, effects, skill: s, trait, talent }) => {
  const speed = talent(0).attack_speed;
  const interval = stats(ctx.tier.attributes, [...effects.stats, { stat: 'attackSpeed', bucket: 'direct', value: speed, source: 'talent:cammou' }]).attackInterval;
  const scale = Math.min(trait.max_atk_scale, trait.init_atk_scale + trait.delta_atk_scale * Math.floor((ctx.elapsed + 1e-8) / interval));
  const extra = [{ label: '浮游单元', strike: { type: 'arts' as const, scale } }];
  return { idle: { body: { speed }, extra }, active: { body: { atk: s.atk, speed }, extra },
    breakpoints: Array.from({ length: trait.max_stack_cnt }, (_, i) => (i + 1) * interval),
    assumptions: ['浮游单元和本体持续锁定同一目标，解锁或换敌时的倍率重置不会发生。'] };
});
