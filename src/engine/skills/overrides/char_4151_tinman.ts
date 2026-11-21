import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';

// https://prts.wiki/w/锡人 ：炼金单元各自缓存施放时面板，效果可重叠。
export const override = actionModel(['炼金单元落在地面 Boss 所在格，忽略飞行时间；多个单元各按其落地后的整秒跳伤。'], (ctx, model) => {
  const b = ctx.level.blackboard.nums, e = model.battle!;
  const normal = duelAttack(ctx,e,false,'physical');
  const skill = duelAttack(ctx,{ ...e, atkProc:undefined, weakness:undefined, attackScale:1 },true,'arts',0,0,{scale:b.atk_scale,ownerActions:0});
  const tickDamage = skill.components[0]!.perHit * (ctx.tier.talents.find(t => t.blackboard.nums['skill@damage_scale'])?.blackboard.nums['skill@damage_scale'] ?? 1);
  const gain = ctx.tier.talents.find(t => t.blackboard.nums.sp_recovery_per_sec)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  const units: { next:number; left:number }[] = [];
  model.lifecycle = 'instant';
  return duelClock(ctx,model,{ normal,skill,length:()=>0,panel:()=>normal,onCast:st=>{
    units.push({ next:st.time+1,left:b.projectile_delay_time! }); return 0;
  },nextEvent:()=>Math.min(...units.map(u=>u.next)),event:st=>{
    let total=0;
    for(let i=units.length-1;i>=0;i--){ const u=units[i]!; if(u.next>st.time+1e-9)continue;
      total+=tickDamage; u.next++; if(--u.left===0)units.splice(i,1); }
    if(ctx.level.spType === 'INCREASE_WITH_TIME') st.sp+=gain;
    return total;
  } });
});
