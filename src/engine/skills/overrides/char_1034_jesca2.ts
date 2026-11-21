import { duel } from './single-boss.ts';
import { castHit } from './duel-effects.ts';

// S3 开启一炮，20 发弹药按当前攻速逐发耗尽；S2 调整基础攻击间隔。
export const jesca2Override = duel(({ ctx, e, s, b, attack }) => {
  const normal = attack(false, 'physical');
  const skill = attack(true, 'physical', { atk: b.atk, delay: b.base_attack_time });
  return { normal, skill: s === 3 ? castHit(ctx, e, skill, '机动盾牌炮弹', 'physical', b['attack@extrabomb.atk_scale']) : skill,
    lifecycle: s === 1 ? 'permanent' : s === 2 ? 'timed' : 'ammo',
    duration: s === 1 ? Infinity : s === 2 ? ctx.level.duration : skill.stats.attackInterval * b['attack@trigger_time'],
    assumptions: [s === 3 ? '每次开启饱和迸射时机动盾牌在场，炮弹命中一次；不提前停火。' : '盾牌不主动攻击。', '盾牌承受的攻击次数取决于部署位，未额外计入蓄能释放的回技。'] };
});