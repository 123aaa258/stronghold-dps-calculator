import { duel } from './single-boss.ts';

// 技能说明的二连击与加攻。罹患，浸染限定【水月与深蓝之树】，卫戍协议不触发。
export const highmoOverride = duel(({ s, b, attack }) => {
  return { normal: attack(false, 'physical'), skill: attack(true, 'physical', { atk: b.atk, scale: b.atk_scale, hits: s === 1 ? 2 : 1 }) };
});