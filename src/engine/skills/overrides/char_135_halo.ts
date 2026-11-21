import { operatorRotation } from './batches/phase-07-09.ts';
// 科研热忱每隔十五秒增加一层；链术师单目标无后续弹跳。
export const override = operatorRotation('arts', ({ ctx, slot, skill: s, talent }) => {
  const t = talent(0);
  const speed = Math.min(t.max_stack_cnt, Math.floor(ctx.elapsed / t.interval)) * t.attack_speed;
  return { idle: { body: { speed } }, active: { body: { speed, atk: s.atk, scale: s.atk_scale } },
    lifecycle: slot === 1 ? 'instant' : 'timed', breakpoints: Array.from({ length: t.max_stack_cnt }, (_, i) => (i + 1) * t.interval),
    assumptions: ['单个目标只被首段链击命中，第二条攻击链需要另一个目标。'] };
});
