import { judgmentSource } from '../../effects/judgment.ts';
import { renewalCurve, stockAfterCast, swiftRenewal } from '../../swift.ts';
import type { Segment } from '../../timeline.ts';
import type { PhaseResult, SkillLevelData } from '../../types.ts';
import type { GenericModel } from '../generic.ts';

export interface AttackStage extends Segment { phase: PhaseResult }

export function arcaneCycles(model: GenericModel, level: SkillLevelData, cost: number, sp: number,
  wait: (need: number) => number, prefix: AttackStage[], cycles: (seconds: number) => AttackStage[],
  factories: Map<PhaseResult, (count: number) => PhaseResult>) {
  const effects = model.battle!;
  const cap = Math.ceil(effects.resShred!.max / effects.resShred!.perHit);
  const cache = new Map<PhaseResult, Map<number, PhaseResult>>();
  const at = (initial: PhaseResult, count: number) => {
    const stages = cache.get(initial) ?? new Map<number, PhaseResult>();
    cache.set(initial, stages);
    if (!stages.has(count)) stages.set(count, factories.get(initial)!(count));
    return stages.get(count)!;
  };
  const expand = (stages: AttackStage[], initialCount: number) => {
    let count = initialCount, nextHit = 0;
    const parts: Segment[] = [];
    for (const [index, current] of stages.entries()) {
      const interval = current.phase.stats.attackInterval;
      if (current.cast) parts.push({ duration: 0, dps: 0, cast: true });
      // 点燃减抗过期只换面板，不重置普攻时钟；技能切换时假设首次攻击发生在首帧。
      let time = index && stages[index - 1]!.phase !== model.skill && current.phase === model.normal ? nextHit : 0;
      if (time > 0) parts.push({duration: Math.min(time, current.duration), dps: 0});
      while (time < current.duration - 1e-10) {
        if (count >= cap && !Number.isFinite(current.duration)) {
          parts.push({ duration: current.duration - time, dps: at(current.phase, cap).dps });
          time = current.duration;
          break;
        }
        let burst = 0;
        const components = current.phase.components;
        for (let hit = 0; hit < components[0]!.hitsPerAttack; hit++) {
          for (const [position, component] of components.entries()) {
            if (!component.countsTowardDps || component.source === judgmentSource) continue;
            const repeats = component.hitsPerAttack / components[0]!.hitsPerAttack;
            for (let index = 0; index < repeats; index++) {
              const weight = Math.min(1, repeats - index);
              burst += at(current.phase, count).components[position]!.perHit * weight;
              count = Math.min(cap, count + weight);
            }
          }
        }
        for (const component of components) if (component.source === judgmentSource) burst += component.perHit * component.hitsPerAttack;
        parts.push({ duration: Math.min(interval, current.duration - time), dps: 0, burst });
        time += interval;
      }
      nextHit = Math.max(0, time - current.duration);
    }
    return { count, parts };
  };
  const first = expand(prefix, 0);
  model.notes.push('近似：窗口与击杀按每段伤害后叠层，满层后仍按攻击时刻结算；技能切换首帧出手，忽略前摇和弹道。循环DPS按满层阶段伤害率与期望时长折算。');
  const plan = { prefix: first.parts,
    stock: stockAfterCast(sp, cost, level.maxChargeTime), cost, maxCharges: level.maxChargeTime,
    probability: effects.skillEndProbability, reward: effects.skillEndSp, wait, segments: cycles, skillDuration: model.duration,
  };
  const steady = renewalCurve({...plan, segments:seconds=>cycles(seconds).map(stage=>({duration:stage.duration,dps:at(stage.phase,cap).dps}))}).cycle;
  model.customTimeline = (duration, hp) => ({...swiftRenewal({ ...plan,
    counter: { initial: first.count, afterCharge: (count, seconds, stock) => [
      { ...expand(cycles(seconds), count), stock, weight: 1 },
    ] },
  }, duration, hp),cycle:steady});
}
