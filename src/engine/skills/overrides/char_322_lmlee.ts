import { duel, extra } from './single-boss.ts';
import { actionDamage, isBlocked } from './shared.ts';
import { duelClock } from './duel-clock.ts';
import type { SkillOverride } from './index.ts';

// 和气生财仅在阻挡时将攻速加成翻倍；驱凶辟邪攻速为携带被动，技能额外法伤独立于普攻。
const rotation = duel(({ ctx, s, b, t, attack, add }) => {
  const speed = (isBlocked(ctx.boss) ? 2 * t(0, 'lmlee_t_1[self].attack_speed') : 0) + (s === 2 ? b.attack_speed : 0);
  const normal = attack(false, 'physical', { speed });
  let skill = attack(true, 'physical', { speed, atk: b.atk });
  if (s === 2) {
    const stacks = Math.min(b.max_stack_cnt, Math.floor(b.paper_duration / normal.stats.attackInterval));
    skill = add(attack(true, 'none'), { label: '符咒爆炸', type: 'arts', scale: b.default_atk_scale + b.factor_atk_scale * stacks });
  }
  return { normal, skill, lifecycle: s === 2 ? 'instant' : 'permanent', duration: s === 2 ? 0 : Infinity, burst: s === 2,
    assumptions: ['老鲤费用充足，全程在场，周围八格只存在目标 Boss。', ...(s === 2 ? ['驱凶辟邪的符咒只统计老鲤本体的命中，在五秒截止或计数达到黑板上限时爆炸。若同帧到期，先结算旧标记。'] : [])] };
});

export const lmleeOverride: SkillOverride = (ctx, base) => {
  const model = rotation(ctx, base);
  if (!ctx.skill.skillId.endsWith('_2')) return model;
  const b=ctx.level.blackboard.nums, normal=model.normal;
  const marks: { end:number; hits:number }[]=[];
  const explosions=new Map<number,number>();
  const explode=(hits:number)=>{
    const known=explosions.get(hits);
    if(known!==undefined)return known;
    const attack=extra(ctx,model.battle!,normal,{label:'符咒爆炸',type:'arts',scale:b.default_atk_scale+b.factor_atk_scale*hits});
    const amount=attack.components.at(-1)!.perHit;
    explosions.set(hits,amount);
    return amount;
  };
  return duelClock(ctx,model,{normal,skill:model.skill!,length:()=>0,panel:()=>normal,
    onCast:st=>{marks.push({end:st.time+b.paper_duration,hits:0});return 0;},
    nextEvent:()=>marks[0]?.end??Infinity,event:()=>explode(marks.shift()!.hits),
    shot:(_st,panel)=>{
      let amount=actionDamage(panel);
      const hits=panel.components.reduce((n,c)=>n+(c.countsTowardDps&&c.perHit>0?c.hitsPerAttack:0),0);
      for(let i=marks.length-1;i>=0;i--){
        const mark=marks[i]!;
        mark.hits=Math.min(b.max_stack_cnt,mark.hits+hits);
        if(mark.hits>=b.max_stack_cnt){amount+=explode(mark.hits);marks.splice(i,1);}
      }
      return amount;
    }});
};
