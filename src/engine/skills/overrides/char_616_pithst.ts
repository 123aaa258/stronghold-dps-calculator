import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import { damage } from '../../damage.ts';
import { necrosisProfile } from '../../effects/elemental.ts';

// https://prts.wiki/w/盟约·辅助干员 、https://prts.wiki/w/元素 ：同一时刻满条，神经优先。
export const override = actionModel(['独自攻击时三种元素同时累积，先触发神经爆发，10秒冷却期间暂停积累。额外独立伤害对元素累积的触发次数待核实。'], (ctx,model)=>{
  const e=model.battle!, t=ctx.tier.talents[0]!.blackboard.nums;
  const normal=duelAttack(ctx,e,false,'arts'), skill=duelAttack(ctx,e,true,'arts',0,ctx.level.blackboard.nums.attack_speed);
  const profile=necrosisProfile(ctx.boss);
  const ratio=(ctx.boss.levelType==='NORMAL'?t.ep_damage_ratio:t.ep_damage_ratio_boss??t.ep_damage_ratio)! * profile.buildupMultiplier;
  const burst=damage({type:'elemental',attack:6000,target:ctx.boss,epDamageResistance:ctx.boss.attributes?.epDamageResistance}).perHit;
  let gauge=0, unlock=0;
  return duelClock(ctx,model,{normal,skill,length:()=>ctx.level.duration,panel:st=>st.active?skill:normal,shot:(st,p)=>{
    let amount=actionDamage(p);
    if(st.time>=unlock){gauge+=p.stats.atk*ratio;if(gauge>=profile.threshold){gauge=0;unlock=st.time+10;amount+=burst;}}
    return amount;
  }});
});
