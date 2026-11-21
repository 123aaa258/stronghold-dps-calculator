import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage, isBlocked } from './shared.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
import { artsContribution, burningProfile } from '../../effects/elemental.ts';
import { castHit } from './duel-effects.ts';
import { extra } from './single-boss.ts';

// 礼尚往来的法伤与灼燃损伤逐秒独立结算。爆发产生一次元素伤害，锁条十秒并降低法抗。
export const yuOverride=actionModel(['余自行阻挡 Boss，按每秒阻挡效果及 Boss 普攻时钟积累灼燃。技能三由其他友方穿墙产生的损伤不计入单人输出。'],(ctx,model)=>{
  const b=ctx.level.blackboard.nums,e=model.battle!,s=ctx.operator.skillIds.indexOf(ctx.skill.skillId)+1;
  const t=ctx.tier.talents[0]!.blackboard.nums, blocked=isBlocked(ctx.boss), profile=burningProfile(ctx.boss);
  const base=(active:boolean,burn:boolean)=>{
    const effects=burn?{...e,resReductionFixed:e.resReductionFixed+profile.resistanceReduction}:e;
    const shot=duelAttack(ctx,effects,active,active&&s===2?'arts':'physical',active?b.atk:0);
    const field=blocked?extra(ctx,effects,shot,{type:'arts',label:'礼尚往来',scale:t['yu_t_1[enemy].atk_scale'],interval:1,independent:true}):shot;
    const preview=active&&s===2?castHit(ctx,effects,field,'厚礼上宾开启','arts',b.atk_scale):field;
    return {shot,preview,field:blocked?field.components.at(-1)!.perHit:0,cast:active&&s===2?preview.components.at(-1)!.perHit:0};
  };
  const stages=[base(false,false),base(true,false),base(false,true),base(true,true)];
  const traitMultiplier=blocked?ctx.tier.trait?.blackboard.nums.ep_damage_scale??1:1;
  const multiplier=profile.buildupMultiplier*traitMultiplier;
  const hammer=e.burning?.ratio??0;
  let gauge=0,unlock=0,nextSecond=1;
  const bossTime=bossAttackInterval(ctx.boss).interval;
  let nextBoss=bossTime;
  const gain=(time:number,amount:number)=>{
    if(time<unlock-1e-9)return 0;
    gauge+=amount*multiplier;
    if(gauge<profile.threshold-1e-8)return 0;
    gauge=0;unlock=time+profile.duration;return profile.burstDamage;
  };
  const pick=(time:number,active:boolean)=>stages[Number(active)+2*Number(time<unlock)]!;
  model.lifecycle='timed';
  const idle=stages[0], nativeRate=blocked?idle.shot.stats.atk*t['yu_t_1[enemy].ep_damage_ratio']:0;
  model.elemental={perSec:(nativeRate+hammer*(idle.field+artsContribution(idle.shot.components)))*multiplier,note:'常态下按每秒阻挡损伤和重锤的有来源法伤积累，爆发期间停止积累。'};
  return duelClock(ctx,model,{normal:stages[0].preview,skill:stages[1].preview,length:()=>ctx.level.duration,
    panel:st=>pick(st.time,st.active).shot,onCast:st=>{ const amount=pick(st.time,true).cast; return amount+gain(st.time,amount*hammer); },
    nextEvent:()=>Math.min(nextBoss,nextSecond),event:st=>{
      const p=pick(st.time,st.active);
      let damage=0;
      if(nextSecond<=st.time+1e-9){nextSecond++;if(blocked)damage+=p.field+gain(st.time,p.shot.stats.atk*t['yu_t_1[enemy].ep_damage_ratio']+p.field*hammer);}
      if(nextBoss<=st.time+1e-9){nextBoss+=bossTime;if(s===1){if(st.active)damage+=gain(st.time,p.shot.stats.atk*b.ep_damage_ratio);else st.sp+=ctx.level.increment;}}
      return damage;
    },shot:(st,p)=>actionDamage(p)+gain(st.time,artsContribution(p.components,true)*hammer)});
});
