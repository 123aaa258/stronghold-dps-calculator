import type { OverrideContext, SkillOverride } from './index.ts';
import type { GenericModel } from '../generic.ts';
import type { DamageType } from '../../types.ts';
import { overrideBase, phase, type PhaseOptions } from './shared.ts';
import type { BattleEffects } from '../../effects/common.ts';

/** 逐次攻击的时间轴只需建立实际用到的面板，判定序号、层数和技力另行随时间更新。 */
export function duelAttack(ctx: OverrideContext, e: BattleEffects, active: boolean, type: DamageType,
  atk = 0, speed = 0, opts: PhaseOptions = {}) {
  const source = 'skill:' + ctx.skill.skillId;
  return phase(ctx, e, { ownerActions: type === 'none' ? 0 : 1, active, type, ...opts, modifiers: [
    { stat: 'atk', bucket: 'pct', value: atk, source }, { stat: 'attackSpeed', bucket: 'direct', value: speed, source },
    ...opts.modifiers ?? []] });
}
export function actionModel(assumptions: string[], make: (ctx: OverrideContext, model: GenericModel) => GenericModel): SkillOverride {
  return (ctx, generic) => {
    const model = overrideBase(generic);
    model.assumptions = [...assumptions];
    model.notes.push(...assumptions.map(s => '近似：' + s));
    const built = make(ctx, model);
    for (const p of [built.normal, built.skill]) if (p?.components[0]) {
      p.components[0].derivation.push(...(built.assumptions ?? []).map(label => ({ label, op:'info' as const, value:1, source:'skill:' + ctx.skill.skillId })));
    }
    return built;
  };
}
