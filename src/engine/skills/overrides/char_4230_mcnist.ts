import { operatorRotation, companion } from './batches/phase-07-09.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
// 结构性原理的面板、在场期与再部署间隔取 tokens，双方可同时攻击一个目标。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s }) => {
  const token = companion(ctx, 'token_10069_mcnist_mcgraf');
  const life = token.talents![0]!.blackboard.nums['skill@duration'];
  const cycle = life + token.attributes.respawnTime;
  const present = ctx.elapsed % cycle < life;
  const extra = present ? [{ label: '结构性原理', token: token.attributes, strike: {} }] : [];
  const breakpoints = Array.from({ length: 4 }, (_, i) => [i * cycle, i * cycle + life]).flat();
  const assumptions = ['结构性原理与本体同时部署于能攻击同一目标的位置，持续期结束后按独立再部署时间补放。'];
  if (slot === 1) return { idle: { extra }, active: { body: { scale: s['attack@atk_scale'], hits: s['attack@times'], delay: s.base_attack_time }, extra },
    lifecycle: 'ammo', ammo: s['attack@trigger_time'], breakpoints, assumptions };
  if (slot === 2) {
    const interval = bossAttackInterval(ctx.boss).interval;
    assumptions.push('假定每次 Boss 普攻击破本体一层屏障；盾量、减伤和召唤物受击分配无独立时间轴。');
    return { idle: { extra }, active: { body: { atk: s.atk }, extra: [...extra,
      { label: '破盾爆发', strike: { type: 'arts', scale: s.atk_scale, fixedInterval: interval } }] },
      duration: s.trigger_time * interval, lifecycle: 'timed', breakpoints, assumptions };
  }
  assumptions.push('开技时场上有结构性原理即按冲锋首次碰撞 Boss 一次。');
  return { idle: { extra }, active: { body: { type: 'arts', scale: s['attack@atk_scale'], atk: s.atk, delay: s.base_attack_time },
    extra: [...extra, ...(present ? [{ label: '冲锋碰撞', cast: true, strike: { type: 'physical' as const, scale: s.atk_scale } }] : [])] }, breakpoints, assumptions };
});
