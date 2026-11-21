import { duel } from './single-boss.ts';

// 永志不忘作用于同阵营自身；奔流三段分别过防，同胞的意志治疗与屏障不产生额外伤害。
export const varkisOverride = duel(({ s, b, t, attack }) => {
  const talent = t(0, 'talent_atk_scale') || 1;
  return { normal: attack(false, 'physical', { scale: talent }),
    skill: attack(true, 'physical', { scale: talent * (s === 1 ? b.atk_scale : b['attack@s2_atk_scale']), hits: s === 1 ? 3 : 1 }),
    assumptions: ['摆渡人满血，目标生命比例始终不高于自身，永志不忘对自身生效。'] };
});