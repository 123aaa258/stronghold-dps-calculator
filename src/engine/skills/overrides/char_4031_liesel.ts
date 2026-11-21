import { operatorRotation, castClock } from './batches/phase-07-09.ts';
// 技能二立即伤害与六秒法伤分开，开技时不会把未来六跳提前打完。
export const override = operatorRotation('arts', ({ ctx, effects, slot, skill: s }) => {
  if (slot === 1) return { active: { body: { scale: s.atk_scale } }, lifecycle: 'instant' };
  const clock = castClock(ctx, effects);
  const duration = s['liesel_s_2[dot].duration'];
  const extra = clock.age >= 0 && clock.age < duration ? [{ label: '直到终曲余音',
    strike: { type: 'arts' as const, scale: s['liesel_s_2[dot].atk_scale'], fixedInterval: 1 } }] : [];
  return { idle: { extra }, active: { body: { scale: s.atk_scale } }, lifecycle: 'instant', burst: true,
    breakpoints: clock.starts.flatMap(t => [t, t + duration]),
    assumptions: ['技能的六秒余音按持续法伤积分，重叠时刷新；单 Boss 不触发溅射三目标天赋。'] };
});
