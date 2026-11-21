import { artsFraction, damage, type CombatTarget } from './damage.ts';
import { leftLimit } from './timeline.ts';
import type { BattleEffects } from './effects/common.ts';
import { burningProfile } from './effects/elemental.ts';
import type { GenericModel } from './skills/generic.ts';
import { firstCrossing } from './swift.ts';
import type { TimelineResult } from './timeline.ts';
import type { PhaseResult } from './types.ts';

type Curve = (t: number) => number;

/** 专属模型自带灼燃条的干员：装备的灼燃损伤需要并入同一条元素条，这里不另起一条。 */
const ownBurning = new Set(['char_1040_blaze2', 'char_4247_oxi', 'char_2026_yu']);

function memo(at: Curve): Curve {
  const cache = new Map<number, number>();
  return t => {
    let v = cache.get(t);
    if (v === undefined) { v = at(t); cache.set(t, v); }
    return v;
  };
}

/**
 * 按部署后时间变化的伤害倍率：[from, until) 内造成的伤害整体 ×scale。
 * 倍率与其他增伤分区相乘，等价于把这段时间内的累计伤害增量放大。
 */
export function scaledCurve(at: Curve, steps: BattleEffects['timedDamageScale']): Curve {
  return t => {
    let sum = at(t);
    for (const s of steps) {
      if (t < s.from) continue;
      // 部署瞬间（0 秒）的瞬时伤害也在倍率内。
      const start = leftLimit(at, s.from);
      const end = t < s.until ? at(t) : leftLimit(at, s.until);
      sum += (s.scale - 1) * (end - start);
    }
    return sum;
  };
}

export interface BurningOptions {
  /** 每 1 点伤害积累的灼燃损伤（比例 × 法术伤害占比 × 元素抗性折算）。 */
  rate: number;
  threshold: number;
  /** 爆条后的锁条时长（秒），期间不积累、法术抗性降低。 */
  lock: number;
  burst: number;
  /** 法术伤害在锁条期间的增量：(减抗后 / 减抗前 − 1) × 法术伤害占比。 */
  windowGain: number;
  /** 逐次求爆条时刻的时间上限；之后按已求出的平均速率延续。 */
  horizon: number;
}
/** 在累计伤害曲线上推进灼燃条：按累计伤害求每次爆条时刻，计入爆发伤害和锁条期间的减抗增伤。 */
export function burningCurve(at: Curve, o: BurningOptions) {
  const bursts: number[] = [];
  let resume = 0;
  let done = !(o.rate > 0);
  const ensure = () => {
    while (!done && resume <= o.horizon) {
      const target = at(resume) + o.threshold / o.rate;
      const hit = firstCrossing(at, target, Math.max(resume + 1, 1));
      if (!Number.isFinite(hit) || hit > o.horizon) { done = true; break; }
      bursts.push(hit);
      resume = hit + o.lock;
    }
  };
  const part = (b: number, t: number) => t < b ? 0 : o.burst + o.windowGain * (at(Math.min(t, b + o.lock)) - at(b));
  let steady: number | undefined;
  const steadyRate = () => {
    if (steady !== undefined) return steady;
    ensure();
    if (bursts.length >= 2) {
      const period = (bursts.at(-1)! - bursts[0]!) / (bursts.length - 1);
      const each = bursts.slice(0, -1).reduce((n, b) => n + part(b, b + o.lock), 0) / (bursts.length - 1);
      steady = period > 0 ? each / period : 0;
    } else steady = o.horizon > 0 ? extraUpTo(o.horizon) / o.horizon : 0;
    return steady;
  };
  const extraUpTo = (t: number) => bursts.reduce((n, b) => n + part(b, t), 0);
  const extra = (t: number) => {
    ensure();
    const within = extraUpTo(Math.min(t, o.horizon));
    return t > o.horizon ? within + (t - o.horizon) * steadyRate() : within;
  };
  return { at: (t: number) => at(t) + extra(t), bursts: () => { ensure(); return [...bursts]; } };
}

const artsDps = (phase: PhaseResult | null | undefined) =>
  phase?.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps * artsFraction(c) : 0), 0) ?? 0;

/** 法术伤害占全部伤害的比例：有技能循环时按循环内普攻期与技能期的时长加权。 */
export function artsShare(model: Pick<GenericModel, 'normal' | 'skill'>, cycle: TimelineResult['cycle']) {
  const recover = cycle?.spRecoverSec ?? 0;
  const active = cycle?.skillDurationSec ?? 0;
  if (model.skill && cycle && Number.isFinite(recover + active) && recover + active > 0) {
    const total = model.normal.dps * recover + model.skill.dps * active;
    return total > 0 ? (artsDps(model.normal) * recover + artsDps(model.skill) * active) / total : 0;
  }
  return model.normal.dps > 0 ? artsDps(model.normal) / model.normal.dps : 0;
}

interface CurveInput {
  external: BattleEffects;
  boss: CombatTarget;
  model: GenericModel;
  cycle: TimelineResult['cycle'];
  raw: Curve;
  durationSec: number;
  operator: string;
}
/** 装备中随时间变化的部分（竞技旗倍率、灼燃条），叠加在时间过程的累计伤害曲线上。无此类装备时返回 undefined。 */
export function equipCurve({ external, boss, model, cycle, raw, durationSec, operator }: CurveInput): { at: Curve; notes: string[]; assumptions: string[] } | undefined {
  const notes: string[] = [];
  const assumptions: string[] = [];
  const burning = external.burning && !model.ownsBurning && !ownBurning.has(operator) ? external.burning : undefined;
  if (external.burning && !burning) assumptions.push('【灼燃维式重锤】装备损伤与本体灼燃共用同一条元素条和爆发冷却');
  if (!external.timedDamageScale.length && !burning) return assumptions.length ? { at: raw, notes, assumptions } : undefined;
  let at = memo(raw);
  if (external.timedDamageScale.length) at = memo(scaledCurve(at, external.timedDamageScale));
  if (burning) {
    const profile = burningProfile(boss);
    const share = artsShare(model, cycle);
    // 锁条期间法术抗性 -20：同一目标参数下减抗前后的法术伤害之比，与攻击力无关。
    const artsHit = (extra: number) => damage({ attack: 1000, type: 'arts', target: boss,
      reductionFixed: external.resReductionFixed + extra, penetrationFixed: external.resPenetrationFixed, penetrationPct: external.resPenetrationPct }).perHit;
    const base = artsHit(0);
    const gain = base > 0 ? artsHit(profile.resistanceReduction) / base - 1 : 0;
    const curve = burningCurve(at, { rate: burning.ratio * share * profile.buildupMultiplier, threshold: profile.threshold, lock: profile.duration,
      burst: profile.burstDamage, windowGain: gain * share, horizon: Math.max(180, durationSec) });
    at = curve.at;
    notes.push('近似：灼燃损伤按法术伤害在全部伤害中的循环平均占比积累，减抗增伤按同一占比折算；未计技能自身的减抗与穿透对减抗收益的影响');
  }
  return { at, notes, assumptions };
}
