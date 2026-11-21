import { duel } from './single-boss.ts';

// 贯敌刺枪为一次二连击，执守阵线是随部署开启的单次限时技能。
export const fang2Override = duel(({ ctx, s, b, attack }) => {
  return { normal: attack(false, 'physical'), skill: attack(true, 'physical', { atk: b.atk, scale: b.atk_scale, hits: s === 1 ? 2 : 1 }),
    lifecycle: s === 1 ? 'instant' : 'on_deploy', duration: s === 1 ? attack(true, 'physical').stats.attackInterval : ctx.level.duration };
});