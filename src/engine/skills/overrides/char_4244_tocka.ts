import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';

export const override = actionModel(['冻河单人部署；一、二技能将效果施加给自己，按 Boss 普攻时钟触发受击。三技能没有另一名干员接力，未计接力加攻。'], (ctx,model)=>{
  const e=model.battle!, b=ctx.level.blackboard.nums, t=ctx.tier.talents[1]!.blackboard.nums;
  const s=ctx.operator.skillIds.indexOf(ctx.skill.skillId)+1;
  const normal=duelAttack(ctx,e,false,'physical');
  const skill=duelAttack(ctx,e,true,'physical',0,b.attack_speed,{scale:b['attack@atk_scale']??1});
  const dot=duelAttack(ctx,{...e,weakness:undefined,atkProc:undefined,attackScale:1},false,'arts',0,0,
    {scale:t['attack@t2_magic_atk_scale'],ownerActions:0}).components[0]!.perHit;
  let prepared=false, buffUntil=0, nextTick=Infinity, left=0, armed=false;
  const bossInterval=bossAttackInterval(ctx.boss).interval;
  let bossHit=s===1?bossInterval:Infinity;
  model.lifecycle=s===3?'timed':'instant';
  return duelClock(ctx,model,{normal,skill,length:()=>s===3?ctx.level.duration:0,
    panel:st=>st.active&&s===3 || st.time<buffUntil?skill:normal,
    onCast:st=>{
      if(s===1&&!armed){prepared=true;armed=true;}
      if(s===2){prepared=true;if(armed){buffUntil=st.time+b.buff_duration!;st.sp+=ctx.tier.talents[0]!.blackboard.nums.sp!;}armed=true;}
      return 0;
    },shot:(st,p)=>{if(prepared){prepared=false;nextTick=st.time+1;left=t['attack@t2_buff_duration']!;}return actionDamage(p);},
    nextEvent:()=>Math.min(bossHit,nextTick),event:st=>{
      if(bossHit<=st.time+1e-9){bossHit+=bossInterval;if(armed){armed=false;st.sp+=ctx.tier.talents[0]!.blackboard.nums.sp!;}}
      if(nextTick<=st.time+1e-9){nextTick=--left?nextTick+1:Infinity;return dot;}return 0;
    }});
});
