import { duel } from './single-boss.ts';
import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { extra } from './single-boss.ts';
import { actionDamage } from './shared.ts';
import { hpSwitch } from './hp-switch.ts';
import type { SkillOverride } from './index.ts';

// 单 Boss 仅承受链条首击；辉煌裂片雷暴落点唯一，每半秒额外攻击一次。
const energy = (high: boolean) => duel(({ ctx, e, s, b, t, attack }) => {
  const amp = high ? t(0, 'pasngr_t_1[enhance].damage_scale') || 1 : 1;
  const effects = { ...e, modifiers: [...e.modifiers, { kind: 'increase' as const, group: 'pasngr-analysis',
    value: amp - 1, source: 'talent:pasngr:1' }] };
  const normal = attack(false, 'arts', { effects, atk: t(1, 'atk') });
  const skill = attack(true, 'arts', { effects, atk: t(1, 'atk') + (b.atk ?? 0),
    scale: b['pasngr_s_1.atk_scale'], delay: b.base_attack_time });

  return { normal, skill, lifecycle: s === 1 ? 'instant' : 'timed', duration: s === 1 ? skill.stats.attackInterval : ctx.level.duration,
    burst: false, assumptions: ['异客四周四格无敌人，触发孤卒；按自身伤害越过血线后再保留机理分析的持续时间。'] };
});
// 雷暴使用独立时钟，释放后本体继续普攻、回复技力，多个雷暴的命中逐个结算。
const storm = actionModel(['Boss 始终在雷暴中心且是唯一目标；首跳按施放后半秒结算。异客四周四格无敌人，机理分析按自身累计伤害追踪血线。'],(ctx,model)=>{
  const b=ctx.level.blackboard.nums, t=ctx.tier.talents[0]!.blackboard.nums, team=ctx.tier.talents[1]!.blackboard.nums.atk??0;
  const e=model.battle!, threshold=(ctx.targetHp??Infinity)*(1-t.hp_ratio);
  const create=(high:boolean)=>{
    const effects={ ...e,modifiers:[...e.modifiers,{kind:'increase' as const,group:'pasngr-analysis',value:high?t['pasngr_t_1[enhance].damage_scale']-1:0,source:'talent:pasngr:1'}]};
    const body=duelAttack(ctx,effects,false,'arts',team);
    const preview=extra(ctx,effects,body,{label:'雷暴额外攻击',type:'arts',scale:b.atk_scale,interval:b.interval});
    return { body,preview,tick:preview.components.at(-1)!.perHit };
  };
  const high=create(true),low=create(false), clouds:{next:number;end:number}[]=[];
  let dealt=0,expiry=Infinity;
  const hit=(time:number,amount:number)=>{if(dealt<threshold&&dealt+amount>=threshold)expiry=time+t['pasngr_t_1[enhance].duration'];dealt+=amount;return amount;};
  model.lifecycle='instant';
  return duelClock(ctx,model,{normal:high.body,skill:high.preview,length:()=>0,panel:st=>st.time<expiry?high.body:low.body,
    shot:(st,p)=>hit(st.time,actionDamage(p)),onCast:st=>{clouds.push({next:st.time+b.interval,end:st.time+b.duration});return 0;},
    nextEvent:()=>Math.min(...clouds.map(c=>c.next)),event:st=>{
      let sum=0;
      for(let i=clouds.length-1;i>=0;i--){const cloud=clouds[i];if(cloud.next>st.time+1e-9)continue;
        sum+=hit(st.time,(st.time<expiry?high:low).tick);cloud.next+=b.interval;if(cloud.next>cloud.end+1e-9)clouds.splice(i,1);}
      return sum;
    }});
});
export const pasngrOverride: SkillOverride = (ctx, model) => {
  if(ctx.skill.skillId.endsWith('_3'))return storm(ctx,model);
  const data = ctx.tier.talents[0]!.blackboard.nums;
  return hpSwitch(energy(true), energy(false), data.hp_ratio, data['pasngr_t_1[enhance].duration'])(ctx, model);
};
