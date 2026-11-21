import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { SkillOverride } from './index.ts';
import type { PhaseResult } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { castMark, integrateWithCasts, type Segment } from '../../timeline.ts';
import { overrideBase, phase, type PhaseOptions } from './shared.ts';
import { isDotSource } from '../../effects/skill-bonds.ts';

// https://prts.wiki/w/锏 ：暴击当次即穿防；S2阻挡三斩；S3十连斩每0.3秒+终结。
export const degenOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const external = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const bb = level.blackboard.nums;
  const talent = tier.talents[0]!.blackboard.nums;
  const legend = tier.talents[1]!.blackboard.nums;
  // PRTS https://prts.wiki/w/异常效果：战栗免疫时无法检测到战栗；SWO-Y 的入场效果不触发条件穿防。
  const immuneToEntry = legend.not_combat && context.boss.attributes?.immunities.disarmedCombatImmune;
  const penetration = immuneToEntry ? 0 : legend.def_penetrate!;
  const fixed = tier.trait?.blackboard.nums.def_penetrate_fixed ?? 0;
  const e = { ...external, defPenetrationFixed: external.defPenetrationFixed + fixed,
    stats: legend.atk ? [...external.stats, { stat: 'atk' as const, bucket: 'pct' as const, value: legend.atk, source: 'talent:blkkgt:2' }] : external.stats };
  const clock = new ShredClock(e);
  const moduleScale = tier.trait?.blackboard.nums.damage_scale ?? 1;
  const make = (active: boolean, scale: number, count: number, critical: boolean,
    { tremble, ...timing }: Pick<PhaseOptions, 'ownerActions' | 'fixedInterval'> & { tremble?: boolean } = {}) => phase(context, {
    ...e,
    defPenetrationPct: critical || tremble ? 1-(1-e.defPenetrationPct)*(1-penetration) : e.defPenetrationPct,
    modifiers: [...e.modifiers, ...(active ? [{group:'锏模组技能增伤',kind:'increase' as const,value:moduleScale-1,source:'trait:blkkgt'}] : [])],
  }, { ownerActions: 1, ...timing, active, type:'physical', scale:scale*(critical ? talent.atk_scale! : 1), hits:count, damageEvents:clock.count });
  const merge = (parts: PhaseResult[]): PhaseResult => ({...parts[0]!,components:parts.flatMap(p=>p.components),dps:parts.reduce((n,p)=>n+p.dps,0)});
  const expected = (active: boolean, scale: number, tremble = false) => merge([
    make(active,scale,2*(1-talent.prob!),false,{tremble}),make(active,scale,2*talent.prob!,true,{ownerActions:0}),
  ]);
  model.normal = expected(false,1);
  model.passive = false;
  model.burst = false;
  model.notes.push('近似：普攻及S1暴击逐段取伤害期望；未计随机暴击留下的战栗对后续非暴击的穿防，仅计暴击当次及S2/S3结束后确定的战栗窗口');
  if (e.timedStats.length) model.notes.push('近似：限时外部属性按部署时值计算，未分段重建到期效果');
  const rate = Math.max(0, level.spType === 'ON_ATTACK' ? 1/model.normal.stats.attackInterval : level.increment + e.spRecovery);
  const cost = Math.max(e.spCostMin,level.spCost*e.spCostScale);
  const wait = (need: number) => need <= 0 ? 0 : rate > 0 ? (level.spType === 'ON_ATTACK' ? Math.ceil(need) : need)/rate : Infinity;
  const first = wait(cost-Math.max(0,level.initSp+e.initSp));
  const recovery = wait(cost);
  const entryEnd = immuneToEntry ? 0 : legend.not_combat ?? 0;
  const attacks = (parts: Segment[], seconds: number, covered: number, active: boolean, scale: number) => {
    const window = Math.min(seconds, Math.max(0, covered));
    clock.append(parts,window,()=>expected(active,scale,true));
    clock.append(parts,seconds-window,()=>expected(active,scale));
  };
  let cast: (parts: Segment[], elapsed: number) => void;
  // 持续伤害（伊比利亚）按独立的每秒时钟由普攻阶段连续计入，斩击事件只结算本次动作的伤害。
  const hit = (parts: Segment[], packet: PhaseResult, delay: number) => {
    parts.push({duration:delay,dps:0,burst:packet.components.filter(c=>!isDotSource(c.source)).reduce((sum,c)=>sum+c.perHit*c.hitsPerAttack,0)});
    clock.burst(packet.components);
  };
  let guaranteed = 0;
  if (skill.skillId.endsWith('_1')) {
    model.skill = expected(true,bb.atk_scale_s1!);
    model.duration = model.skill.stats.attackInterval;
    model.lifecycle = 'instant';
    cast = (parts, elapsed) => attacks(parts,model.duration,entryEnd-elapsed,true,bb.atk_scale_s1!);
    model.notes.push('近似：S1以一个完整攻击间隔替换普攻，技能期间不回技力；攻击回复连续折算且双段不重复回复');
  } else if (skill.skillId.endsWith('_2')) {
    model.duration = 0;
    model.lifecycle = 'charge';
    model.burst = true;
    model.skill = make(true,bb.dot_scale!,bb['blkkgt_s_2[blocked].trig_cnt']!,true);
    cast = parts => { for (let index=0;index<bb['blkkgt_s_2[blocked].trig_cnt']!;index++) hit(parts,make(true,bb.dot_scale!,1,true,{ownerActions:index===0?1:0}),0); };
    guaranteed = talent.not_combat!;
    model.notes.push('近似：S2三斩合并为开启时伤害事件，未确认动画锁定及回技力阻塞时长；不等待两次充能，攻击回复每次普攻1点');
  } else {
    // 次数在游戏描述，黑板只存间隔。shortcut: 终结与回技力恢复置于连斩末，取得逐帧时序后替换。
    const count = Number(level.description.match(/总计(?:<[^>]+>)*(\d+)/)![1]);
    model.duration = count*bb.d_hit_interval!;
    model.lifecycle = 'timed';
    // 面板将十次连续斩击与终结斩的本体动作汇成一个盟约分项；时间轴在末端另结算终结斩。
    const slashes = make(true,bb.d_atk_scale!,count,true,{fixedInterval:model.duration,ownerActions:count+1});
    const final = make(true,bb.e_atk_scale_end!,1,true,{fixedInterval:model.duration,ownerActions:0});
    model.skill = merge([slashes,final]);
    cast = parts => {
      clock.append(parts,model.duration,()=>make(true,bb.d_atk_scale!,1,true,{fixedInterval:bb.d_hit_interval!}));
      hit(parts,make(true,bb.e_atk_scale_end!,1,true,{fixedInterval:model.duration}),0);
    };
    guaranteed = talent.not_combat!;
    model.notes.push('近似：S3十连斩按10×黑板间隔连续积分，终结斩置于末端并恢复技力；未确认额外起手及收尾动画时长，技能DPS为含终结斩的全技能平均');
    model.caveats.push('S3拖拽不额外造成伤害；静止被阻挡Boss只受每次斩击一次伤害，无敌和免控不改变本场景输出');
  }
  const rest = (seconds: number, elapsed = Infinity): Segment[] => {
    const parts: Segment[] = [];
    attacks(parts,seconds,Math.max(guaranteed,entryEnd-elapsed),false,1);
    parts.push(castMark());
    cast(parts,elapsed+seconds);
    return parts;
  };
  const prefix: Segment[] = [];
  if (entryEnd) model.notes.push('近似：没有敌方入场轨迹，地面单Boss首次进入范围按部署时触发战栗；不重复触发。');
  attacks(prefix,first,entryEnd,false,1);
  prefix.push(castMark());
  cast(prefix,first);
  const initialCount = clock.count, warmup: Segment[] = [];
  let elapsed = first + model.duration;
  while ((clock.count < clock.cap || elapsed < entryEnd) && Number.isFinite(recovery)) {
    const previous = clock.count;
    warmup.push(...rest(recovery,elapsed));
    elapsed += recovery + model.duration;
    if (Math.abs(clock.count-previous)<1e-9 && (elapsed >= entryEnd || !recovery && !model.duration)) break;
  }
  const repeat = rest(recovery);
  model.customTimeline = (duration,hp) => ({...integrateWithCasts([...prefix,...warmup],repeat,duration,hp),cycle:{
    spRecoverSec:recovery,skillDurationSec:model.duration,
    avgDps:Number.isFinite(recovery) ? (repeat.reduce((sum,s)=>sum+s.duration*s.dps+(s.burst??0),0))/(recovery+model.duration) : model.normal.dps,
  },notes:[],caveats:[]});
  swiftCycles(model, level, cost, level.initSp + e.initSp, prefix, wait, rest, entryEnd, clock, initialCount);
  return model;
};
