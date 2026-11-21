import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';

export const override = actionModel(['按地面单 Boss，散逸的其他目标与追猎的后续弹射没有命中对象；未赋予远程干员一次额外破盾回技。'], (ctx, model) => {
  const b = ctx.level.blackboard.nums, t = ctx.tier.talents[0]!.blackboard.nums;
  const s = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
  const speed = ctx.tier.talents.find(t => t.blackboard.nums.attack_speed)?.blackboard.nums.attack_speed ?? 0;
  const normal = duelAttack(ctx, model.battle!, false, 'physical', 0, speed);
  const skill = duelAttack(ctx, model.battle!, true, 'physical', b.atk, speed,
    { hits:b.times ?? b['attack@times'] ?? 1, scale:b.atk_scale ?? 1 });
  model.lifecycle = s === 3 ? 'timed' : 'instant';
  let tick = t.interval!;
  return duelClock(ctx, model, { normal, skill, length:() => Math.max(0, ctx.level.duration), nextAttack:s === 1,
    panel:state => state.active && s !== 2 ? skill : normal,
    nextEvent:() => tick, event:state => { tick += t.interval!; if (!state.active) state.sp += t.sp!; return 0; },
    onCast:() => s === 2 ? actionDamage(skill) : 0 });
});
