import type { SkillOverride } from './index.ts';
import { arcaneOnly, overrideBase, phase } from './shared.ts';
import { battleEffects } from '../../effects/common.ts';

// https://prts.wiki/w/圣聆初雪：单敌模组增伤3%；S2积雪持续伤害无需移动，保护目标召唤物不攻击。
export const sbellOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const model = overrideBase(generic);
  const original = generic.battle ?? battleEffects();
  const bb = level.blackboard.nums;
  const first = skill.skillId.endsWith('_1');
  const second = skill.skillId.endsWith('_2');
  const moduleBonus = tier.talents.find(t => 'damage_scale' in t.blackboard.nums)?.blackboard.nums.damage_scale ?? 0;
  const external = { ...original, modifiers: [...original.modifiers, { group: 'sbell-module', kind: 'increase' as const, value: moduleBonus, source: `module:${tier.uniEquipId}` }] };
  const modifiers = [
    { stat: 'atk' as const, bucket: 'pct' as const, value: bb.atk ?? 0, source: `skill:${skill.skillId}` },
    { stat: 'attackSpeed' as const, bucket: 'direct' as const, value: bb.attack_speed ?? 0, source: `skill:${skill.skillId}` },
  ];
  const make = (elapsed = 0, damageEvents = 0) => {
    const result = phase(context, first ? arcaneOnly(external) : external, { ownerActions: first ? 0 : 1, active: true, modifiers, elapsed, damageEvents,
      scale: bb.atk_scale ?? bb['attack@atk_scale_s2'] ?? bb['attack@atk_scale_s3'],
      resPenetrationFixed: bb.magic_resist_penetrate_fixed ?? 0 });
    if (second) {
      // 攻击范围内可通行地面会积雪，Boss静止且不离开，故持续伤害存在；经过的天赋瞬时伤害不计。
      const snow = phase(context, { ...arcaneOnly(external), attackScale: 1 }, { active: true, elapsed, damageEvents, fixedInterval: 1, scale: bb['talent@s2_magic_scale'] });
      const component = snow.components[0];
      component.label = '积雪持续法术伤害'; component.source = `skill:${skill.skillId}:talent@s2_magic_scale`;
      component.hitsPerSec = 1; component.hitsPerAttack = 1; component.dps = component.perHit;
      for (const hit of snow.components) hit.hitsPerAttack = hit.hitsPerSec * result.stats.attackInterval;
      result.components.push(...snow.components); result.dps += snow.dps;
    }
    return result;
  };
  model.normal = phase(context, external, { type: 'none' });
  model.skill = make();
  model.lifecycle = first ? 'charge' : second ? 'permanent' : 'timed';
  model.duration = first ? 0 : second ? Infinity : level.duration;
  model.burst = first; model.burstAttack = false; model.passive = false;
  model.caveats.push('圣聆初雪：单个静止Boss位于范围内可通行地面；不计经过/离开积雪伤害、位移与诱导移动；不受击，不触发反应寒冷或复活；保护目标召唤物不造成伤害。');
  if (first) model.caveats.push('S1每充满一份技力立即施放，不等待攒满两次；默认间隔超过寒冷持续时间，不叠成冻结。');
  const cost = Math.max(original.spCostMin, level.spCost * original.spCostScale);
  const rate = Math.max(0, level.increment + original.spRecovery);
  const wait = Math.max(0, cost - level.initSp - original.initSp) / rate;
  if (second && wait < (tier.talents[0].blackboard.nums.interval ?? 0)) model.notes.push('近似：S2被外部初始技力加速到首次积雪前开启，积雪持续伤害按开启即生效；未模拟首层生成延迟。');
  const canFreeze = first && (Math.max(0, cost - (original.skillEndProbability > 0 ? original.skillEndSp : 0)) / rate <= bb.cold || level.initSp + original.initSp >= cost * 2);
  if (!canFreeze) {
    // generated/garrisons.json：155_[ab]的冻结事件引用154_[ab]回SP；154不是独立常驻回复。
    const recoveryId = tier.garrisonIds.find(id => /^garrison_154_[ab]$/.test(id));
    if (recoveryId) model.notes = model.notes.filter(note => !note.startsWith(`近似：卫戍特质 garrison:${recoveryId} 未建模：`));
    model.caveats.push('静止且不受击场景无敌人冻结事件，卫戍155→154冻结回技力与229冻结叠层不触发。');
  }
  if (canFreeze) model.notes.push('近似：外部技力可能让S1寒冷重叠，冻结减抗与卫戍冻结回技力/盟约叠层尚未计入。');
  if (original.timedStats.length || original.resShred) model.rebuild = (_stack, elapsed, count) => ({ ...model, normal: phase(context, external, { type: 'none', elapsed }), skill: make(elapsed, count) });
  return model;
};
