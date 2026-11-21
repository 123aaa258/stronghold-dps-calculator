import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

// 深海掠食者加攻含自身；跃浪击的部署时长由技能 duration 指定。
export const skadiOverride = duel(({ ctx, t, b, trait, attack }) => {
  const abyssal = t(0, 'atk');
  const scale = isBlocked(ctx.boss) ? trait('atk_scale', 1) : 1;
  return { normal: attack(false, 'physical', { atk: abyssal, scale }), skill: attack(true, 'physical', { atk: abyssal + b.atk, speed: b.attack_speed, scale }),
    assumptions: ['斯卡蒂单次部署存活，未触发被击倒后的模组攻速。对被阻挡敌人的攻击倍率按所选模组特性计算。'] };
});
