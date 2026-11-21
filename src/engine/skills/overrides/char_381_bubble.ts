import { duel } from './single-boss.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
import { isBlocked } from './shared.ts';

// “挨打”停止主动攻击，独立反击基于技能防御与阻挡模组的加算防御。
export const bubbleOverride = duel(({ ctx, s, b, trait, attack, add }) => {
  const normal = attack(false, 'physical');
  if (s === 1) return { normal, skill: attack(true, 'physical') };
  const defense = ctx.tier.attributes.def * (1 + b.def + (isBlocked(ctx.boss) ? trait('def') : 0));
  return { normal, skill: add(attack(true, 'none'), { label: '尖刺反伤', type: 'physical', flat: defense * b.atk_scale,
    interval: bossAttackInterval(ctx.boss).interval, independent: true }),
    assumptions: ['泡泡在技能中承受 Boss 的每次普攻，按 Boss 攻击间隔反击；没有额外受击来源。'] };
});