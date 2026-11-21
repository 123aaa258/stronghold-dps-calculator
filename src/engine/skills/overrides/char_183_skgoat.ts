import { duel } from './single-boss.ts';

// 流沙化只施加停顿，停顿天赋与模组都不增加伤害。
export const skgoatOverride = duel(({ s, b, attack }) => {
  return { normal: attack(false, 'arts'), skill: attack(true, s === 2 ? 'none' : 'arts', { atk: b.atk }) };
});