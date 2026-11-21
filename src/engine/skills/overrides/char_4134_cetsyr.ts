import { duel } from './single-boss.ts';

// 吟游者不普攻。仅明日渺远不及的微尘对敌造成真伤，普攻与另两个技能为治疗、鼓舞。
export const cetsyrOverride = duel(({ ctx, s, b, t, attack, add }) => {
  const normal = attack(false, 'none');
  let skill = attack(true, 'none', { atk: t(2, 'atk') });
  if (s === 2) {
    const count = b.extra_cnt;
    const cooldown = t(0, 'cooldown');
    skill = add(skill, { label: '微尘碰撞', type: 'true', scale: b.atk_scale, hits: count, interval: cooldown, independent: true });
  }
  return { normal, skill, assumptions: s === 2 ? ['魔王按 Boss 位于微尘轨道、每枚微尘每轮重生后命中一次计算；转动位置与飞行耗时无法从阵容确定，取范围内两名友方以触发模组加攻。'] : [],
    lifecycle: s === 1 ? 'permanent' : 'timed', duration: s === 1 ? Infinity : ctx.level.duration };
});