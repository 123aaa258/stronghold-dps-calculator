import { damage, type CombatTarget } from '../damage.ts';
import type { BattleEffects } from './common.ts';
import type { DamageComponent } from '../types.ts';

export const judgmentSource = 'band:band_siracusa';

// 仅由对敌攻击动作调用。一次多段攻击只判定一次，召唤物、持续伤害和治疗不触发。
export function judgmentHit(e: BattleEffects, target: CombatTarget, interval: number, elapsed: number): DamageComponent | undefined {
  const j = e.judgment;
  if (!j || elapsed >= j.until) return;
  const hit = damage({ attack: j.damage, type: 'true', target, modifiers: e.modifiers });
  const perHit = hit.perHit * j.probability;
  return { source: judgmentSource, label: '裁度追加真伤（每次攻击期望）', damageType: 'true',
    perHit, hitsPerAttack: 1, hitsPerSec: 1 / interval, dps: perHit / interval, countsTowardDps: true,
    derivation: [...hit.derivation, { label: '触发概率', value: j.probability, source: judgmentSource, op: 'mul' }] };
}
