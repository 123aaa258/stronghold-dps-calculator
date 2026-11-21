import { operatorRotation, castClock } from './batches/phase-07-09.ts';
// S2技能结束会主动切换二十秒替身。替身期间仅周围法伤，本体不普通攻击。
export const override = operatorRotation('physical', ({ ctx, effects, slot, skill: s, trait, talent }) => {
  const assumptions = ['单 Boss 场景不额外假设受到致命伤。'];
  if (slot === 2) {
    // 替身期间本体技力锁定，由净增加的等待时间补回。
    const life = trait.duration;
    const clock = castClock(ctx, effects, life);
    const puppet = clock.age >= ctx.level.duration && clock.age < ctx.level.duration + life;
    assumptions.push('替身期间停止本体回技，替身的范围每秒法伤取替身面板。');
    return { effects: puppet ? { ...effects, spRecovery: -ctx.level.increment } : effects,
      idle: puppet ? { body: { type: 'arts', atk: trait.atk, scale: talent(0).atk_scale, fixedInterval: 1, ownerActions: 0 } } : {},
      active: { body: { atk: s.atk, speed: s.attack_speed } },
      breakpoints: clock.starts.flatMap(t => [t + ctx.level.duration, t + ctx.level.duration + life]), assumptions };
  }
  return { active: { body: { atk: s.atk, delay: s.base_attack_time }, extra: slot === 3
    ? [{ label: '生存的重压追击', strike: { scale: s['attack@atk_scale_ex'] } }] : [] },
    assumptions: slot === 3 ? [...assumptions, '默认目标生命比例不低于本体，满足重压的额外物理伤害条件。'] : assumptions };
});
