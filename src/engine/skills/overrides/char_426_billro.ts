import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';

// PRTS https://prts.wiki/w/Carnelian ：食噬之印的加攻每整秒更新，第 20 秒到达黑板上限。
export const billroOverride = actionModel(['卡涅利安在第一份技力就绪时自动开技，未触发第二份蓄力奖励。食噬之印按每秒一次、二十秒达到最大攻击力结算。'],(ctx,model) => {
  const b = ctx.level.blackboard.nums;
  const e = model.battle!;
  const slot = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
  const normal = duelAttack(ctx,e,false,'none');
  const stages = Array.from({ length: slot === 3 ? 21 : 1 }, (_, age) => duelAttack(ctx,e,true,'arts',
    slot === 3 ? b.atk * age / 20 : slot === 1 ? b.atk : 0, 0, { interval:ctx.tier.attributes.baseAttackTime + (b.base_attack_time ?? 0) }));
  model.lifecycle = 'timed';
  return duelClock(ctx,model,{ normal,skill:stages[0],length:()=>ctx.level.duration,
    panel:st=>st.active ? stages[slot === 3 ? Math.min(20,Math.max(0,Math.floor(st.time-st.start+1e-9))) : 0] : normal });
});
