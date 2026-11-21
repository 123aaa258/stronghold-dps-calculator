import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import { necrosisProfile } from '../../effects/elemental.ts';
import { damage } from '../../damage.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';

// PRTS https://prts.wiki/w/元素 ：神经爆发一次造成 6000 元素伤害，随后十秒停止积累。
export const phatm2Override = actionModel(['酒神的神经条在每次伤害、Boss 普攻及空剧场每秒效果时结算；单个静止 Boss 无其它溅射目标，未走到本能的召唤所在格。按一次普通攻击间隔估算 Boss 的攻击动作。'],(ctx,model)=>{
  const b=ctx.level.blackboard.nums,e=model.battle!,s=ctx.operator.skillIds.indexOf(ctx.skill.skillId)+1;
  if(s===3)model.assumptions=[...model.assumptions??[],'三技能神经爆发时生成或刷新迷狂牢笼。召唤物特性只描述阻挡、承受三次攻击后消失，技能黑板无独立伤害；不计牢笼额外攻击。'];
  const [attackTalent,bossTalent]=ctx.tier.talents;
  const normal=duelAttack(ctx,e,false,'arts');
  const skill=duelAttack(ctx,e,true,'arts',b.atk,b.attack_speed,{scale:s===1?b.atk_scale:1,hits:s===1?b.times:1});
  const profile=necrosisProfile(ctx.boss);
  const ratio=attackTalent.blackboard.nums['attack@ep_damage_ratio'];
  const elite=ctx.boss.levelType==='ELITE'||ctx.boss.levelType==='BOSS';
  const multiplier=(elite?ctx.tier.trait?.blackboard.nums.ep_damage_scale??1:1)*profile.buildupMultiplier;
  const burst=damage({type:'elemental',attack:6000,target:ctx.boss,epDamageResistance:ctx.boss.attributes?.epDamageResistance}).perHit;
  const bossInterval=bossAttackInterval(ctx.boss).interval;
  let gauge=0,unlock=0,rootUntil=0,nextBoss=bossInterval,nextTick=Infinity,marked=false;
  const add=(time:number,amount:number,active:boolean)=>{
    if(time<unlock-1e-9)return 0;
    gauge+=amount*multiplier*(time<rootUntil?b.ep_damage_scale??1:1);
    if(gauge<profile.threshold-1e-8)return 0;
    gauge=0;marked=false;
    unlock=time+10/(active&&s===3?1+b['talent@ep_break_recover_speed']:1);
    return burst;
  };
  model.elemental={ perSec:normal.stats.atk*ratio*multiplier/normal.stats.attackInterval,note:'首次普通攻击阶段的损伤积累率，另有敌人普攻触发的独立损伤。' };
  model.lifecycle=s===1?'instant':s===2?'permanent':'timed';
  return duelClock(ctx,model,{normal,skill,length:()=>s===1?0:s===2?Infinity:ctx.level.duration,nextAttack:s===1,
    panel:st=>st.active?skill:normal,onCast:st=>{if(s===3)nextTick=st.time+1;return 0;},onEnd:()=>{nextTick=Infinity;},
    nextEvent:()=>Math.min(nextTick,nextBoss),event:st=>{
      let value=0;
      if(nextTick<=st.time+1e-9){nextTick+=1;if(marked)value+=add(st.time,skill.stats.atk*b.ep_damage_ratio,st.active);}
      if(nextBoss<=st.time+1e-9){nextBoss+=bossInterval;value+=add(st.time,bossTalent?.blackboard.nums.value??0,st.active);}
      return value;
    },shot:(st,p)=>{
      if(st.active&&s===1&&!ctx.boss.attributes?.immunities.groundBoundImmune)rootUntil=st.time+b.unmove;
      if(st.active&&s===3&&st.time>=unlock)marked=true;
      return actionDamage(p)+add(st.time,p.stats.atk*ratio*(st.active&&s===1?b.times:1),st.active);
    }});
});
