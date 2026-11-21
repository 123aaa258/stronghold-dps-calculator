import type { GenericModel } from '../generic.ts';
import type { OverrideContext, SkillOverride } from './index.ts';
import { record } from '../../effects/common.ts';
import { overrideBase } from './shared.ts';

type Rotation = Pick<GenericModel, 'normal' | 'skill'> & Partial<GenericModel>;
type RotationContext = OverrideContext & { elapsed: number; damageEvents: number };

/** 干员定义各阶段的攻击方式，共用时间轴负责回技、叠层与限时属性切换。 */
export function defineRotation(build: (context: RotationContext, base: GenericModel) => Rotation): SkillOverride {
  return (context, generic) => {
    const base = { ...overrideBase(generic, true), ignoredKeys: generic.ignoredKeys };
    const make = (elapsed: number, damageEvents: number, battle = base.battle) => {
      const config = build({ ...context, elapsed, damageEvents }, { ...base, battle });
      const model = { ...base, ...config, nativeRotation: true };
      if (config.duration === undefined && model.skill && model.lifecycle === 'instant' && !model.burst) {
        model.duration = model.skill.stats.attackInterval;
      }
      if (config.assumptions?.length) {
        model.notes = [...model.notes, ...config.assumptions.map(note => '近似：' + note)];
        const info = { derivation: [] as typeof model.normal.stats.derivation.atk };
        for (const note of config.assumptions) record(info, 'skill:' + context.skill.skillId, note, 1);
        for (const part of new Set([model.normal, model.skill])) {
          const first = part?.components[0];
          if (first) first.derivation = [...first.derivation, ...info.derivation];
        }
      }
      return model;
    };
    const model = make(0, 0);
    const e = model.battle!;
    if (model.breakpoints?.length || e.timedStats.length || e.stacks.length || e.bondStacks || e.judgment || e.resShred) {
      model.rebuild = (stackStats, elapsed, damageEvents) => {
        const original = base.battle!.bondStacks ? context.effectsAt!(damageEvents) : base.battle!;
        return make(elapsed, damageEvents, { ...original, stats: [...original.stats, ...stackStats],
          timedStats: original.timedStats.filter(item => elapsed < item.until) });
      };
    }
    return model;
  };
}
