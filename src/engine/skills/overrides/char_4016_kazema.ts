import { duel } from './single-boss.ts';
import { castHit, token, tokenEffects } from './duel-effects.ts';

// 纸艺·双影召唤的纸偶使用 token_10022_kazema_shadow 的独立面板，出现瞬间触发折纸生花。
export const kazemaOverride = duel(({ ctx, e, s, b, t, trait, attack, add }) => {
  const normal = attack(false, 'physical');
  let skill = attack(true, 'physical', { scale: b.atk_scale, atk: b.atk });
  if (s === 1) return { normal, skill };
  const doll = token(ctx, 'token_10022_kazema_shadow').attributes;
  const companionAtk = doll.atk * (1 + trait('atk') + b.atk);
  const effects = tokenEffects(e);
  skill = add(skill, { type: 'physical', label: '纸偶普攻', flat: companionAtk, interval: doll.baseAttackTime, independent: true }, effects);
  skill = castHit(ctx, effects, skill, '折纸生花', 'arts', 0, companionAtk * t(0, 'damage_scale'));
  return { normal, skill, assumptions: ['风丸在相邻可部署地块召出一个能打到 Boss 的纸偶，以纸偶面板计特性与技能加攻，技能结束纸偶离场。'] };
});