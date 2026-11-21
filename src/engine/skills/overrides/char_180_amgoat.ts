import { arcaneCycles, type AttackStage } from './arcane.ts';
import type { PhaseResult } from '../../types.ts';
import { swiftCycles } from './swift.ts';
import type { SkillOverride } from './index.ts';
import type { StatModifier } from '../../stats.ts';
import { battleEffects } from '../../effects/common.ts';
import { integrateWithCasts } from '../../timeline.ts';
import { overrideBase, phase, withFirstSkill } from './shared.ts';

// https://prts.wiki/w/艾雅法拉 ：炎息包含自身；乱火7~15（黑板sp_max为不含上界）；
// S2先减主目标法抗再造成两段各半倍率；S3基础间隔减1.1秒，单目标只发一枚熔岩。
export const eyjaOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic, true);
  if (e.timedStats.length) model.notes.push('近似：限时装备属性按部署时生效值计算，尚未在到期时重建伤害阶段');
  const bb = level.blackboard.nums;
  const source = `skill:${skill.skillId}`;
  const talent = tier.talents[0]!.blackboard.nums;
  const spTalent = tier.talents[1]!.blackboard.nums;
  const initial = (spTalent.sp_min! + spTalent.sp_max! - 1) / 2;
  const base: StatModifier[] = [{ stat: 'atk', bucket: 'pct', value: talent.atk!, source: 'talent:amgoat:1' }];
  const penetration = tier.trait?.blackboard.nums.magic_resist_penetrate_fixed ?? 0;
  const factories = new Map<PhaseResult, (count: number) => PhaseResult>();
  const stage = (duration: number, phase: PhaseResult, cast = false): AttackStage => ({ duration, phase, dps: phase.dps, ...(cast ? { cast } : {}) });
  const make = (active: boolean, modifiers: StatModifier[] = [], reduction = 0, scale = 1, hits = 1) => {
    const build = (damageEvents: number) => phase(context, e, { damageEvents,
      ownerActions: 1, active, modifiers: [...base, ...modifiers], resPenetrationFixed: penetration, resReductionPct: reduction, scale, hits,
    });
    const initial = build(0);
    factories.set(initial, build);
    return initial;
  };
  model.normal = make(false);
  model.notes.push(`近似：乱火部署技力按${spTalent.sp_min}~${spTalent.sp_max! - 1}均匀分布取期望${initial}；先取平均技力再积分不等于随机时间过程的期望`);
  model.burst = false;
  model.passive = false;
  model.lifecycle = 'timed';
  model.duration = level.duration;
  const hitSp = tier.trait?.blackboard.nums.sp ?? 0;
  const elite = context.boss.levelType === 'BOSS' || context.boss.levelType === 'ELITE';
  const rate = Math.max(0, level.increment + e.spRecovery + (elite ? hitSp / model.normal.stats.attackInterval : 0));
  if (hitSp) model.notes.push('近似：命中精英或领袖的模组回技按普攻频率折算，技能期间不回技。');
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const wait = (need: number) => need <= 0 ? 0 : rate > 0 ? need / rate : Infinity;
  const sp = Math.min(cost * level.maxChargeTime, Math.max(0, level.initSp + e.initSp + initial));
  const first = wait(cost - sp);
  const recovery = wait(cost);
  let afterFirst: AttackStage[] | undefined;
  let nextCycle: ((seconds: number) => AttackStage[]) | undefined;
  let prefix: AttackStage[];
  let repeat: AttackStage[];
  if (skill.skillId.endsWith('_1')) {
    const speed: StatModifier = { stat: 'attackSpeed', bucket: 'direct', value: bb['amgoat_s_1[a].attack_speed']!, source };
    const once = make(true, [speed]);
    model.skill = make(true, [speed, { stat: 'atk', bucket: 'pct', value: bb['amgoat_s_1[b].atk']!, source }]);
    prefix = [stage(first, model.normal), stage(level.duration, once, true)];
    repeat = [stage(recovery, model.normal), stage(level.duration, model.skill, true)];
    model.caveats.push('S1技能期DPS显示第二次及以后；首次开启仅加攻速，时间过程分别计算');
  } else if (skill.skillId.endsWith('_2')) {
    const shred = -bb.magic_resistance!;
    const debuffed = make(false, [], shred);
    model.skill = make(true, [], shred, bb.atk_scale, 2);
    model.lifecycle = 'charge';
    model.duration = model.skill.stats.attackInterval;
    const attack: AttackStage = stage(model.duration, model.skill, true);
    const rest = (seconds: number): AttackStage[] => {
      const uptime = Math.min(seconds, Math.max(0, bb.duration! - model.duration));
      return [stage(uptime, debuffed), stage(seconds - uptime, model.normal)];
    };
    afterFirst = [stage(first, model.normal), attack];
    nextCycle = seconds => [...rest(seconds), attack];
    prefix = [];
    let stored = sp;
    while (cost > 0 && stored >= cost) { prefix.push(attack); stored -= cost; }
    const delay = wait(cost - stored);
    prefix.push(...(prefix.length ? rest(delay) : [stage(delay, model.normal)]), attack);
    repeat = [...rest(recovery), attack];
    model.notes.push('近似：S2每次充能替换一个完整攻击间隔且期间停止回技力；忽略攻击前摇、弹道与充能就绪等待下一攻击的离散时点');
    model.caveats.push('S2两段半倍率均命中主Boss；减抗持续6秒，普攻按减抗剩余时间分段，充能到达即用');
  } else {
    model.skill = make(true, [{ stat: 'atk', bucket: 'pct', value: bb.atk!, source }, { stat: 'attackInterval', bucket: 'direct', value: bb.base_attack_time!, source }]);
    prefix = [stage(first, model.normal), stage(level.duration, model.skill, true)];
    repeat = [stage(recovery, model.normal), stage(level.duration, model.skill, true)];
    model.caveats.push('S3随机至多多个不同敌人；只有一个Boss时每次攻击只计一枚熔岩');
  }
  model.customTimeline = (duration, hp) => {
    const period = repeat.reduce((n, s) => n + s.duration, 0);
    const amount = repeat.reduce((n, s) => n + s.duration * s.dps, 0);
    return { ...integrateWithCasts(prefix, repeat, duration, hp), cycle: { spRecoverSec: recovery, skillDurationSec: model.duration, avgDps: Number.isFinite(period) ? amount / period : model.normal.dps }, notes: [], caveats: [] };
  };
  swiftCycles(model, level, cost, sp, afterFirst ?? prefix, wait,
    nextCycle ?? (seconds => [stage(seconds, model.normal), repeat[1]!]));
  if (e.resShred) arcaneCycles(model, level, cost, sp, wait, afterFirst ?? prefix,
    nextCycle ?? (seconds => [stage(seconds, model.normal), repeat[1]!]), factories);
  return withFirstSkill(model, result => {
    const start = result.firstCast ?? first;
    return { start, end: start + model.duration };
  });
};
