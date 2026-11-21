import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { SkillOverride } from './index.ts';
import { battleEffects } from '../../effects/common.ts';
import { castMark, integrateWithCasts, type Segment } from '../../timeline.ts';
import { isBlocked, overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/乌尔比安 ：阻挡时S3优先自身格，返回标志物无攻击；船锚仅一次伤害。
// 单Boss倒下前没有击杀，血脉的哺养为0层；治疗、血量、阻挡数不增加单目标输出。
export const ulpiaOverride: SkillOverride = (context, generic) => {
  const { level, skill } = context;
  const external = generic.battle ?? battleEffects();
  const scale = context.tier.trait?.blackboard.nums.damage_scale;
  const e = scale && isBlocked(context.boss) ? { ...external, modifiers: [...external.modifiers,
    { group: '乌尔比安模组对阻挡目标增伤', kind: 'increase' as const, value: scale - 1, source: `module:${context.tier.uniEquipId}` }] } : external;
  const model = overrideBase(generic);
  const bb = level.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1'), s2 = skill.skillId.endsWith('_2');
  const source = `skill:${skill.skillId}`;
  const clock = new ShredClock(e);
  const make = (active: boolean, elapsed: number, anchor = false, damageEvents = 0) => phase(context, e, {
    ownerActions: anchor ? 0 : 1, active, elapsed, damageEvents, type: 'physical', scale: s1 && active || anchor ? bb.atk_scale : 1,
    modifiers: active && !s1 ? [{ stat: 'atk', bucket: 'pct', value: bb.atk!, source }] : [],
  });
  model.normal = make(false, 0);
  model.skill = make(true, 0);
  model.duration = s1 ? model.skill.stats.attackInterval : s2 ? Infinity : level.duration;
  model.lifecycle = s1 ? 'instant' : s2 ? 'permanent' : 'timed';
  model.burst = false;
  model.passive = false;
  if (!s1 && !s2) {
    const anchor = make(true, 0, true).components[0]!;
    model.skill.components.push({ ...anchor, label: '开启时船锚（一次）', source,
      hitsPerSec: 1 / level.duration, dps: anchor.perHit / level.duration });
    model.skill.dps += anchor.perHit / level.duration;
  }
  const rate = Math.max(0, level.increment + e.spRecovery);
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const wait = (need: number) => need <= 0 ? 0 : rate > 0 ? need / rate : Infinity;
  const first = wait(cost - Math.max(0, level.initSp + e.initSp));
  const recovery = wait(cost);
  let elapsed = 0;
  const append = (segments: Segment[], duration: number, active: boolean) => {
    const end = elapsed + duration;
    for (const boundary of [...e.timedStats.map(t => t.until).filter(t => t > elapsed && t < end).sort((a,b) => a-b), end]) {
      clock.append(segments, boundary - elapsed, count => make(active, elapsed, false, count));
      elapsed = boundary;
    }
  };
  const active = (segments: Segment[]) => {
    segments.push(castMark());
    if (!s1 && !s2) {
      const anchor = make(true, elapsed, true, clock.count).components.filter((hit, index) => !index || hit.source === 'bond:arcaneShip');
      segments.push({ duration: 0, dps: 0, burst: anchor.reduce((sum, hit) => sum + hit.perHit * hit.hitsPerAttack, 0) });
      clock.burst(anchor);
    }
    append(segments, model.duration, true);
  };
  const prefix: Segment[] = [], repeat: Segment[] = [];
  let afterFirst: Segment[] = [];
  let firstCount = 0;
  const expiry = Math.max(0, ...e.timedStats.map(t => t.until));
  append(prefix, first, false);
  if (Number.isFinite(first)) {
    active(prefix);
    afterFirst = [...prefix];
    firstCount = clock.count;
    while (!s2 && (elapsed < expiry || clock.count < clock.cap) && Number.isFinite(elapsed)) { append(prefix, recovery, false); if (Number.isFinite(elapsed)) active(prefix); }
    if (!s2 && Number.isFinite(elapsed)) { append(repeat, recovery, false); if (Number.isFinite(elapsed)) active(repeat); }
  }
  const cycle = s2 ? null : { spRecoverSec: recovery, skillDurationSec: model.duration,
    avgDps: Number.isFinite(recovery) ? repeat.reduce((sum,s)=>sum+s.duration*s.dps+(s.burst??0),0)/(recovery+model.duration) : make(false, Infinity).dps };
  model.customTimeline = (duration, hp) => ({ ...integrateWithCasts(prefix, repeat, duration, hp), cycle, notes: [], caveats: [] });
  model.caveats.push('单Boss击杀前血脉天赋为0层；满血不受击，治疗和额外阻挡不增加伤害。S3默认持续完整25秒，不手动提前结束。',
    'S3阻挡目标使船锚优先落在自身格；没有攻击型召唤物，返回标志只占位且不造成伤害。技能期DPS包含开启船锚按技能时长摊平的一次伤害。');
  if (s1) model.notes.push('近似：S1船锚替换一个完整攻击间隔，期间停止回技力；捕网位移对静止Boss不额外计伤');
  else if (!s2) model.notes.push('近似：S3船锚按开启时立刻命中，忽略飞行和移动动作时间；同格移动不另行刷新部署增益');
  if (!s2 && afterFirst.length) swiftCycles(model, level, cost, level.initSp + e.initSp, afterFirst, wait, (seconds, at) => {
    elapsed = Number.isFinite(at) ? at : expiry;
    const plan: Segment[] = [];
    append(plan, seconds, false);
    active(plan);
    return plan;
  }, expiry, clock, firstCount);
  return model;
};
