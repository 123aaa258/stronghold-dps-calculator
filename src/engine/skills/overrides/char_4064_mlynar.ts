import { swiftRenewal } from '../../swift.ts';
import type { SkillOverride } from './index.ts';
import { arcaneOnly, overrideBase, phase } from './shared.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { battleEffects } from '../../effects/common.ts';
import { integrate, type Segment } from '../../timeline.ts';

// https://prts.wiki/w/玛恩纳：游侠只放大攻击倍率，S3预计算真伤不受益；特性倍增的是加算攻击。
export const mlynarOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const external = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const stackedEffects = external.bondStacks && context.effectsAt;
  const stackEventCap = stackedEffects && external.bondStacks ? Math.ceil(external.bondStacks.max / external.bondStacks.perDamage) : 0;
  if (stackedEffects) {
    model.notes = model.notes.filter(note => !note.includes('临时盟约层数尚未逐事件重建'));
    if (external.stacks.length) model.notes.push('近似：装备属性叠层尚未逐事件重建');
  }
  const bb = level.blackboard.nums;
  const trait = tier.trait!.blackboard.nums;
  const initial = tier.talents.find(t => 'init_atk' in t.blackboard.nums)?.blackboard.nums.init_atk ?? 0;
  const talentScale = tier.talents.find(t => 'atk_scale_base' in t.blackboard.nums)!.blackboard.nums.atk_scale_base;
  const second = skill.skillId.endsWith('_2');
  const third = skill.skillId.endsWith('_3');
  const cost = Math.max(external.spCostMin, level.spCost * external.spCostScale);
  const rate = Math.max(0, level.increment + external.spRecovery);
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? sp / rate : Infinity;
  const firstWait = wait(Math.max(0, cost - level.initSp - external.initSp));
  const recovery = wait(cost);
  const bonus = (idle: number, start: number) => Math.min(trait.atk, start + trait.atk * idle / trait.max_stack_cnt);
  const active = (traitBonus: number, elapsed: number, damageEvents = 0) => {
    // 补剂在一击的全部伤害结算后叠层；部署时的卫戍特质由 effectsAt 保留原快照。
    const effects = damageEvents > 0 ? stackedEffects?.(damageEvents) ?? external : external;
    const modifiers = [{ stat: 'atk' as const, bucket: 'pct' as const, value: traitBonus * (bb.trait_up ?? 1), source: 'trait:char_4064_mlynar' }];
    const options = { active: true, elapsed, damageEvents, modifiers, interval: tier.attributes.baseAttackTime + (bb.base_attack_time ?? 0) };
    // 三个技能均在开技刷新的30秒内结束。仅本体攻敌动作触发盟约，S2双击及S3附伤不另触发。
    const result = phase(context, effects, { ...options, ownerActions: 1, kazimierzActive: true, type: 'physical', scale: bb['attack@atk_scale'] * talentScale, hits: second ? 2 : 1 });
    if (third) {
      // 自身属于卡西米尔；单Boss只触发自身攻击对应的一次附加真伤，不计其他干员输出。
      const extra = phase(context, { ...arcaneOnly(effects), attackScale: 1 }, { ...options, type: 'true', scale: bb.atk_scale });
      const component = extra.components[0];
      component.label = '卡西米尔攻击附加真实伤害';
      component.source = `skill:${skill.skillId}:atk_scale`;
      result.components.push(...extra.components);
      result.dps += extra.dps;
    }
    return result;
  };
  model.normal = phase(context, external, { type: 'none' });
  model.skill = active(bonus(firstWait, initial), firstWait);
  model.lifecycle = 'timed'; model.duration = level.duration; model.passive = false; model.burst = false;
  model.caveats.push('玛恩纳非技能期不攻击；特性仅在休整时增长，开启技能时锁定，结束后清零；单Boss击杀前无击倒衰减或S2保留，不受击故无反伤。');
  model.customTimeline = (duration, hp) => {
    const prefix: Segment[] = [];
    const clock = new ShredClock(external, stackEventCap);
    const expiry = Math.max(0, ...external.timedStats.map(t => t.until));
    const appendActive = (start: number, traitBonus: number, parts = prefix) => {
      if (start === Infinity) { clock.append(parts, level.duration, count => active(traitBonus, start, count)); return; }
      const boundaries = [start, ...external.timedStats.map(t => t.until).filter(t => t > start && t < start + level.duration), start + level.duration].sort((a, b) => a - b);
      for (let i = 1; i < boundaries.length; i++) clock.append(parts, boundaries[i] - boundaries[i - 1], count => active(traitBonus, boundaries[i - 1], count));
    };
    prefix.push({ duration: firstWait, dps: 0 });
    if (Number.isFinite(firstWait)) appendActive(firstWait, bonus(firstWait, initial));
    if (external.skillEndSp && external.skillEndProbability || clock.cap > 0 && Number.isFinite(firstWait)) {
      const stages = (seconds: number, elapsed: number) => {
        const parts: Segment[] = [{duration:seconds,dps:0}];
        if (Number.isFinite(seconds)) appendActive(elapsed + seconds, bonus(seconds,0), parts);
        return parts;
      };
      return swiftRenewal({prefix,stock:Math.max(0,level.initSp+external.initSp-cost),cost,maxCharges:level.maxChargeTime,
        reward:external.skillEndSp, probability:external.skillEndProbability, wait, stableAfter:expiry, skillDuration:level.duration,
        segments: stages, counter: clock.cap ? { initial:clock.count, afterCharge:(count, seconds, stock, elapsed) => {
          clock.reset(count);
          const parts = stages(seconds, elapsed);
          return [{ count:clock.count, stock, parts, weight:1 }];
        } } : undefined},duration,hp);
    }
    let elapsed = firstWait + level.duration;
    while (elapsed < expiry && Number.isFinite(recovery)) {
      prefix.push({ duration: recovery, dps: 0 });
      appendActive(elapsed + recovery, bonus(recovery, 0));
      elapsed += recovery + level.duration;
    }
    const steady = active(bonus(recovery, 0), Math.max(elapsed, expiry)).dps;
    const repeat = Number.isFinite(recovery) ? [{ duration: recovery, dps: 0 }, { duration: level.duration, dps: steady }] : [];
    return { ...integrate(prefix, repeat, duration, hp), cycle: { spRecoverSec: recovery, skillDurationSec: level.duration, avgDps: Number.isFinite(recovery) ? steady * level.duration / (recovery + level.duration) : 0 }, notes: [], caveats: ['时间过程按技力足够立即开启、阶段连续DPS积分；非技能期特性爬升不造成伤害。'] };
  };
  return model;
};
