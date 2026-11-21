import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import { extra } from './single-boss.ts';

export const override = actionModel(['水月单独攻击，无外部治疗；单目标镜花水月每次攻击均流失生命，生命耗尽后停止输出。'], (ctx, model) => {
  const e = model.battle!, b = ctx.level.blackboard.nums, t = ctx.tier.talents[0]!.blackboard.nums;
  const s = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1, hp = ctx.targetHp ?? Infinity;
  const talent = ctx.tier.talents[1]!.blackboard.nums;
  const make = (active: boolean, wounded: boolean) => {
    const p = duelAttack(ctx, e, active, 'physical', (active ? b.atk ?? 0 : 0) + (wounded ? talent.atk ?? 0 : 0), 0, {
      scale:active ? b.atk_scale ?? 1 : 1, interval:ctx.tier.attributes.baseAttackTime + (active ? b.base_attack_time ?? 0 : 0) });
    return extra(ctx, e, p, { label:'唤醒于本能', type:'arts', scale:t['attack@mizuki_t_1.atk_scale']! * (active ? b.talent_scale ?? 1 : 1) });
  };
  const panels = [make(false,false),make(true,false),make(false,true),make(true,true)];
  let dealt = 0, health = 1;
  const injured = () => dealt > hp * (1 - (talent.hp_ratio ?? 0.5));
  return duelClock(ctx, model, { normal:panels[0]!, skill:panels[1]!, nextAttack:s === 1, length:() => Math.max(0,ctx.level.duration),
    panel:st => panels[Number(st.active) + 2 * Number(injured())]!,
    shot:(st,p) => { const dmg = actionDamage(p); dealt += dmg;
      if (st.active && s === 3) { health -= b['attack@hp_ratio']!; if (health <= 1e-9) model.leavesAt = st.time; }
      return dmg; }, retired:() => health <= 1e-9 });
});
