import { operatorRotation, mass } from './batches/phase-07-09.ts';
// 重量天赋与勾索模组分别按目标原始重量和实际移动距离触发。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, talent }) => {
  const t = talent(1);
  const scale = (mass(ctx) ?? Infinity) <= t.value ? t.atk_scale : 1;
  const idle = { body: { scale } };
  const assumptions = ['静止单目标按无拖拽距离，拖拽模组的按距离法伤为零。'];
  if (slot === 1) return { idle, active: { body: { scale: scale * s.atk_scale } }, lifecycle: 'instant', assumptions };
  if (slot === 2) return { idle, active: { body: { scale: scale * s['attack@atk_scale'], delay: s.base_attack_time } }, assumptions };
  return { idle, active: { body: { type: 'arts', scale: scale * s.atk_scale, fixedInterval: s.interval, ownerActions: 0 } }, assumptions };
});
