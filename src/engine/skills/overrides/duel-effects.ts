import tokens from '../../../data/generated/tokens.json' with { type: 'json' };
import { resolveTokenTier } from '../../operator-state.ts';
import type { DamageType, PhaseResult, TokenData } from '../../types.ts';
import type { OverrideContext } from './index.ts';
import type { BattleEffects } from '../../effects/common.ts';
import { extra } from './single-boss.ts';

export function token(ctx: OverrideContext, id: keyof typeof tokens) {
  return resolveTokenTier(tokens[id] as TokenData, ctx.operator, ctx.tier)!;
}
/** 召唤物保留施加于目标的效果，不继承本体装备、无视防御或弱点转换。 */
export function tokenEffects(e: BattleEffects): BattleEffects {
  return { ...e, weakness: undefined, defPenetrationFixed: 0, defPenetrationPct: 0,
    resPenetrationFixed: 0, resPenetrationPct: 0, modifiers: e.modifiers.filter(m => m.kind === 'fragile') };
}
export function castHit(ctx: OverrideContext, e: BattleEffects, base: PhaseResult, label: string, type: DamageType, scale: number, flat = 0) {
  const full = extra(ctx, e, base, { label, type, flat, scale });
  const hit = full.components.at(-1)!;
  return { ...base, components: [...base.components, { ...hit, source: 'cast:' + label, hitsPerSec: 0, hitsPerAttack: 1, dps: 0 }] };
}
export function mass(ctx: OverrideContext) {
  return ctx.boss.attributeSource.flatMap(line => {
    const match = line.match(/"massLevel":(\d+)/);
    return match ? [Number(match[1])] : [];
  }).at(-1);
}
export function triggerCount(e: BattleEffects, key: string, trigger: 'attack' | 'skill', max: number) {
  const source = 'counter:' + key;
  const count = e.stats.find(item => item.source === source)?.value ?? 0;
  const marker = { source, stat: 'attackSpeed' as const, bucket: 'direct' as const, value: 1 };
  return { count, effects: { ...e, stats: e.stats.filter(item => item.source !== source),
    stacks: [...e.stacks, { trigger, max, modifier: marker }] } };
}
