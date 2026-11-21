import { stockAfterCast, swiftRenewal, swiftRefundSucceeds } from '../../swift.ts';
import type { BattleEffects } from '../../effects/common.ts';
import type { Segment } from '../../timeline.ts';
import type { SkillLevelData } from '../../types.ts';
import type { GenericModel } from '../generic.ts';
import type { ShredClock } from '../../effects/shred-clock.ts';

/** prefix 到第一次技能结束；后续每次施放分别从成功、失败后的实际库存开始。 */
export function swiftCycles(model: GenericModel, level: SkillLevelData, cost: number, initial: number,
  prefix: Segment[], wait: (need: number) => number, segments: (recovery: number, elapsed: number) => Segment[],
  stableAfter = 0, clock?: ShredClock, initialCount = clock?.count ?? 0) {
  const e = model.battle;
  if (!e?.skillEndProbability || !e.skillEndSp || !Number.isFinite(prefix.reduce((t,s) => t + s.duration, 0))) return;
  const maxCharges = Math.max(1, level.maxChargeTime);
  const discreteSp = level.spType === 'ON_ATTACK';
  const stock = stockAfterCast(initial, cost, maxCharges, discreteSp);
  model.customTimeline = (duration, hp) => swiftRenewal({
    independentCycles:stableAfter === 0 && !clock?.cap,
    prefix, stock, cost, maxCharges, discreteSp, reward: e.skillEndSp, probability: e.skillEndProbability,
    wait, segments, stableAfter, skillDuration: model.duration,
    // 零时长技能被回技立即续开时，两次施放至少间隔一个攻击间隔（与通用时间轴同一口径）。
    minCycle: model.duration > 0 ? 0 : (model.skill ?? model.normal).stats.attackInterval,
    counter: clock?.cap ? { initial: initialCount, afterCharge: (count, seconds, stock, elapsed) => {
      clock.reset(count);
      const parts = segments(seconds, elapsed);
      return [{count:clock.count, parts, stock, weight:1}];
    } } : undefined,
  }, duration, hp);
}

/**
 * 独立时间轴的逐次迅捷回技：第 k 次技能真实结束时按固定判定序列判定一次，返回距下次施放所需的回复秒数。
 * 回技足以立即续开零时长技能时，两次施放至少间隔 lock 秒（一个攻击间隔，模型假设）。
 */
export function swiftRecovery(e: BattleEffects, cost: number, rate: number, lock: number, zeroDuration: boolean) {
  const probability = e.skillEndSp ? e.skillEndProbability : 0;
  return (k: number, endTime: number) => {
    const gained = swiftRefundSucceeds(k, probability, endTime) ? e.skillEndSp : 0;
    const need = Math.max(0, cost - gained);
    if (need <= 1e-9) return zeroDuration ? lock : 0;
    return rate > 0 ? need / rate : Infinity;
  };
}
