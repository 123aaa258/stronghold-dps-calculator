import { operatorRotation, companion } from './batches/phase-07-09.ts';
// 命中静止 Boss 没有位移距离真伤。蓄水炮使用自己的攻击力。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, effects }) => {
  const turret = companion(ctx, 'token_10009_weedy_cannon');
  const t = turret.talents![0]!.blackboard.nums, talent = turret.talents![1]?.blackboard.nums;
  const cycle = turret.attributes.respawnTime + t.duration, present = ctx.elapsed % cycle < t.duration;
  const extra = present ? [{ label: '蓄水炮', token: turret.attributes, strike: {} }] : [];
  const e = { ...effects, spRecovery: effects.spRecovery + (present && talent?.interval ? talent.sp / talent.interval : 0) };
  const breakpoints = Array.from({ length: Math.ceil(180 / cycle) }, (_, i) => [i * cycle, i * cycle + t.duration]).flat();
  const assumptions = ['蓄水炮部署于温蒂四格内，持续期结束后再部署；每三秒回技换算为在场期间连续回复。静止 Boss 移动距离按零。'];
  return { idle: { extra }, effects: e, active: { body: { type: slot === 3 ? 'arts' : 'physical', scale: s.atk_scale, atk: s.atk, delay: s.base_attack_time },
    extra: slot === 3 ? present ? [{ label: '蓄水炮同步发射', token: turret.attributes, strike: { type: 'arts', scale: s.atk_scale } }] : [] : extra },
    lifecycle: slot === 2 ? 'permanent' : 'instant', burst: slot === 3, breakpoints, assumptions };
});
