import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { extra } from './single-boss.ts';
import { swiftSucceeds } from '../../swift.ts';
import { actionDamage } from './shared.ts';

// 连续攻击同一目标时，浮游单元的每次命中都从本阶级 trait 取得下一次倍率。
export const malistOverride=actionModel(['至简和一个浮游单元锁定同一目标。天赋按本次攻击动作的固定序列判定，单元同步使用本次倍率；二连击逐段递增单元倍率。'],(ctx,model)=>{
  const b=ctx.level.blackboard.nums,e=model.battle!,two=ctx.skill.skillId==='skchr_malist_2';
  const trait=ctx.tier.trait!.blackboard.nums,t=ctx.tier.talents[0]!.blackboard.nums;
  const make=(active:boolean,critical:boolean)=>duelAttack(ctx,e,active,'arts',active?b.atk:0,active?b.attack_speed:0,{
    hits:active&&two?2:1,scale:(active&&two?b.atk_scale:1)*(critical?t.atk_scale:1) });
  const bodies=[make(false,false),make(true,false),make(false,true),make(true,true)];
  const droneDamage = new Map<string,number>();
  let hits=0;
  const preview=(active:boolean)=>{
    const body=bodies[Number(active)];
    return extra(ctx,e,body,{ label:'浮游单元',type:'arts',scale:trait.init_atk_scale*(active&&two?b.atk_scale:1) });
  };
  model.lifecycle=two?'instant':'timed';
  return duelClock(ctx,model,{normal:preview(false),skill:preview(true),length:()=>two?0:ctx.level.duration,nextAttack:two,
    panel:st=>bodies[Number(st.active)+2*Number(swiftSucceeds(st.attack,t.prob,1))],
    shot:(st,p)=>{
      let amount=actionDamage(p);
      const scale=(swiftSucceeds(st.attack,t.prob,1)?t.atk_scale:1)*(st.active&&two?b.atk_scale:1);
      for(let n=st.active&&two?2:1;n>0;n--){
        const rate=Math.min(trait.max_atk_scale,trait.init_atk_scale+hits++*trait.delta_atk_scale);
        const key=p.stats.atk+'/'+(rate*scale);
        let hit=droneDamage.get(key);
        if(hit===undefined){
          hit=extra(ctx,e,p,{label:'浮游单元',type:'arts',scale:rate*scale}).components.at(-1)!.perHit;
          droneDamage.set(key,hit);
        }
        amount+=hit;
      }
      return amount;
    }});
});
