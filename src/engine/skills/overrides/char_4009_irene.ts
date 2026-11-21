import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { swiftSucceeds } from '../../swift.ts';
import { mass } from './duel-effects.ts';
import { extra } from './single-boss.ts';
import { actionDamage } from './shared.ts';
import type { PhaseResult } from '../../types.ts';

// 剑豪普攻双段，S1 二段，S2 单段，S3 初击与轰击分开；审判之火的概率逐段判定。
export const ireneOverride=actionModel(['艾丽妮按地面 Boss 战斗，未额外配置海怪，穿甲每段按固定序列判定。领袖可浮空时按实际重量调整持续时间。判决按3.5秒固定动画，初击于开启时结算，后续每发按技能黑板间隔落下。'],(ctx,model)=>{
  const e=model.battle!,b=ctx.level.blackboard.nums,t=ctx.tier.talents[0]!.blackboard.nums;
  const slot=ctx.operator.skillIds.indexOf(ctx.skill.skillId)+1;
  const speed=ctx.tier.talents[1]?.blackboard.nums.attack_speed??0;
  const fixed=ctx.tier.trait?.blackboard.nums.def_penetrate_fixed??0;
  const pen=(success:boolean)=>({...e,defPenetrationFixed:e.defPenetrationFixed+fixed,
    defPenetrationPct:1-(1-e.defPenetrationPct)*(1-(success?t.def_penetrate:0))});
  let draw=0;
  const immune=ctx.boss.attributes?.immunities.levitateImmune;
  const levitate=immune?0:(b.levitate??0)/((mass(ctx)??0)>3?2:1);
  const cache = new Map<string, PhaseResult>();
  const make=(active:boolean,sequence:number)=>{
    const repeats=!active||slot===1?1:slot===3?b.multi_times:0;
    const succeeds=Array.from({length:repeats+1},(_,i)=>{
      const floated=i>0&&active&&levitate>0&&(slot===1||i*b.multi_hit_interval<=levitate);
      return floated||swiftSucceeds(sequence+i,t.prob,1);
    });
    const key=[active,...succeeds].map(Number).join('');
    const cached=cache.get(key);
    if(cached)return cached;
    let p=duelAttack(ctx,pen(succeeds[0]!),active,'physical',0,speed,{scale:active?b.atk_scale:1});
    for(let i=0;i<repeats;i++){
      const effects=pen(succeeds[i+1]!);
      p=extra(ctx,effects,p,{label:!active?'剑豪第二击':slot===1?'追加斩击':'轰击'+(i+1),
        type:'physical',scale:!active?1:slot===1?b.atk_scale:b.multi_atk_scale});
    }
    cache.set(key,p);
    return p;
  };
  const normal=make(false,0),skill=make(true,0);
  if(slot===3){
    // PRTS https://prts.wiki/w/艾丽妮 ：判决动画固定3.5秒且不受攻速影响。
    const volley:{at:number;damage:number}[]=[];
    model.lifecycle='timed';
    return duelClock(ctx,model,{normal,skill,length:()=>3.5,panel:()=>normal,
      shot:(st,p)=>{if(st.active)return 0; const amount=actionDamage(make(false,draw));draw+=2;return amount;},
      onCast:st=>{
        const phase=make(true,draw);
        draw+=1+b.multi_times;
        const first=phase.components.slice(0,phase.components.length-b.multi_times);
        for(const [i,part] of phase.components.slice(-b.multi_times).entries()){
          volley.push({at:st.time+(i+1)*b.multi_hit_interval,damage:part.perHit});
        }
        return first.reduce((sum,c)=>sum+(c.countsTowardDps?c.perHit*c.hitsPerAttack:0),0);
      },nextEvent:()=>volley[0]?.at??Infinity,event:()=>volley.shift()!.damage});
  }
  model.lifecycle='instant';
  return duelClock(ctx,model,{normal,skill,length:()=>0,nextAttack:slot===1,panel:st=>st.active&&slot===1?skill:normal,
    onCast:()=>{if(slot===1)return 0;const amount=actionDamage(make(true,draw));draw+=slot===2?1:1+b.multi_times;return amount;},
    shot:st=>{const amount=actionDamage(make(st.active&&slot===1,draw));draw+=2;return amount;}});
});
