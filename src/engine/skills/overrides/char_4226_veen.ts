import { duelAttack, actionModel } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { extra } from './single-boss.ts';
import { actionDamage } from './shared.ts';
import type { PhaseResult } from '../../types.ts';

// 战争技艺排除仍受毒伤的目标。用真实普攻间隔推进储能与叠层，每份储能发射时才消耗一发弹药。
export const veenOverride = actionModel(['维伊有且只有一个静止目标；战争技艺结束前储存能量，转置能量折合三份，技能三的跳跃回到同一目标。毒伤从首次命中后一秒开始，重复施加只刷新持续时间和层数。'], (ctx,model) => {
  const e = model.battle!, b = ctx.level.blackboard.nums, slot = ctx.operator.skillIds.indexOf(ctx.skill.skillId)+1;
  const talent = ctx.tier.talents[0]!.blackboard.nums, poison = ctx.tier.talents[1]!.blackboard.nums;
  const storage = ctx.tier.trait!.blackboard.nums, moduleSpeed = ctx.tier.talents[2]?.blackboard.nums.attack_speed ?? 0;
  let charges = 0, layers = 0, poisonUntil = 0, poisonLayers = 0, nextTick = Infinity, ammo = 0;
  const memo = new Map<string,PhaseResult>();
  const body = (active: boolean) => {
    const key = [active,charges,layers].join('/');
    let p = memo.get(key);
    if (!p) {
      const transformed = charges >= storage.merge_cnt;
      const atk = (transformed ? talent.atk : 0) + (active ? layers * (b['attack@veen_s_2_buff[stack].atk'] ?? 0) : 0);
      const speed = (transformed ? 0 : talent.attack_speed) + (charges ? moduleSpeed : 0) + (active ? (b.attack_speed ?? 0) + layers * (b['attack@veen_s_2_buff[stack].attack_speed'] ?? 0) : 0);
      p = duelAttack(ctx,e,active,'arts',atk,speed,{ interval:ctx.tier.attributes.baseAttackTime + (active ? b.base_attack_time ?? 0 : 0) });
      memo.set(key,p);
    }
    return p;
  };
  const normal = body(false), first = body(true);
  const show = (p: PhaseResult) => extra(ctx,e,p,{label:'战争技艺', type:'arts', flat:poison['attack@value'], interval:1, independent:true});
  const shown = show(first), tick = shown.components.at(-1)!.perHit;
  model.lifecycle = slot === 3 ? 'ammo' : 'timed';
  return duelClock(ctx,model,{normal:show(normal),skill:shown,length:()=>slot === 3 ? Infinity : ctx.level.duration,
    panel:st=>body(st.active), onCast:()=>{layers=0;ammo=b['attack@trigger_time'] ?? 0;return 0;},onEnd:()=>{layers=0;},
    nextEvent:()=>nextTick,event:st=>{nextTick += 1;if(nextTick > poisonUntil + 1e-8) nextTick=Infinity;return st.time <= poisonUntil + 1e-8 ? tick * poisonLayers : 0;},
    shot:(st,p)=>{
      if (st.time < poisonUntil - 1e-8) {
        charges = Math.min(storage.times, charges + 1);
        return 0;
      }
      const released = st.active && slot === 3 ? Math.min(ammo,charges) : charges;
      let dealt = actionDamage(p);
      if (released) {
        let additional = extra(ctx,e,p,{ label:'储能',type:'arts',scale:1,hits:released });
        if (st.active && slot === 3) additional=extra(ctx,e,additional,{ label:'储能跳跃',type:'arts',scale:b['attack@bounce_atk_scale'],hits:released });
        dealt += additional.components.slice(p.components.length).reduce((sum,hit)=>sum+hit.perHit*hit.hitsPerAttack,0);
      }
      if(st.active && slot === 3) ammo -= released;
      if(st.active && slot === 2) layers = Math.min(b['attack@veen_s_2_buff[stack].max_stack_cnt'],layers+1+released);
      charges = 0;
      poisonUntil=st.time+poison['attack@duration'];
      poisonLayers=Math.min(poison['attack@max_stack_cnt'],1+released);
      nextTick=st.time+1;
      return dealt;
    }, endAfterShot:st=>st.active && slot === 3 && ammo<=0 });
});
