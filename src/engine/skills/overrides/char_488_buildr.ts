import { operatorRotation } from './batches/phase-07-09.ts';
// 工程者之愿首轮限时，第二次变为永久；冲锋号令只回费，不替换普攻。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, trait, blocked }) => {
  const atk = blocked ? trait.atk ?? 0 : 0;
  return { idle: { body: { atk } }, active: { body: slot === 1 ? { type: 'none' } : { atk: atk + s.atk } },
    lifecycle: slot === 1 ? 'instant' : 'timed', duration: slot === 1 ? 0 : ctx.level.duration,
    repeatDuration: slot === 2 ? Infinity : undefined, burst: slot === 1 };
});
