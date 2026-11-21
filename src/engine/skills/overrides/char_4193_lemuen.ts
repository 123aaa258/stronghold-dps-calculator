import { swiftCycles } from './swift.ts';
import { isDotSource } from '../../effects/skill-bonds.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { SkillOverride } from './index.ts';
import type { StatModifier } from '../../stats.ts';
import { battleEffects } from '../../effects/common.ts';
import { castMark, endMark, integrateWithCasts, type Segment } from '../../timeline.ts';
import { overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/蕾缪安 ：通缉8秒；弹药扩容仅开技时；S2固定后摇1.2秒；
// S3可重复锁定同一目标，结束时快照攻击，随后每0.3秒一弹，轰炸不触发模组回技力。
export const lemuenOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill, boss } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const bb = level.blackboard.nums;
  const wanted = tier.talents[0]!.blackboard.nums;
  const growth = tier.talents[1]!.blackboard.nums;
  const wantedAt = boss.levelType === 'BOSS' || boss.levelType === 'ELITE' ? wanted.interval! : Infinity;
  const mature = Math.max(growth.interval!,Number.isFinite(wantedAt) ? wantedAt : 0,...e.timedStats.map(x=>x.until));
  const s1 = skill.skillId.endsWith('_1');
  const s2 = skill.skillId.endsWith('_2');
  const clock = new ShredClock(e);
  const make = (time: number, active = false, aiming = s2 && time >= wantedAt, damageEvents = clock.count) => {
    const modifiers: StatModifier[] = [];
    if (time >= growth.interval!) modifiers.push({stat:'atk',bucket:'pct',value:growth.atk!,source:'talent:lemuen:2'});
    if (active && s2) modifiers.push({stat:'atk',bucket:'pct',value:bb.atk!,source:`skill:${skill.skillId}`},
      {stat:'attackSpeed',bucket:'direct',value:bb.attack_speed!,source:`skill:${skill.skillId}`});
    return phase(context, {...e, modifiers:[...e.modifiers,...(time >= wantedAt ? [{group:'通缉伤害提升',kind:'increase' as const,value:wanted.damage_scale!-1,source:'talent:lemuen:1'}] : [])]}, {
      ownerActions: 1,active,type:'physical',elapsed:time,modifiers,damageEvents,
      scale:!active ? 1 : s1 ? bb['attack@atk_scale']! : s2 ? aiming ? bb['attack@fin_atk_scale']! : 1 : bb['attack@proj_atk_scale_1']!,
      // PRTS机制值而非游戏黑板；瞄准不受攻速影响，终结提前瞄准尚未逐血量求解。
      fixedInterval:active && s2 && aiming ? bb['attack@aim_duration']!+1.2 : active && !s1 && !s2 ? bb['attack@aim_interval']! : undefined,
    });
  };
  model.normal = make(mature);
  model.skill = make(mature,true);
  model.lifecycle = 'ammo';
  model.passive = false;
  model.burst = false;
  const ammo = (time: number) => bb['attack@trigger_time']!+(time >= growth.interval! ? growth.add_count! : 0);
  model.duration = ammo(mature)*model.skill.stats.attackInterval;
  const rate = Math.max(0,(s1 ? 1/model.normal.stats.attackInterval : level.increment + e.spRecovery) + (tier.trait?.blackboard.nums.sp ?? 0)/model.normal.stats.attackInterval);
  const cost = Math.max(e.spCostMin,level.spCost*e.spCostScale);
  const wait = (need: number) => need <= 0 ? 0 : rate > 0 ? need/rate : Infinity;
  const first = wait(cost-Math.max(0,level.initSp+e.initSp));
  const recovery = wait(cost);
  model.notes.push('近似：模组未击倒回技力按存活Boss每次普攻1点连续折算，技能期间不回复；攻击回复每次普攻1点，非每段伤害');
  if (e.timedStats.length) model.notes.push('近似：限时属性伤害在到期时分段，但回技力与弹药持续仍按稳定攻击间隔折算');
  if (s2) model.notes.push('近似：S2按最大瞄准时长与1.2秒强制后摇计算，未模拟低血量提前结束瞄准；击杀时间可能偏晚，来源：PRTS蕾缪安技能备注');
  if (!s1 && !s2) {
    model.notes.push('近似：S3按弹数×0.5秒锁定，结束时首弹落地后每0.3秒轰炸；忽略首轮锁定与弹道延迟，轰炸阶段恢复普攻及技力；技能DPS将全部轰炸伤害除以锁定时长');
    if (recovery < (ammo(mature)-1)*0.3) model.notes.push('近似：外部技力使S3在上轮轰炸完成前就绪，未模拟跨轮重叠；剩余轰炸压缩至再次开启前');
  }
  model.caveats.push('单Boss在自身范围内累计通缉；S1额外目标不重复命中；扩容只对天赋生效后开启的技能生效');
  let time = 0;
  const cuts = [wantedAt,growth.interval!,...e.timedStats.map(x=>x.until)].filter(Number.isFinite).sort((a,b)=>a-b);
  const append = (plan: Segment[], seconds: number, active: boolean, silent = false) => {
    const end = time+seconds;
    for (const stop of [...cuts.filter(t=>t>time && t<end),end]) {
      if (silent) plan.push({duration:stop-time,dps:0});
      else clock.append(plan, stop-time, count => make(time,active,undefined,count));
      time = stop;
    }
  };
  const cast = (plan: Segment[]) => {
    plan.push(castMark());
    const count = ammo(time);
    if (!s1 && !s2) append(plan, count * bb['attack@aim_interval']!, true, true);
    else {
      if (s2 && time < wantedAt) append(plan, wantedAt - time, true);
      append(plan, count * make(time,true).stats.attackInterval, true);
    }
    // 首轮弹药数与通缉等待使实际技能时长不同于名义时长。
    plan.push(endMark());
    return count;
  };
  const rest = (plan: Segment[], seconds: number, count: number) => {
    if (s1 || s2) { append(plan, seconds, false); return; }
    // 轰炸间隔 0.3 秒取自 PRTS；模型近似在下一次锁定前结算剩余轰炸。
    let remaining = seconds;
    const firedAt = time;
    for (let i=0;i<count;i++) {
      // 持续伤害按独立的每秒时钟结算，不随轰炸事件结算。
      const hits = make(firedAt,true).components.filter(c => !isDotSource(c.source));
      const shot = hits.reduce((n,c)=>n+c.perHit*c.hitsPerAttack,0);
      plan.push({duration:0,dps:0,burst:shot});
      clock.burst(hits);
      if (i+1 < count) {
        const gap = Math.min(0.3, remaining);
        append(plan, gap, false);
        remaining -= gap;
      }
    }
    append(plan, remaining, false);
  };
  const cycle = (plan: Segment[]) => rest(plan, recovery, cast(plan));
  const prefix: Segment[] = [];
  append(prefix,first,false);
  // 非精英目标永不通缉，S2只加面板属性而不消耗弹药。
  if (s2 && wantedAt === Infinity) {
    prefix.push(castMark());
    append(prefix,Infinity,true);
    model.duration = Infinity;
    model.customTimeline = (duration,hp) => ({...integrateWithCasts(prefix,[],duration,hp),cycle:null,notes:[],caveats:[]});
    return model;
  }
  if (!Number.isFinite(first)) {
    model.customTimeline = (duration,hp) => ({...integrateWithCasts(prefix,[],duration,hp),cycle:null,notes:[],caveats:[]});
    return model;
  }
  // 先展开跨天赋启动边界的首轮，之后固定循环可直接复用积分器。
  do { cycle(prefix); } while (time < mature || clock.count < clock.cap && Number.isFinite(time));
  if (!Number.isFinite(time)) {
    model.customTimeline = (duration,hp) => ({...integrateWithCasts(prefix,[],duration,hp),cycle:null,notes:[],caveats:[]});
    return model;
  }
  const repeat: Segment[] = [];
  cycle(repeat);
  const period = repeat.reduce((n,s)=>n+s.duration,0);
  const total = repeat.reduce((n,s)=>n+s.duration*s.dps+(s.burst??0),0);
  model.customTimeline = (duration,hp) => ({...integrateWithCasts(prefix,repeat,duration,hp),cycle:{spRecoverSec:recovery,skillDurationSec:model.duration,avgDps:total/period},notes:[],caveats:[]});
  if (e.skillEndProbability && e.skillEndSp) {
    time = 0;
    clock.reset(0);
    const firstCast: Segment[] = [];
    const stable = mature + model.duration;
    const discreteWait = (need: number) => {
      const onHit = (s1 ? 1 : 0) + (tier.trait?.blackboard.nums.sp ?? 0);
      if (!onHit) return wait(need);
      const interval = model.normal.stats.attackInterval;
      const passive = s1 ? 0 : Math.max(0, level.increment + e.spRecovery);
      const hits = Math.ceil(need / (onHit + interval * passive));
      const after = Math.max(0, hits - 1);
      return Math.min(hits * interval, passive > 0 ? (need - after * onHit) / passive : Infinity);
    };
    // 首轮也按自然技力与整次普攻中先到达消耗者计算。
    clock.reset(0);
    append(firstCast, discreteWait(Math.max(0, cost - level.initSp - e.initSp)), false);
    cast(firstCast);
    swiftCycles(model, level, cost, level.initSp + e.initSp, firstCast, discreteWait, (seconds, at) => {
      time = Number.isFinite(at) ? at : stable;
      const plan: Segment[] = [];
      const prevAmmo = ammo(time - model.duration);
      rest(plan, seconds, prevAmmo);
      cast(plan);
      return plan;
    }, stable, clock);
  }
  return model;
};
