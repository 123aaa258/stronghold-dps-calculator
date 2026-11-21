import { operatorRotation, castClock } from './batches/phase-07-09.ts';
import { swiftSucceeds } from '../../swift.ts';
import { stats } from '../../stats.ts';
// 减防每次命中叠一层，暴击先乘攻击倍率再扣防。满血起算，无其他干员压血。
export const override = operatorRotation('physical', ({ ctx, effects, slot, skill: s, trait, talent }) => {
  const t = talent(0), speed = trait.attack_speed ?? 0;
  const k = 'attack@demetr_s3[bonus].';
  const activeSpeed = slot === 3 ? s[k + 'attack_speed'] : s.attack_speed ?? 0;
  const interval = (extra: number) => stats(ctx.tier.attributes, [...effects.stats,
    { stat: 'attackSpeed', bucket: 'direct', value: speed + extra, source: 'talent:demetr' }]).attackInterval;
  const base = interval(0), faster = interval(activeSpeed);
  const cap = t['attack@limited_stack_cnt'];
  const stack = Math.min(cap, Math.floor((ctx.elapsed + 1e-8) / base));
  const breaks = Array.from({ length: cap }, (_, i) => (i + 1) * base);
  const clock = slot === 1 ? { age: -Infinity, starts: [] } : castClock(ctx, effects);
  const attacks = Math.max(0, Math.floor((clock.age + 1e-8) / faster));
  const activeCap = slot === 2 ? t['attack@s2_limited_stack_cnt'] : cap;
  const activeStack = Math.min(activeCap, stack + attacks);
  const enemyDef = ctx.boss.attributes?.def ?? 0;
  const reduce = (n: number) => ({ ...effects, defReductionFixed: effects.defReductionFixed - enemyDef * t['attack@def'] * n });
  const crit = slot === 3 && swiftSucceeds(attacks, s[k + 'prob']);
  if (slot > 1) for (const start of clock.starts) for (let i = 0; i * faster < ctx.level.duration; i++) breaks.push(start + i * faster);
  return { idle: { body: { speed }, effects: reduce(stack) }, active: { body: { speed: speed + activeSpeed,
    atk: slot === 3 ? s[k + 'atk'] : 0, hits: slot === 1 ? 2 : 1,
    scale: slot === 3 ? crit ? s[k + 'prob_atk_scale'] : 1 : s.atk_scale ?? s['attack@atk_scale'] }, effects: reduce(activeStack) },
    lifecycle: slot === 1 ? 'instant' : 'timed', breakpoints: breaks,
    assumptions: ['单目标持续受击，减防按段数叠层并刷新；未追踪目标血量对应的逐步增伤。清算的概率按每轮技能内攻击序号使用固定序列。'] };
});
