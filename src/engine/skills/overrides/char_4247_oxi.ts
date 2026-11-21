import { swiftLockNote, swiftNote } from '../../swift.ts';
import { swiftRecovery } from './swift.ts';
import { isDotSource } from '../../effects/skill-bonds.ts';
import type { DamageComponent, PhaseResult } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { advanceBurning, artsContribution, burningProfile } from '../../effects/elemental.ts';
import { arcaneOnly, overrideBase, phase } from './shared.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { SkillOverride } from './index.ts';

// https://prts.wiki/w/塔露拉：非技能普攻才衰减怒火；簇火固定80/60帧，过载占后半段。
export const oxiOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill, boss } = context;
  const base = overrideBase(generic);
  const external = generic.battle ?? battleEffects();
  const bb = level.blackboard.nums;
  const talent = tier.talents[0]!.blackboard.nums;
  const profile = burningProfile(boss);
  const buildupRatio = talent.ep_damage_ratio! + (external.burning?.ratio ?? 0);
  const s3 = skill.skillId === 'skchr_oxi_3';
  const s2 = skill.skillId === 'skchr_oxi_2';
  const cost = Math.max(external.spCostMin, level.spCost * external.spCostScale);
  const rate = Math.max(0, level.increment + external.spRecovery);
  const refund = external.skillEndProbability===1 && !s2 ? external.skillEndSp : 0;
  const needAfter = Math.max(0,cost-refund);
  const zeroLoop = refund>0 && needAfter===0 && !s3;
  // 回技足以立即续开零时长技能时，两次施放至少间隔一个攻击间隔（模型假设）。
  const lock = generic.normal.stats.attackInterval;
  const recovery = zeroLoop ? lock : needAfter<=0 ? 0 : rate>0 ? needAfter/rate : Infinity;
  // 迅捷：每次技能真实结束（S1 瞬发、S3 持续结束）按固定判定序列判定一次回技。
  const swift = !s2 && external.skillEndSp > 0 && external.skillEndProbability > 0;
  const afterEnd = swiftRecovery(external, cost, rate, lock, !s3);
  const firstWait = Math.max(0, cost - level.initSp - external.initSp) === 0 ? 0
    : rate > 0 ? Math.max(0, cost - level.initSp - external.initSp) / rate : Infinity;
  const notes = [...base.notes,
    '近似：未确认静止Boss脚下足迹的生成/刷新，未计第二天赋足迹伤害；来源：https://prts.wiki/w/塔露拉',
    '近似：按连续伤害率积累灼燃，忽略逐帧攻击与弹道延迟；爆条在达到阈值时结算。',
  ];
  if (!boss.levelType) notes.push('近似：Boss身份缺失，灼燃阈值暂按领袖2000。');
  if (s3) notes.push('近似：单Boss每波只计直接碰撞的一束簇火；缺少地图位置，未计其他行溅射。停止普攻后3秒开始每0.5秒叠怒火，忽略末次普攻相位。');
  if (s3 && (external.extraHits.some(hit => hit.source !== 'bond:arcaneShip') || external.attackScale !== 1)) notes.push('近似：簇火采用缓存攻击力，不触发普攻装备；奥术按独立本体伤害触发。');
  const caveats = [...base.caveats, '塔露拉S2要求受击才触发：满血不受击场景下不触发反击、治疗、庇护或攻防叠层。'];

  const makePhase = (active: boolean, rage: number, burning: boolean, overload: boolean, elapsed: number, damageEvents = 0) => {
    const e = active && s3 ? { ...arcaneOnly(external), attackScale: 1 } : external;
    const p = phase(context, e, { ownerActions: active && s3 ? 0 : 1, active, elapsed, damageEvents,
      modifiers: active && s3 ? [{ stat: 'atk', bucket: 'pct', value: bb.atk!, source: `skill:${skill.skillId}` }] : [],
      type: active && s3 && burning ? 'elemental' : 'arts',
      scale: active ? s3 ? bb.heatwave_atk_scale! : bb.atk_scale! : 1,
      fixedInterval: active && s3 ? overload ? bb.overload_interval! : 80 / 30 : undefined,
      resReductionFixed: burning ? profile.resistanceReduction : 0,
    });
    // 簇火是场地固定频率，攻速和攻击间隔修正均不改变生成频率。
    const rageScale = 1 + rage * talent.arcane_step!;
    p.components = p.components.map(c => {
      const factor = c.damageType === 'arts' || c.damageType === 'elemental' ? rageScale : 1;
      return { ...c, perHit: c.perHit * factor, dps: c.dps * factor };
    });
    p.dps = p.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0);
    return p;
  };
  const maxStacks = Math.round(talent.arcane_max! / talent.arcane_step!);
  const steadyDamage = makePhase(false, maxStacks, false, false, Infinity).dps + (s2 ? 0
    : makePhase(true, maxStacks, false, true, Infinity).dps + makePhase(true, maxStacks, true, true, Infinity).dps);
  type Stage = { duration: number; active: boolean; rage: number; overload?: boolean; burst?: boolean };
  function* stages(now: () => number): Generator<Stage> {
    if (s2) { yield { duration: Infinity, active: false, rage: 0 }; return; }
    yield { duration: firstWait, active: false, rage: 0 };
    let ends = 0;
    while (true) {
      if (s3) {
        yield { duration: talent.arcane_idle_delay!, active: true, rage: 0 };
        for (let rage = 0; rage < maxStacks; rage++) yield { duration: talent.arcane_step_interval!, active: true, rage };
        yield { duration: level.duration / 2 - talent.arcane_idle_delay! - maxStacks * talent.arcane_step_interval!, active: true, rage: maxStacks };
        yield { duration: level.duration / 2, active: true, rage: maxStacks, overload: true };
        let left = afterEnd(ends++, now());
        for (let rage = maxStacks; rage > 0 && left > 0; rage--) {
          const duration = Math.min(left, makePhase(false, rage, false, false, 0).stats.attackInterval);
          yield { duration, active: false, rage };
          left -= duration;
        }
        yield { duration: left, active: false, rage: 0 };
      } else {
        yield { duration: 0, active: true, rage: 0, burst: true };
        yield { duration: afterEnd(ends++, now()), active: false, rage: 0 };
      }
    }
  }
  const run = (duration: number, hp: number, collect = false) => {
    const state = { buildup: 0, remaining: 0 };
    let time = 0, total = 0, dealt = 0, kill = hp <= 0 ? 0 : Infinity;
    const clock = new ShredClock(external);
    let skillDamage = 0, cycleDamage = 0;
    const parts = new Map<string, DamageComponent>();
    const firstEnd = firstWait + (s3 ? level.duration : 0);
    const cycleEnd = firstEnd + recovery + (s3 ? level.duration : 0);
    const add = (amount: number, seconds: number, components: DamageComponent[], active: boolean) => {
      if (time <= duration) total += amount * (seconds > 0 ? Math.min(seconds, duration - time) / seconds : 1);
      if (kill === Infinity && amount > 0 && dealt + amount >= hp) kill = time + seconds * (hp - dealt) / amount;
      dealt += amount;
      if (collect && active && time < firstEnd) {
        skillDamage += amount;
        for (const c of components) {
          const key = `${c.source}:${c.damageType}`;
          const old = parts.get(key);
          parts.set(key, { ...c, dps: (old?.dps ?? 0) + c.dps * seconds });
        }
      }
      if (collect && time >= firstEnd && time < cycleEnd) cycleDamage += amount;
    };
    const casts: number[] = [];
    let wasActive = false;
    for (const stage of stages(() => time)) {
      // 由非技能阶段进入技能阶段即一次开技（S1 每次瞬发各算一次）。
      if (stage.active && (!wasActive || stage.burst) && time <= duration) casts.push(time);
      wasActive = stage.active;
      if (time >= duration && steadyDamage === 0 && !external.timedStats.some(x => x.until > time)) break;
      if (time >= duration && (kill !== Infinity || !Number.isFinite(hp)) && stage.duration > 0) break;
      let left = stage.duration;
      if (stage.burst) {
        const p = makePhase(true, stage.rage, state.remaining > 0, false, time, clock.count);
        // 持续伤害按独立的每秒时钟由普攻阶段连续计入，瞬发只结算本次动作。
        p.components = p.components.filter(c => !isDotSource(c.source));
        clock.burst(p.components);
        const amount = p.components.reduce((n, c) => n + c.perHit * c.hitsPerAttack, 0);
        add(amount, 0, [], true);
        if (state.remaining === 0) state.buildup += artsContribution(p.components, true) * buildupRatio * profile.buildupMultiplier;
        const instant = advanceBurning(state, profile, 0, 0);
        if (instant.burst) { add(instant.burst, 0, [], true); clock.count++; }
      }
      do {
        if (time >= duration && (kill !== Infinity || !Number.isFinite(hp))) break;
        const p = makePhase(stage.active && !stage.burst, stage.rage, state.remaining > 0, stage.overload ?? false, time, clock.count);
        const buildup = artsContribution(p.components) * buildupRatio;
        const expiry = Math.min(...external.timedStats.filter(x => x.until > time).map(x => x.until - time));
        const tick = clock.step(p.components);
        const stop = Math.min(left, expiry, tick.seconds, time < duration ? duration - time : Infinity,
          collect && time < firstEnd ? firstEnd - time : Infinity, collect && time < cycleEnd ? cycleEnd - time : Infinity);
        if (stop === Infinity && p.dps === 0 && buildup === 0) return { total, kill, skillDamage, cycleDamage, parts, casts };
        const step = advanceBurning(state, profile, buildup, stop);
        const seconds = step.seconds;
        tick.advance(seconds);
        if (!Number.isFinite(seconds)) {
          add(p.dps * Math.max(duration - time, hp / Math.max(p.dps, 1)), Math.max(duration - time, hp / Math.max(p.dps, 1)), p.components, stage.active);
          return { total, kill, skillDamage, cycleDamage, parts, casts };
        }
        add(p.dps * seconds, seconds, p.components, stage.active);
        time += seconds;
        left -= seconds;
        if (step.burst) {
          clock.count++;
          const c: DamageComponent = { label: '灼燃爆发', source: 'elemental:burning', damageType: 'elemental', perHit: step.burst, hitsPerAttack: 1, hitsPerSec: 0, dps: 0, countsTowardDps: true, derivation: profile.derivation };
          add(step.burst, 0, [], stage.active);
          if (collect && stage.active && time <= firstEnd) parts.set(c.source, { ...c, dps: (parts.get(c.source)?.dps ?? 0) + step.burst });
        }
        if (seconds === 0 && !step.burst) break;
      } while (left > 1e-9);
      // 窗口在本阶段中途结束：后续阶段（含下一次瞬发）尚未发生。
      if (left > 1e-9 && time >= duration && (kill !== Infinity || !Number.isFinite(hp))) break;
    }
    return { total, kill, skillDamage, cycleDamage, parts, casts };
  };
  const normal = makePhase(false, 0, false, false, 0);
  const accumulation = artsContribution(normal.components) * buildupRatio * profile.buildupMultiplier;
  const normalCycle = accumulation > 0 ? profile.threshold / accumulation + profile.duration : Infinity;
  const burningNormal = makePhase(false, 0, true, false, 0);
  const burnShare = profile.duration / normalCycle;
  normal.components = normal.components.map((c, i) => ({ ...c,
    perHit: c.perHit * (1 - burnShare) + burningNormal.components[i]!.perHit * burnShare,
    dps: c.dps * (1 - burnShare) + burningNormal.components[i]!.dps * burnShare,
  }));
  normal.components.push({ label: '灼燃爆发周期平均', source: 'elemental:burning', damageType: 'elemental', perHit: profile.burstDamage, hitsPerAttack: 1, hitsPerSec: 1 / normalCycle, dps: profile.burstDamage / normalCycle, countsTowardDps: true, derivation: profile.derivation });
  normal.dps = normal.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0);
  let active: PhaseResult | null = s2 ? null : makePhase(true, 0, false, false, firstWait);
  const previewEnd = firstWait + (s3 ? level.duration * 2 : 0) + recovery;
  const preview = Number.isFinite(previewEnd) ? run(previewEnd, Infinity, true) : null;
  if (s3 && active && preview) {
    active = { ...active, dps: preview.skillDamage / level.duration,
      components: [...preview.parts.values()].map(c => ({ ...c, perHit: c.dps / level.duration, hitsPerSec: 1, dps: c.dps / level.duration })) };
  }
  return { ...base, normal, skill: active, lifecycle: s2 ? 'permanent' : s3 ? 'timed' : 'instant', duration: s3 ? level.duration : 0,
    burst: !s3 && !s2, passive: s2, notes, caveats,
    elemental: { perSec: accumulation, note: '非技能期、未爆发时的灼燃积累速率；爆发冷却10秒内不积累。' },
    customTimeline: (duration, hp) => {
      const swiftNotes:string[]=[];
      if (swift) swiftNotes.push(swiftNote);
      if (swift && !s3) swiftNotes.push(swiftLockNote);
      const result = run(duration, hp);
      return { totalDamage: result.total, killTimeSec: result.kill,
        castsUntil: s2 ? undefined : (t: number) => run(t, Infinity).casts,
        cycle: s2 || !preview ? null : { spRecoverSec: recovery, skillDurationSec: s3 ? level.duration : 0, avgDps: preview.cycleDamage / (recovery + (s3 ? level.duration : 0)) },
        notes: [...swiftNotes,'近似：技能期DPS为首轮技能平均；循环DPS为首轮技能结束后的一个完整循环，灼燃相位可令后续循环不同。'], caveats: [] };
    },
  };
};
