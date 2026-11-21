import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { stockAfterCast, swiftRenewal } from '../../swift.ts';
import type { SkillOverride } from './index.ts';
import { battleEffects } from '../../effects/common.ts';
import { castMark, integrateWithCasts, type Segment } from '../../timeline.ts';
import { isBlocked, overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/史尔特尔：S2单目标倍率；S3自损从0线性升至60秒20%/秒，余烬结束强制撤退。
export const surtrOverride: SkillOverride = (context, generic) => {
  const { tier, skill, level } = context;
  const model = overrideBase(generic);
  const original = generic.battle ?? battleEffects();
  const bb = level.blackboard.nums;
  const source = `skill:${skill.skillId}`;
  const trait = tier.trait?.blackboard.nums;
  const blocked = isBlocked(context.boss);
  const moduleSource = `module:${tier.uniEquipId}`;
  const e = { ...original, modifiers: [...original.modifiers, { group: 'arts-fragile', kind: 'fragile' as const,
    types: ['arts' as const], value: blocked ? (trait?.damage_scale ?? 1) - 1 : 0, source: moduleSource }] };
  const penetration = tier.talents[0]!.blackboard.nums.magic_resist_penetrate_fixed!;
  const make = (active: boolean, speed = 0, damageEvents = 0) => phase(context, { ...e,
    extraHits: e.extraHits.map(hit => ({ ...hit, scale: hit.scale * (active ? bb['attack@surtr_s_2[critical].atk_scale'] ?? 1 : 1) })),
  }, { ownerActions: 1, active, damageEvents,
    resPenetrationFixed: penetration,
    modifiers: [{ stat: 'atk', bucket: 'pct', value: active ? bb.atk ?? 0 : 0, source },
      { stat: 'attackSpeed', bucket: 'direct', value: speed, source: 'talent:surtr:2' },
      ...(!blocked && trait?.attack_speed ? [{ stat: 'attackSpeed' as const, bucket: 'direct' as const, value: trait.attack_speed, source: moduleSource }] : [])],
    scale: active ? bb.atk_scale ?? bb['attack@surtr_s_2[critical].atk_scale'] ?? 1 : 1 });
  model.normal = make(false);
  model.skill = make(true);
  model.burst = false;
  model.passive = false;
  model.caveats.push(trait?.attack_speed || !blocked ? '未阻挡时只启用当前模组的未阻挡攻速；法术脆弱仅对自身阻挡目标生效。单Boss不预叠击倒盟约或利用S1击倒回技。' : '史尔特尔自行阻挡Boss，模组法术脆弱生效；单个Boss击倒即结束，不预叠击倒盟约，也不利用S1击倒回满技力。');
  if (e.timedStats.length) model.notes.push('近似：限时外部属性按部署值计算，未在到期时重建伤害阶段');
  const s1 = skill.skillId.endsWith('_1');
  const s3 = skill.skillId.endsWith('_3');
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = s1 ? 1 / model.normal.stats.attackInterval : Math.max(0, level.increment + e.spRecovery);
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? (s1 ? Math.ceil(sp) : sp) / rate : Infinity;
  const first = wait(cost - level.initSp - e.initSp);
  const recovery = wait(cost);
  model.lifecycle = s1 ? 'instant' : s3 ? 'permanent' : 'timed';
  model.duration = s1 ? model.skill.stats.attackInterval : s3 ? Infinity : level.duration;
  const prefix: Segment[] = [{ duration: first, dps: model.normal.dps }];
  let repeat: Segment[] = [];
  if (s3) {
    // 连续近似：满血自损积分 r*t²/(2*T)=1；HP上限+5000后回满，按最大HP百分比掉血，HP约掉。
    const ramp = bb.duration!;
    const ratio = bb.hp_ratio!;
    const lethal = ratio * ramp / 2 >= 1 ? Math.sqrt(2 * ramp / ratio) : ramp + (1 - ratio * ramp / 2) / ratio;
    const ember = tier.talents[1]!.blackboard.nums;
    const emberDuration = ember['surtr_t_2[withdraw].interval']!;
    model.duration = lethal + emberDuration;
    const last = make(true, ember['surtr_t_2[withdraw].attack_speed'] ?? 0);
    prefix.push({ duration: lethal, dps: model.skill.dps, cast: true }, { duration: emberDuration, dps: last.dps }, { duration: Infinity, dps: 0 });
    // 余烬结束强制撤退，不再部署。
    model.leavesAt = first + model.duration;
    model.notes.push('近似：黄昏自损按线性速率连续积分，不计0.2秒结算离散点、1HP阈值与0.6秒开启动画；无治疗，余烬结束后退出且不重新部署（PRTS史尔特尔）。');
    model.caveats.push('技能期分项为开启时面板（触发余烬前）；技能期DPS为开启至余烬结束退场的区间平均，含余烬攻速。无限技能持续不等于无限存活，故无常驻/循环DPS。');
  } else {
    const active = { duration: model.duration, dps: model.skill.dps, cast: true };
    prefix.push(active);
    repeat = [{ duration: recovery, dps: model.normal.dps }, active];
    if (s1) model.notes.push('近似：S1攻击回复以普攻频率折算，每3次普攻后替换一次技能攻击；技能攻击期间停止回复技力。');
  }
  model.customTimeline = (duration, hp) => ({ ...integrateWithCasts(prefix, repeat, duration, hp),
    cycle: s3 ? null : { spRecoverSec: recovery, skillDurationSec: model.duration,
      avgDps: Number.isFinite(recovery) ? (recovery * model.normal.dps + model.duration * model.skill!.dps) / (recovery + model.duration) : model.normal.dps },
    notes: [], caveats: [] });
  if (!s3) swiftCycles(model, level, cost, level.initSp + e.initSp, prefix, wait,
    seconds => [{ duration: seconds, dps: model.normal.dps }, repeat[1]!]);
  if (e.resShred) {
    const expand = (count: number, seconds: number) => {
      const clock = new ShredClock(e), parts: Segment[] = [];
      clock.count = count;
      clock.append(parts, seconds, events => make(false, 0, events));
      parts.push(castMark());
      clock.append(parts, prefix[1]!.duration, events => make(true, 0, events));
      if (s3) clock.append(parts, prefix[2]!.duration, events => make(true, tier.talents[1]!.blackboard.nums['surtr_t_2[withdraw].attack_speed'] ?? 0, events));
      return {count:clock.count, parts};
    };
    const opening = expand(0, first);
    model.customTimeline = (duration, hp) => s3 ? { ...integrateWithCasts(opening.parts, [], duration, hp), cycle:null, notes:[], caveats:[] }
      : swiftRenewal({prefix:opening.parts, stock:stockAfterCast(level.initSp + e.initSp, cost, level.maxChargeTime, s1),
        cost, maxCharges:level.maxChargeTime, discreteSp:s1, probability:e.skillEndProbability, reward:e.skillEndSp, wait,
        segments:seconds => expand(Math.ceil(e.resShred!.max / e.resShred!.perHit), seconds).parts, skillDuration:model.duration,
        counter:{initial:opening.count, afterCharge:(count, seconds, stock) => [{...expand(count, seconds), stock, weight:1}]},
      }, duration, hp);
  }
  return model;
};
