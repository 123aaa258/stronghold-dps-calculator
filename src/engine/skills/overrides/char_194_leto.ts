import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

// 快点快点！对烈夏自身生效。远程折扣和双目标模组由 trait、talents 区分。
export const letoOverride = duel(({ ctx, s, b, t, trait, attack }) => {
  const scale = isBlocked(ctx.boss) ? 1 : trait('atk_scale', 1);
  return { normal: attack(false, 'physical', { scale }), skill: attack(true, 'physical', {
    atk: b.atk, speed: (b.attack_speed ?? 0) + t(0, 'attack_speed'), scale: s === 2 ? 1 : scale }),
    assumptions: ['烈夏近战阻挡时使用完整倍率，未阻挡时按远程攻击；场内单个目标不触发模组双目标攻速。'] };
});