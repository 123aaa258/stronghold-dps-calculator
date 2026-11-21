import { damage, type CombatTarget } from '../damage.ts';
import type { DamageComponent, StatResult } from '../types.ts';
import type { BattleEffects } from './common.ts';

export const kazimierzSource = 'bond:kazimierzShip';
export const sandSource = 'bond:sargonShip:mag_damage';
export const sandSkillSource = 'bond:sargonShip:mag_damage_2';
export const iberiaDotSource = 'bond:iberiaShip:dot';
/** 持续伤害不是攻击或独立伤害事件：不触发逐击装备、减抗计数与攻击类盟约。 */
export const isDotSource = (source: string) => source === iberiaDotSource;

export function kazimierzHit(e: BattleEffects, boss: CombatTarget, panel: StatResult, actions = 1): DamageComponent | undefined {
  const effect = e.kazimierz;
  if (!effect || actions <= 0) return;
  const hit = damage({ attack: panel.atk, scale: effect.scale, type: 'true', target: boss, modifiers: e.modifiers });
  const frequency = actions / panel.attackInterval;
  return { source: kazimierzSource, label: '六人卡西米尔盟约附加真伤', damageType: 'true', perHit: hit.perHit,
    hitsPerAttack: 1, hitsPerSec: frequency, dps: hit.perHit * frequency, countsTowardDps: true,
    derivation: [...e.derivation, ...hit.derivation,
      { label: '每秒本体攻击次数', value: frequency, op: 'mul', source: kazimierzSource }] };
}

export function quicksandHits(e: BattleEffects, boss: CombatTarget, damageEvents = 0): DamageComponent[] {
  const sand = e.quicksand;
  if (!sand) return [];
  const shred = Math.min(e.resShred?.max ?? 0, damageEvents * (e.resShred?.perHit ?? 0));
  const part = (source: string, label: string, amount: number, interval: number): DamageComponent => {
    const hit = damage({ attack: amount, type: 'arts', target: boss, modifiers: e.modifiers,
      reductionFixed: e.resReductionFixed + shred, penetrationFixed: e.resPenetrationFixed, penetrationPct: e.resPenetrationPct });
    return { source, label, damageType: 'arts', perHit: hit.perHit, hitsPerAttack: 1,
      hitsPerSec: 1 / interval, dps: hit.perHit / interval, countsTowardDps: true,
      derivation: [...e.derivation, { label: '流沙基础法术伤害', value: amount, op: 'set', source }, ...hit.derivation.slice(1),
        { label: '流沙跳伤间隔（秒）', value: interval, op: 'info', source }] };
  };
  // 盟约描述规定技能期间每秒结算，周期流沙间隔另由黑板给出。
  return [part(sandSource, '流沙周期法术伤害', sand.damage, sand.interval),
    part(sandSkillSource, '流沙技能期每秒法术伤害', sand.skillDamage, 1)];
}
