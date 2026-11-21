import { damage } from '../../damage.ts';
import { swiftSucceeds } from '../../swift.ts';
import type { DamageComponent, PhaseResult } from '../../types.ts';
import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';

// PRTS https://prts.wiki/w/克莱门莎 ：对敌侵蚀爆发为5000元素伤害、8秒锁条、可叠加的永久减防120。
// 旷地放逐舱以2格/秒飞行3格；舰炮弹道持续3.5秒，每秒产生一次效果，共三次。
export const override = actionModel([
  '只攻击同一个静止地面目标。每次物理伤害独立判定第一天赋；穿透不改变敌人自身防御，爆发的永久减防可以提高后续判定概率。',
], (ctx, model) => {
  const slot = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
  const b = ctx.level.blackboard.nums, talent = ctx.tier.talents[0]!.blackboard.nums;
  const e = model.battle!, attributes = ctx.boss.attributes;
  const threshold = ctx.boss.levelType === 'BOSS' || !ctx.boss.levelType ? 2000 : 1000;
  const buildup = Math.max(0, 1 - (attributes?.epResistance ?? 0) / 100);
  const baseDef = attributes?.def ?? 0;
  const burst = damage({type:'elemental',attack:5000,target:ctx.boss,epDamageResistance:attributes?.epDamageResistance}).perHit;
  const castDescription = slot === 1 ? '冲蚀只有强化攻击附加侵蚀，按本次本体实际单段伤害计算。'
    : slot === 2 ? '放逐舱向前移动三格，1.5秒内本体缴械。Boss处于落点的漩涡内，落点后每满一秒结算一段物理伤害和200点侵蚀，至技能结束。放逐舱碰撞不造成伤害。'
    : '每次实际爆条时消耗一发弹药。舰炮在发射后的1、2、3秒分别结算物理和元素伤害，最后一发耗尽即可回技，已发射的舰炮继续命中。';
  model.assumptions!.push(castDescription);
  model.notes.push('近似：' + castDescription);
  const ratio = slot === 1 ? b.ep_damage_ratio : slot === 3 ? b['attack@ep_damage_ratio'] : 0;
  const rawScale = slot === 1 ? b.atk_scale : slot === 2 ? b['attack@aoe_atk_scale'] : b['attack@atk_scale'];
  let reduction = 0, gauge = 0, unlock = 0, ammo = 0, draw = 0;
  let nextField = Infinity, fieldEnd = 0, hasSkillHit = false;
  const shells: number[] = [];
  type HitKind = 'normal' | 'active' | 'field' | 'shell' | 'element';
  const cache = new Map<string, PhaseResult>();
  const panel = (kind: HitKind, critical = false) => {
    const key = kind + '/' + reduction + '/' + critical;
    const known = cache.get(key);
    if (known) return known;
    const body = kind === 'normal' || kind === 'active';
    const physical = kind !== 'element';
    const ratio = kind === 'active' ? rawScale : kind === 'field' ? b['attack@physical_atk_scale']
      : kind === 'shell' ? b.s3_atk_scale : kind === 'element' ? b.ep_damage_scale : 1;
    const fx = {...e, defReductionFixed:e.defReductionFixed + reduction};
    const effects = body ? fx : {...fx, attackScale:1, extraHits:[], dots:[], splash:undefined, judgment:undefined, kazimierz:undefined, atkProc:undefined};
    const result = duelAttack(ctx,effects,kind !== 'normal',physical ? 'physical' : 'elemental',0,kind === 'active' ? b.attack_speed ?? 0 : 0,{
      scale:ratio*(critical ? talent.t1_atk_scale : 1), ownerActions:body ? 1 : 0, fixedInterval:body ? undefined : 1,
    });
    cache.set(key,result);
    return result;
  };
  const hit = (kind: Exclude<HitKind,'element'>) => {
    const unchanged = panel(kind);
    const reduced = baseDef > 0 && e.defReductionFixed + reduction > 0;
    const probability = reduced ? talent.prob_special : talent.prob_normal;
    return unchanged.components[0]!.damageType === 'physical' && swiftSucceeds(draw++,probability) ? panel(kind,true) : unchanged;
  };
  const addGauge = (time: number, addition: number, active: boolean) => {
    if (time < unlock - 1e-8 || addition <= 0) return 0;
    gauge += addition * buildup;
    if (gauge < threshold - 1e-8) return 0;
    gauge = 0;
    unlock = time + 8 / (1 + (e.erosionRecoverySpeed ?? 0));
    reduction = Math.min(baseDef,reduction + 120);
    if (active && slot === 3 && ammo > 0) {
      ammo--;
      for (const delay of [1,2,3]) shells.push(time + delay);
      shells.sort((a,b)=>a-b);
    }
    return burst;
  };
  const normal = panel('normal');
  const skill = {...panel('active'),components:[...panel('active').components]};
  const example = (template: DamageComponent, label: string, value:number, interval:number, counts=true):DamageComponent=>({
    ...template, label, source:'talent:clemnt:'+label, hitsPerAttack:0, perHit:value,
    hitsPerSec:interval > 0 ? 1/interval : 0, dps:counts && interval>0 ? value/interval : 0, countsTowardDps:counts,
  });
  if (slot === 2) {
    const field = panel('field').components[0]!;
    skill.components.push(example(field,'漩涡每秒物理伤害',field.perHit,1));
    skill.dps += field.perHit;
  }
  const elementTemplate = {...skill.components[0]!,damageType:'elemental' as const};
  const addition = slot===2 ? b['attack@water_element'] : skill.components[0]!.perHit*ratio;
  skill.components.push(example(elementTemplate,'侵蚀损伤积累',addition*buildup,0,false),example(elementTemplate,'侵蚀爆发',burst,0));
  if(slot===3) {
    const shot=panel('shell').components[0]!, element=panel('element').components[0]!;
    skill.components.push(example(shot,'舰炮每跳物理伤害',shot.perHit,0),example(element,'舰炮每跳元素伤害',element.perHit,0));
  }
  const amount = slot===2 ? addition : addition/skill.stats.attackInterval;
  model.elemental = {perSec:amount*buildup,note:slot===1?'强化攻击每击积累所列损伤，积累速率为强化攻击间隔内的值；普通攻击不积累。':'技能期未爆发时的基础积累速率，实际受暴击、当前防御与爆发锁条影响。'};
  model.lifecycle = slot === 1 ? 'instant' : slot === 2 ? 'timed' : 'ammo';
  const flight = 3/2;
  const result = duelClock(ctx,model,{
    normal,skill,length:()=>slot===1 ? 0 : slot===2 ? ctx.level.duration : Infinity,
    nextAttack:slot===1, panel:st=>panel(st.active ? 'active' : 'normal'),
    onCast:st=>{
      if(slot===2){nextField=st.time+flight+1;fieldEnd=st.time+ctx.level.duration;}
      if(slot===3)ammo=b.trigger_time;
      return 0;
    },
    nextShotAfterCast:slot===2 ? st=>st.time+flight+skill.stats.attackInterval : undefined,
    onEnd:()=>{if(slot===2)nextField=Infinity;},
    nextEvent:()=>Math.min(nextField,shells[0]??Infinity),
    event:st=>{
      let amount=0;
      if(nextField<=st.time+1e-8){
        amount+=actionDamage(hit('field'))+addGauge(st.time,b['attack@water_element'],st.active);
        nextField+=1;
        if(nextField>fieldEnd+1e-8)nextField=Infinity;
      }
      while(shells.length && shells[0]!<=st.time+1e-8){
        shells.shift();
        amount+=actionDamage(hit('shell'))+actionDamage(panel('element'));
      }
      return amount;
    },
    shot:st=>{
      const phase=hit(st.active?'active':'normal'), primary=phase.components[0]!;
      if(st.active && !hasSkillHit){
        hasSkillHit=true;
        skill.components[0]={...primary};
        if(ratio){
          const entry=skill.components.find(c=>c.label==='侵蚀损伤积累')!;
          entry.perHit=primary.perHit*primary.hitsPerAttack*ratio*buildup;
          model.elemental!.perSec=entry.perHit/phase.stats.attackInterval;
        }
      }
      return actionDamage(phase)+(st.active && ratio ? addGauge(st.time,primary.perHit*primary.hitsPerAttack*ratio,true) : 0);
    },
    endAfterShot:st=>st.active && slot===3 && ammo===0,
  });
  if(slot===3){
    const run=result.customTimeline!;
    result.customTimeline=(duration,hp)=>{
      const timeline=run(duration,hp);
      const [start,next]=timeline.castsUntil?.(720)??[];
      const [end]=timeline.endsUntil?.(720)??[];
      if(start===undefined || end===undefined)return timeline;
      return {...timeline,firstSkill:{...timeline.firstSkill!,start,end,includesEndHit:true},
        cycle:next===undefined?null:{skillDurationSec:end-start,spRecoverSec:next-end,
          avgDps:(timeline.at!(next-1e-7)-timeline.at!(start-1e-7))/(next-start)}};
    };
  }
  return result;
});
