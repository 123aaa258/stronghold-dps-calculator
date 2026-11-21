import { duel } from './single-boss.ts';

// 护佑者开启技能后改为治疗；加攻、加速与回技只作用于治疗友军。
export const quercuOverride = duel(({ b, attack }) => {
  return { normal: attack(false, 'arts'), skill: attack(true, 'none', { atk: b.atk, speed: b.attack_speed }) };
});