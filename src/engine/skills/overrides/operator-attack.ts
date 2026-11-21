import { sequenceTimeline, type AttackSequence } from './attack-sequence.ts';
import { resolveTokenTier } from '../../operator-state.ts';
import type { TokenData } from '../../types.ts';
import type { BattleEffects } from '../../effects/common.ts';
import { battleEffects } from '../../effects/common.ts';
import { isBlocked, phase, type PhaseOptions } from './shared.ts';
import { defineRotation } from './rotation.ts';
import type { DamageType, PhaseResult, SkillLifecycle } from '../../types.ts';
import type { StatModifier } from '../../stats.ts';
import type { OverrideContext } from './index.ts';

type StageOptions = PhaseOptions & { atk?: number; speed?: number; defPen?: number; defDown?: number; fragile?: number };
type Stage = (active: boolean, options?: StageOptions) => PhaseResult;
type Addition = (parent: PhaseResult, active: boolean, label: string, options: StageOptions) => PhaseResult;
export type RotationScene = {
  ctx: OverrideContext; e: BattleEffects; n: number; b: Record<string, number>; trait: Record<string, number>;
  talent: (index: number) => Record<string, number>; blocked: boolean; elapsed: number;
  hit: Stage; add: Addition; token: (parent:PhaseResult, data:TokenData, kind:DamageType, atk?:number, speed?:number) => PhaseResult; notes: string[];
};
export interface AttackRotation {
  normal: PhaseResult; skill: PhaseResult | null; lifecycle?: SkillLifecycle; duration?: number;
  burst?: boolean; burstAttack?: boolean; passive?: boolean; breakpoints?: number[]; sequence?: AttackSequence;
  expectedSwiftDamage?: (durationSec: number) => number;
}
/** 本体动作接入装备逐击结算；独立持续伤害与召唤物沿用目标修正，不重复触发本体装备。 */
export function operatorAttack(type: DamageType, configure: (scene: RotationScene) => AttackRotation) {
  const buildRotation = defineRotation((ctx, base) => {
    const original = base.battle ?? battleEffects();
    const e = { ...original };
    const source = `skill:${ctx.skill.skillId}`;
    const notes: string[] = [];
    const build = (active: boolean, opts: StageOptions, side: boolean) => {
      const modifiers: StatModifier[] = [...opts.modifiers ?? []];
      if (opts.atk) modifiers.push({ stat:'atk', bucket:'pct', value:opts.atk, source });
      if (opts.speed) modifiers.push({ stat:'attackSpeed', bucket:'direct', value:opts.speed, source });
      const battle = { ...e, defPenetrationFixed:e.defPenetrationFixed + (opts.defPen ?? 0),
        defReductionFixed:e.defReductionFixed + (opts.defDown ?? 0) };
      if (opts.fragile) battle.modifiers = [...battle.modifiers, { group:'脆弱', kind:'fragile', value:opts.fragile, source }];
      if (side) {
        battle.extraHits = []; battle.dots = []; battle.splash = undefined; battle.atkProc = undefined;
        battle.attackScale = 1;
      }
      return phase(ctx, battle, { type, ...opts, modifiers, active, elapsed:ctx.elapsed, damageEvents:ctx.damageEvents,
        ownerActions: side || (opts.type ?? type) === 'none' ? 0 : opts.ownerActions ?? 1 });
    };
    const hit: Stage = (active, opts = {}) => build(active, opts, false);
    const add: Addition = (parent, active, label, opts) => {
      const component = build(active, opts, true).components[0]!;
      const components = [...parent.components, { ...component, label, source:`${source}:${label}` }];
      return { ...parent, components, dps:parent.dps + component.dps };
    };
    const token: RotationScene['token'] = (parent, data, kind, atk = 0, speed = 0) => {
      const companion = resolveTokenTier(data, ctx.operator, ctx.tier);
      if (!companion) return parent;
      const battle = { ...battleEffects(), resReductionFixed:e.resReductionFixed, defReductionFixed:e.defReductionFixed,
        stats:e.stats.filter(s => s.source.includes('lethaniaShip')),
        modifiers:e.modifiers.filter(m => m.kind === 'fragile'), resShred:e.resShred };
      const p = phase({ ...ctx, tier:{ ...ctx.tier, attributes:companion.attributes } }, battle, { type:kind,
        damageEvents:ctx.damageEvents, modifiers:[{ stat:'atk', bucket:'pct', value:atk, source }, { stat:'attackSpeed', bucket:'direct', value:speed, source }] });
      const part = { ...p.components[0]!, label:data.name, source:'token:' + data.tokenId };
      return { ...parent, dps:parent.dps + part.dps, components:[...parent.components, part] };
    };
    const n = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
    const result = configure({ ctx, e, n, b:ctx.level.blackboard.nums, trait:ctx.tier.trait?.blackboard.nums ?? {},
      talent:index => ctx.tier.talents.find(t => t.index === index)?.blackboard.nums ?? {},
      blocked:isBlocked(ctx.boss), elapsed:ctx.elapsed, hit, add, token, notes });
    return { ...result, battle:e, assumptions:notes };
  });
  const result: typeof buildRotation = (ctx, generic) => {
    const model = buildRotation(ctx, generic) as ReturnType<typeof buildRotation> & { sequence?:AttackSequence };
    if (model.sequence) {
      model.customTimeline = sequenceTimeline(model, ctx.level);
      model.replayDamage = duration => sequenceTimeline(model, ctx.level, duration);
    }
    return model;
  };
  return result;
}
/** 强力击替代一次普攻；独立瞬发在施放点结算。 */
export function instant(normal: PhaseResult, skill: PhaseResult, replacesAttack = false): AttackRotation {
  return { normal, skill, lifecycle:'instant', burst:!replacesAttack, burstAttack:!replacesAttack && skill.components[0]?.countsTowardDps,
    passive:false, duration:replacesAttack ? skill.stats.attackInterval : 0 };
}
/** 逐层按真实攻击间隔计算持续阶段内的伤害，最后一个不完整间隔按占用时间加权。 */
export function rampPhase(seconds: number, limit: number, build: (stack: number) => PhaseResult, step?: number): PhaseResult {
  const opening = build(0);
  const components = opening.components.map(c => ({ ...c, dps:0, hitsPerSec:0 }));
  let left = seconds;
  for (let k = 0; left > 1e-9; k++) {
    const part = k === 0 ? opening : build(k);
    const duration = k >= limit ? left : Math.min(left, step ?? part.stats.attackInterval);
    part.components.forEach((c, i) => {
      components[i]!.dps += c.dps * duration / seconds;
      components[i]!.hitsPerSec += c.hitsPerSec * duration / seconds;
    });
    left -= duration;
  }
  return { stats:opening.stats, components, dps:components.reduce((sum, c) => sum + c.dps, 0) };
}
