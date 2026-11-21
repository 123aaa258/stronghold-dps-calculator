import { operatorRotation, castClock } from './batches/phase-07-09.ts';
// 决斗者的技力回复依阻挡状态；钢铁意志结束后的自身晕眩独立于 Boss 免疫。
export const override = operatorRotation('physical', ({ ctx, effects, slot, skill: s, blocked, trait, talent }) => {
  const scale = talent(0).atk_scale;
  const sp = blocked ? talent(1).sp_recovery_per_sec : trait.sp_recover_ratio ?? -1;
  const e = { ...effects, spRecovery: effects.spRecovery + sp };
  const clock = slot === 3 ? castClock(ctx, e) : { starts: [], age: -Infinity };
  const stun = slot === 3 && clock.age + 1e-8 >= ctx.level.duration && clock.age < ctx.level.duration + s.stun - 1e-8;
  return { effects: e, idle: { body: stun ? { type: 'none' } : { scale } },
    active: { body: { scale, atk: s.atk, delay: s.base_attack_time } },
    lifecycle: slot === 1 ? 'permanent' : 'timed', breakpoints: clock.starts.flatMap(t => [t + ctx.level.duration, t + ctx.level.duration + s.stun]),
    assumptions: ['默认森蚺生命值高于一半，应用勇冠三军的伤害倍率。'] };
});
