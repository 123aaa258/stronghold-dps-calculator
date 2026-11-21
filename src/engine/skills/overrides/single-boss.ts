import type { BattleEffects } from '../../effects/common.ts';
import type { DamageType, PhaseResult } from '../../types.ts';
import { damage } from '../../damage.ts';
import { defineRotation } from './rotation.ts';
import { phase } from './shared.ts';
import type { OverrideContext } from './index.ts';
import type { GenericModel } from '../generic.ts';

type Clock = OverrideContext & { elapsed: number; damageEvents: number };
interface AttackOptions {
  atk?: number;
  speed?: number;
  delay?: number;
  scale?: number;
  hits?: number;
  actions?: number;
  fixedInterval?: number;
  effects?: BattleEffects;
}
interface ExtraHit {
  label: string;
  type: DamageType;
  scale?: number;
  flat?: number;
  hits?: number;
  interval?: number;
  independent?: boolean;
}
/** 额外伤害逐段独立过防抗；毒素、装置与反击沿用自己的间隔，不增添本体攻击动作。 */
export function extra(ctx: OverrideContext, effects: BattleEffects, main: PhaseResult, hit: ExtraHit): PhaseResult {
  const attack = (hit.flat ?? 0) + main.stats.atk * (hit.scale ?? 0);
  const physical = { reductionFixed: effects.defReductionFixed, penetrationFixed: effects.defPenetrationFixed, penetrationPct: effects.defPenetrationPct };
  const arts = { reductionFixed: effects.resReductionFixed, penetrationFixed: effects.resPenetrationFixed, penetrationPct: effects.resPenetrationPct };
  const result = damage({ type: hit.type, attack, target: ctx.boss, ...hit.type === 'physical' ? physical : arts,
    modifiers: effects.modifiers, weakness: !hit.independent && effects.weakness ? { source: effects.weakness.source, byType: { physical, arts } } : undefined });
  const hits = hit.hits ?? 1;
  const rate = hits / (hit.interval ?? main.stats.attackInterval);
  const label = hit.label;
  const component = { source: 'talent:' + ctx.operator.charId + ':' + label, label, damageType: result.type,
    perHit: result.perHit, hitsPerSec: rate, hitsPerAttack: rate * main.stats.attackInterval,
    countsTowardDps: true, dps: rate * result.perHit, derivation: [...effects.derivation, ...result.derivation] };
  return { ...main, components: [...main.components, component], dps: main.dps + component.dps };
}
type Rotation = Pick<GenericModel, 'normal' | 'skill'> & Partial<Pick<GenericModel, 'lifecycle' | 'duration' | 'repeatDuration' | 'burst' | 'burstAttack' | 'passive' | 'battle'>> & { assumptions?: string[]; breakpoints?: number[] };
interface Duel {
  ctx: Clock;
  e: BattleEffects;
  b: Record<string,number>;
  s: number;
  t: (index: number, key: string) => number;
  trait: (key: string, fallback?: number) => number;
  attack: (active: boolean, type: DamageType, options?: AttackOptions) => PhaseResult;
  add: (main: PhaseResult, hit: ExtraHit, effects?: BattleEffects) => PhaseResult;
}
export function duel(describe: (input: Duel) => Rotation) {
  return defineRotation((ctx, base) => {
    const e = base.battle!;
    const source = 'skill:' + ctx.skill.skillId;
    const attack: Duel['attack'] = (active, type, opt = {}) => phase(ctx, opt.effects ?? e, {
      active, type, ownerActions: opt.actions ?? (type === 'none' ? 0 : 1), scale: opt.scale, hits: opt.hits,
      interval: ctx.tier.attributes.baseAttackTime + (opt.delay ?? 0), fixedInterval: opt.fixedInterval,
      elapsed: ctx.elapsed, damageEvents: ctx.damageEvents,
      modifiers: [{ stat: 'atk', bucket: 'pct', value: opt.atk ?? 0, source },
        { stat: 'attackSpeed', bucket: 'direct', value: opt.speed ?? 0, source }],
    });
    return describe({ ctx, e, b: ctx.level.blackboard.nums, s: 1 + ctx.operator.skillIds.indexOf(ctx.skill.skillId),
      t: (index, key) => ctx.tier.talents[index]?.blackboard.nums[key] ?? 0,
      trait: (key, fallback = 0) => ctx.tier.trait?.blackboard.nums[key] ?? fallback,
      attack, add: (main, hit, effects = e) => extra(ctx, effects, main, hit) });
  });
}
