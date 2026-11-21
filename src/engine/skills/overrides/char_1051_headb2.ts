import { duel } from './single-boss.ts';
import { triggerCount } from './duel-effects.ts';
import { duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import type { SkillOverride } from './index.ts';

// 万众巨潮与技能加攻加算；绝不罢休仅第二轮进入无限增强态，五连锤的强化在每次锤击后叠加。
const rotation = duel(({ ctx, e, s, b, t, attack, add }) => {
  const team = t(1, 'atk') * t(1, 'scale_bonus');
  const track = s === 2 ? triggerCount(e, 'headb2-second', 'skill', 2) : { count: 0, effects: e };
  const normal = attack(false, 'physical', { effects: track.effects });
  let skill = attack(true, 'physical', { effects: track.effects, atk: team + (track.count >= 2 ? b['headb2_s_2[second].atk'] : b.atk ?? 0), speed: b.attack_speed });
  if (s === 3) {
    skill = attack(true, 'none', { atk: team + b.atk_base });
    for (let i = 0; i < 5; i++) {
      const swing = attack(true, 'physical', { atk: team + b.atk_base + i * b.atk_step, scale: b.atk_scale });
      if (i === 0) skill = swing;
      else skill = add(skill, { label: '锤击' + (i + 1), type: 'physical', flat: swing.stats.atk * b.atk_scale });
    }
  }
  return { normal, skill, battle: track.effects, lifecycle: s === 3 ? 'instant' : 'timed',
    duration: s === 3 ? 0 : ctx.level.duration, repeatDuration: s === 2 ? Infinity : undefined, burst: s === 3,
    assumptions: ['怒潮凛冬自身属于乌萨斯学生自治团，技能期天赋加成翻倍；单 Boss 场景未指定高台，未计算高台二次溅射与回技。', ...(s === 3 ? ['五次连续锤击固定相隔1.8秒，期间不普攻。以第一锤为开技时刻，第五锤命中后恢复正常活动，忽略动画前后摇。'] : [])] };
});
export const headb2Override: SkillOverride = (ctx,base)=>{
  const model=rotation(ctx,base);
  if(!ctx.skill.skillId.endsWith('_3'))return model;
  // PRTS https://prts.wiki/w/怒潮凛冬 ：五连锤间隔固定1.8秒，不受攻速影响。
  const b=ctx.level.blackboard.nums, t=ctx.tier.talents[1]!.blackboard.nums;
  const team=t.atk*t.scale_bonus, interval=1.8;
  const damages=Array.from({length:5},(_,i)=>actionDamage(duelAttack(ctx,model.battle!,true,'physical',team+b.atk_base+i*b.atk_step,0,{scale:b.atk_scale})));
  let index=0,at=Infinity,finish=-Infinity;
  model.lifecycle='timed';
  const result=duelClock(ctx,model,{normal:model.normal,skill:model.skill!,length:()=>4*interval,panel:()=>model.normal,
    onCast:st=>{index=1;at=st.time+interval;finish=st.time+4*interval;return damages[0]!;},
    nextEvent:()=>at,event:()=>{const amount=damages[index++]!;at=index<damages.length?at+interval:Infinity;return amount;},
    shot:(st,p)=>st.time<=finish+1e-9?0:actionDamage(p)});
  const run=result.customTimeline!;
  result.customTimeline=(duration,hp)=>{const r=run(duration,hp);return {...r,firstSkill:r.firstSkill&&{...r.firstSkill,includesEndHit:true}};};
  return result;
};
