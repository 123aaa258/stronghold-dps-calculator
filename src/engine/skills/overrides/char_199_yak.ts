import { duel } from './single-boss.ts';

// 两个技能都只提升生存，天赋、模组和首次寒冷特质不改变本体攻击。
export const yakOverride = duel(({ attack }) => {
  return { normal: attack(false, 'physical'), skill: attack(true, 'physical') };
});