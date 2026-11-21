import { firstCrossing } from '../../swift.ts';
import { timeline } from '../../timeline.ts';
import type { SkillOverride } from './index.ts';

/** 两条时间轴使用同一次部署的技能时钟，越过血线时只替换之后的累计伤害。 */
export function hpSwitch(high: SkillOverride, low: SkillOverride, ratio: number, linger = 0): SkillOverride {
  return (ctx, base) => {
    const upper = high(ctx, base), lower = low(ctx, base);
    const targetHp = ctx.targetHp;
    if (targetHp === undefined) return upper;
    let curve: ((t: number) => number) | undefined;
    const model = { ...upper, replayDamage: undefined, customTimeline: (duration: number, hp: number) => {
      const first = timeline(upper, ctx.level, duration, Infinity);
      if (!curve) {
        const second = timeline(lower, ctx.level, duration, Infinity);
        const a = first.at ?? ((t: number) => timeline(upper, ctx.level, t, Infinity).totalDamage);
        const b = second.at ?? ((t: number) => timeline(lower, ctx.level, t, Infinity).totalDamage);
        const at = firstCrossing(a, targetHp * (1 - ratio), targetHp / Math.max(1, upper.normal.dps, upper.skill?.dps ?? 0)) + linger;
        curve = Number.isFinite(at) ? (t => t <= at ? a(t) : a(at) + b(t) - b(at)) : a;
      }
      const totalDamage = curve(duration);
      return { ...first, totalDamage, at: curve, killTimeSec: firstCrossing(curve, hp, hp / Math.max(1, upper.normal.dps)) };
    } };
    return model;
  };
}
