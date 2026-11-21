import { artsFraction, damage } from '../damage.ts';
import type { BossData, DamageComponent } from '../types.ts';

/** 弱点概率分支分别统计法术份额，按秒伤或一次动作的完整段数积累同一条灼燃。 */
export function artsContribution(parts: DamageComponent[], instant = false): number {
  return parts.reduce((sum,c) => sum + (c.countsTowardDps ? artsFraction(c) * (instant ? c.perHit * c.hitsPerAttack : c.dps) : 0),0);
}

// PRTS https://prts.wiki/w/元素：领袖2000、其他1000；灼燃7000元素伤害、10秒锁条及法抗-20。
// epResistance 抵抗损伤积累，epDamageResistance 抵抗元素扣血；两者不能互换。
export function burningProfile(boss: BossData) {
  const loss = damage({ attack: 7000, type: 'elemental', epDamageResistance: boss.attributes?.epDamageResistance, target: boss });
  return {
    threshold: boss.levelType === 'NORMAL' || boss.levelType === 'ELITE' ? 1000 : 2000,
    duration: 10,
    resistanceReduction: 20,
    buildupMultiplier: Math.max(0, 1 - (boss.attributes?.epResistance ?? 0) / 100),
    damageMultiplier: loss.perHit / 7000,
    burstDamage: loss.perHit,
    derivation: loss.derivation,
  };
}
export interface BurningState { buildup: number; remaining: number }

/** 推进至给定时长、爆条或冷却结束中最早的事件；burst 在该段末结算。 */
export function advanceBurning(state: BurningState, profile: ReturnType<typeof burningProfile>, rawRate: number, duration: number) {
  const rate = Math.max(0, rawRate) * profile.buildupMultiplier;
  if (state.remaining > 0) {
    const seconds = Math.min(duration, state.remaining);
    state.remaining = Math.max(0, state.remaining - seconds);
    return { seconds, burst: 0 };
  }
  const toBurst = state.buildup >= profile.threshold ? 0 : rate > 0 ? (profile.threshold - state.buildup) / rate : Infinity;
  const seconds = Math.min(duration, toBurst);
  if (rate > 0) state.buildup += rate * seconds;
  if (Number.isFinite(toBurst) && toBurst <= duration) {
    state.buildup = 0;
    state.remaining = profile.duration;
    return { seconds, burst: profile.burstDamage };
  }
  return { seconds, burst: 0 };
}

// PRTS https://prts.wiki/w/元素：凋亡领袖2000、其他1000，爆发15秒、每秒800元素伤害。
// 虚弱只降低敌方攻击；本项目不受击场景不改变己方DPS，爆发期间不重新积累。
export function necrosisProfile(boss: BossData) {
  const loss = damage({ attack: 800, type: 'elemental', epDamageResistance: boss.attributes?.epDamageResistance, target: boss });
  return {
    threshold: boss.levelType === 'NORMAL' || boss.levelType === 'ELITE' ? 1000 : 2000,
    duration: 15,
    buildupMultiplier: Math.max(0, 1 - (boss.attributes?.epResistance ?? 0) / 100),
    dps: loss.perHit,
    derivation: loss.derivation,
  };
}
export interface NecrosisState { buildup: number; remaining: number }
/** 爆发只开始持续伤害，不在触发时一次扣除12000生命。 */
export function advanceNecrosis(state: NecrosisState, profile: Pick<ReturnType<typeof necrosisProfile>, 'threshold' | 'duration' | 'buildupMultiplier'>, rawRate: number, duration: number) {
  if (state.remaining > 0) {
    const seconds = Math.min(duration, state.remaining);
    state.remaining = Math.max(0, state.remaining - seconds);
    return { seconds, triggered: false };
  }
  const rate = Math.max(0, rawRate) * profile.buildupMultiplier;
  const toBurst = state.buildup >= profile.threshold ? 0 : rate > 0 ? (profile.threshold - state.buildup) / rate : Infinity;
  const seconds = Math.min(duration, toBurst);
  if (rate > 0) state.buildup += rate * seconds;
  const triggered = Number.isFinite(toBurst) && toBurst <= duration;
  if (triggered) { state.buildup = 0; state.remaining = profile.duration; }
  return { seconds, triggered };
}
