import { battleEffects } from '../../effects/common.ts';
import { firstSkillAt, integrate, type Segment } from '../../timeline.ts';
import type { SkillOverride } from './index.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { actionDamage, overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/阿米娅(医疗) ：咒愈师普攻为法伤，慈悲愿景先按目标数加攻，再造成范围伤害。
export const amiya3Override: SkillOverride = (context, generic) => {
  const { skill, level } = context;
  const model = overrideBase(generic);
  model.caveats.push('咒愈师的普攻造成法术伤害。满血场景下，咒愈治疗及诚挚期许的生命恢复不增加对 Boss 的伤害。');
  if (skill.skillId === 'skchr_amiya3_1') {
    // 哀恸共情的攻速和持续时间由通用模型直接读技能黑板。
    model.rebuild = generic.rebuild;
    return model;
  }

  const e = generic.battle ?? battleEffects();
  const bb = level.blackboard.nums;
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const need = Math.max(0, cost - Math.max(0, level.initSp + e.initSp));
  const rate = level.increment + e.spRecovery;
  const first = need === 0 ? 0 : rate > 0 ? need / rate : Infinity;
  const end = first + level.duration;
  const modifiers = [{ stat: 'atk' as const, bucket: 'pct' as const, value: bb.atk!,
    source: `skill:${skill.skillId}:atk` }];
  const openingAt = (damageEvents: number) => phase(context, e, { active: true, elapsed: first, ownerActions: 1, modifiers, damageEvents,
    type: 'arts', scale: bb.atk_scale, fixedInterval: level.duration });
  const opening = openingAt(0);
  opening.components[0]!.label = '慈悲愿景·开场法术伤害';
  const attack = (active: boolean, elapsed: number, damageEvents = 0) => phase(context, e, { active, elapsed, damageEvents,
    ownerActions: 1, type: active ? 'true' : 'arts', modifiers: active ? modifiers : [] });
  const sustained = attack(true, first);
  model.skill = { stats: sustained.stats, components: [...opening.components, ...sustained.components],
    dps: opening.dps + sustained.dps };
  model.caveats.push(`慈悲愿景全战只发动一次。单个 Boss 提供一层攻击力，起手法伤后 ${level.duration} 秒内的普攻造成真实伤害，技能结束后恢复法术普攻。`);

  const boundaries = [...new Set([0, first, end, ...e.timedStats.map(t => t.until), e.judgment?.until ?? 0, Infinity])]
    .sort((a, b) => a - b);
  const segments: Segment[] = [];
  const clock = new ShredClock(e);
  for (let i = 0; i < boundaries.length - 1; i++) {
    const time = boundaries[i]!;
    if (time === first) {
      const hit = openingAt(clock.count);
      // 起手只结算本次动作的伤害分项；伊比利亚持续伤害沿独立每秒时钟由普攻阶段计入。
      segments.push({duration:0, dps:0, burst: actionDamage(hit)});
      clock.burst(hit.components);
    }
    clock.append(segments, boundaries[i + 1]! - time, count => attack(time >= first && time < end, time, count));
  }
  model.customTimeline = (duration, hp) => ({ ...integrate(segments, [], duration, hp), cycle: null, notes: [], caveats: [],
    at: t => integrate(segments, [], t, Infinity).totalDamage, firstSkill: firstSkillAt(first, level.duration) });
  return model;
};
