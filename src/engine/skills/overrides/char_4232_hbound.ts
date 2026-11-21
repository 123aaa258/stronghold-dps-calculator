import { duelAttack, actionModel } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { extra } from './single-boss.ts';
import { mass } from './duel-effects.ts';

// 炼金师本体普攻为物理，参照锡人与引星棘刺；投掷单元独立跳法伤并在存续期间照常回技。
export const hboundOverride = actionModel(['炼金单元落在静止 Boss 脚下，从落地后一秒起造成伤害。每个单元按释放时攻击力独立结算，各自的伤害可重叠。'], (ctx,model) => {
  const b = ctx.level.blackboard.nums, e = model.battle!;
  const normal = duelAttack(ctx,e,false,'physical');
  const unit = duelAttack(ctx,{ ...e, atkProc:undefined, weakness:undefined, attackScale:1 },true,'arts',0,0,{scale:b.atk_scale,ownerActions:0});
  unit.components[0]!.label = '炼金单元';
  const heavy = mass(ctx);
  const skill = ctx.skill.skillId.endsWith('_2') && heavy !== undefined && heavy >= b.value
    ? extra(ctx,e,unit,{ label:'重目标额外法伤',type:'arts',scale:b.heavy_atk_scale,independent:true }) : unit;
  const damage = skill.components.filter(c => c.label === '炼金单元' || c.label === '重目标额外法伤').reduce((sum,c) => sum + c.perHit,0);
  const gain = ctx.tier.talents.find(t => t.blackboard.nums.sp_recovery_per_sec)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  const units: { next:number; end:number }[] = [];
  let nextSp = Infinity;
  model.lifecycle = 'instant';
  return duelClock(ctx,model,{ normal,skill,length:()=>0,panel:()=>normal,onCast:st=>{
    if (!units.length) nextSp = st.time + 1;
    units.push({ next:st.time + b.interval,end:st.time + b.projectile_delay_time });
    return 0;
  },nextEvent:()=>Math.min(nextSp,...units.map(u=>u.next)),event:st=>{
    let total = 0;
    if (nextSp <= st.time + 1e-9) { st.sp += gain; nextSp++; }
    for (let i = units.length-1; i >= 0; i--) {
      const u=units[i]!;
      if (u.next>st.time+1e-9) continue;
      total += damage;
      u.next += b.interval;
      if (u.next > u.end+1e-9) units.splice(i,1);
    }
    if (!units.length) nextSp = Infinity;
    return total;
  } });
});
