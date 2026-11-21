import { duel } from './single-boss.ts';
import { swiftDraw } from '../../swift.ts';

// 阴晴圆缺的三种分支仅第二种增加自身攻速；商人费用不属于 DPS。
export const nothinOverride = duel(({ s, b, attack }) => {
  const pick = Math.floor(swiftDraw(0, 1) * 3);
  return { normal: attack(false, 'physical'), skill: attack(true, 'physical', { atk: b.atk, speed: s === 2 && pick === 1 ? b.attack_speed : 0 }),
    assumptions: ['乌有全程费用充足且生命高于知难而退阈值，持续攻击同一目标，不触发长时间停攻后的天赋。', ...(s === 2 ? ['阴晴圆缺自动开启后持续无限，三选一按固定序列判定一次。'] : [])] };
});