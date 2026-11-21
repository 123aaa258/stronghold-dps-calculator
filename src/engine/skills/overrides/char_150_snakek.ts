import { duel } from './single-boss.ts';

// 技能与特性只改变防御、回复和阻挡，壳状防御明示停止攻击。
export const snakekOverride = duel(({ s, attack }) => {
  return { normal: attack(false, 'physical'), skill: attack(true, s === 2 ? 'none' : 'physical') };
});