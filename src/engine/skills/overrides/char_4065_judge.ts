import { operatorRotation } from './batches/phase-07-09.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
// 荆棘环身读取本阶段攻击力，按 Boss 受击时钟结算，不随本体攻速。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, talent }) => {
  const reflect = { label: '荆棘环身', strike: { type: 'arts' as const, scale: talent(1).atk_scale, fixedInterval: bossAttackInterval(ctx.boss).interval } };
  const idle = { extra: [reflect] };
  const assumptions = ['Boss 持续攻击斥罪，荆棘环身按自身屏障存在计算；屏障破裂与重建的时点取决于承伤。'];
  if (slot === 1) return { idle, active: { extra: [reflect, { label: '一锤定音附伤', strike: { type: 'arts', scale: s.atk_scale_2 } }] },
    lifecycle: 'instant', assumptions: [...assumptions, '自动就绪即攻击，未等第二份技力蓄力。'] };
  if (slot === 2) return { idle, active: { body: { type: 'arts', scale: s.atk_scale, fixedInterval: 1, ownerActions: 0 }, extra: [reflect] }, assumptions };
  return { idle, active: { body: { atk: s.atk, delay: s.base_attack_time }, extra: [reflect] }, assumptions };
});
