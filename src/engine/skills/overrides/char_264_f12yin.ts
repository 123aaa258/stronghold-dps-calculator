import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { swiftSucceeds } from '../../swift.ts';
import { actionDamage } from './shared.ts';

export const override = actionModel(['山按生命高于一半结算。横扫架势就绪后保持开启，震地碎岩击对同一目标命中两段。'], (ctx, model) => {
  const b = ctx.level.blackboard.nums, t = ctx.tier.talents[0]!.blackboard.nums;
  const s = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
  const speed = ctx.tier.trait?.blackboard.nums.attack_speed ?? 0;
  const make = (active: boolean, crit: boolean) => duelAttack(ctx, model.battle!, active, 'physical', active ? b.atk : 0, speed, {
    hits: active && s === 3 ? 2 : 1, scale: (active ? b.atk_scale ?? 1 : 1) * (crit ? t.atk_scale! : 1),
    interval: ctx.tier.attributes.baseAttackTime * (1 + (active ? b.base_attack_time ?? 0 : 0)) });
  const normal = make(false, false), skill = make(true, false), normalCrit = make(false, true), skillCrit = make(true, true);
  model.lifecycle = s === 1 ? 'instant' : s === 2 ? 'permanent' : 'timed';
  return duelClock(ctx, model, { normal, skill, length: () => s === 2 ? Infinity : Math.max(0, ctx.level.duration), nextAttack: s === 1,
    panel: state => state.active ? skill : normal,
    shot: (state, p) => actionDamage(swiftSucceeds(state.attack, state.active ? b['talent@prob'] ?? t.prob! : t.prob!, 1) ? state.active ? skillCrit : normalCrit : p) });
});
