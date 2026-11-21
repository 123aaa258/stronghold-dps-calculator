import { operatorRotation, castClock } from './batches/phase-07-09.ts';
import { stats } from '../../stats.ts';
// 第二次以后开技的攻速与每轮攻击后的叠攻分别计数，单目标不接受自身的溅射。
export const override = operatorRotation('physical', ({ ctx, effects, slot, skill: s, talent }) => {
  const atk = talent(1).atk ?? 0;
  if (slot === 1) return { idle: { body: { atk } }, active: { body: { atk, scale: s.atk_scale } }, lifecycle: 'instant' };
  const clock = castClock(ctx, effects);
  const interval = stats({ ...ctx.tier.attributes, baseAttackTime: ctx.tier.attributes.baseAttackTime + (s.base_attack_time ?? 0) },
    [...effects.stats, ...effects.skillStats]).attackInterval;
  const cap = s['attack@max_stack_cnt'] ?? 0;
  const layers = Math.min(cap, Math.max(0, Math.floor((clock.age + 1e-8) / interval)));
  const speed = slot === 2 ? s.attack_speed + Math.min(s.max_stack_cnt, Math.max(0, clock.count - 1)) * s.attack_speed_extra : 0;
  return { idle: { body: { atk } }, active: { body: { atk: atk + s.atk + layers * (s['attack@atk'] ?? 0), speed, delay: s.base_attack_time } },
    breakpoints: clock.starts.flatMap(t => Array.from({ length: cap + 1 }, (_, i) => t + i * interval)),
    assumptions: ['单 Boss 无击杀回技；无额外三个溅射目标，模组的范围加攻不触发。'] };
});
