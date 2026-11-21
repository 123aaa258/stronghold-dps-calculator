import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

// 霰射手前排倍率只扩大物理攻击，尖钉独立按自身攻击力结算法伤。
export const aostaOverride = duel(({ ctx, s, b, t, trait, attack, add }) => {
  const make = (active: boolean) => {
    const shot = attack(active, 'physical', { scale: trait('atk_scale', 1), atk: active ? b.atk : 0,
      speed: active ? b.attack_speed : 0, delay: active ? b.base_attack_time : 0 });
    return isBlocked(ctx.boss) ? shot : add(shot, { label: '尖钉流血', type: 'arts', interval: 1,
      scale: t(0, 'atk_scale') * (active && s === 2 ? b.talent_scale : 1) * Math.min(1, t(0, 'duration') / shot.stats.attackInterval), independent: true });
  };
  return { normal: make(false), skill: make(true), assumptions: ['奥斯塔面朝 Boss，按前方一横排计算特性；流血只作用于未阻挡目标，按刷新覆盖时长积分。'] };
});