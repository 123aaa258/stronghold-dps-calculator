import type { GenericModel } from '../skills/generic.ts';
import type { OverrideContext } from '../skills/overrides/index.ts';
import type { DamageComponent, PhaseResult } from '../types.ts';
import { firstCrossing } from '../swift.ts';
import { integrate, leftLimit, tickCount, timeline } from '../timeline.ts';
import type { BattleEffects } from './common.ts';
import { kazimierzHit, kazimierzSource, quicksandHits, sandSource } from './skill-bonds.ts';
import { phaseSegment, type Segment } from '../timeline.ts';

function withParts(phase: PhaseResult, parts: DamageComponent[]): PhaseResult {
  return { ...phase, components: [...phase.components, ...parts], dps: phase.dps + parts.reduce((sum, hit) => sum + hit.dps, 0) };
}

/** 外授盟约沿用精建的本体攻击分项，同时保留精建时间轴上的召唤、持续伤害和处决。 */
export function grantedSkillBonds(full: GenericModel, e: BattleEffects, ctx: OverrideContext, kaz: boolean, baseline: () => GenericModel): GenericModel {
  const { boss, level } = ctx;
  const sand = quicksandHits(e, boss);
  const hasDuration = !(['instant', 'charge'].includes(full.lifecycle) && level.duration <= 0);
  const skillSand = !full.skill ? [] : hasDuration ? sand : sand.slice(0, 1);
  if (!full.customTimeline) {
    const addSand = (model: GenericModel, parts: DamageComponent[]) => model.skill && parts.length && !model.skill.components.some(c => c.source === sandSource)
      ? { ...model, skill: withParts(model.skill, parts) } : model;
    const updated = addSand(full, skillSand);
    if (!full.rebuild || !skillSand.length) return updated;
    return { ...updated, rebuild: (stats, elapsed, events) => addSand(full.rebuild!(stats, elapsed, events),
      quicksandHits(e, boss, events).slice(0, skillSand.length)) };
  }

  const base = baseline();
  const body = base.customTimeline!;
  const own = (phase: PhaseResult): DamageComponent[] => {
    if (!kaz) return [];
    // 荒芜拉普兰德的专属轴自行区分本体、浮游单元和光环，每个攻击间隔只有一次本体攻击。
    if (ctx.operator.charId === 'char_1038_whitw2') return [kazimierzHit(e, boss, phase.stats)!];
    const parts = phase.components.filter(c => c.source === kazimierzSource);
    if (parts.length < 2) return parts;
    const dps = parts.reduce((sum, c) => sum + c.dps, 0);
    const hitsPerSec = parts.reduce((sum, c) => sum + c.hitsPerSec, 0);
    return [{ ...parts[0]!, dps, hitsPerSec, perHit: hitsPerSec ? dps / hitsPerSec : parts[0]!.perHit }];
  };
  const normal = own(full.normal);
  const active = full.skill ? [...own(full.skill), ...skillSand] : [];
  if (!normal.length && !active.length) return base;
  // 普通攻击标记只供攻击回复判定，所有本体伤害仍由原轴结算。
  const marker = base.normal.components.slice(0, 1).map(c => ({ ...c, perHit: 0, dps: 0, countsTowardDps: false }));
  const extra: GenericModel = { ...base, customTimeline: undefined, rebuild: undefined, battle: { ...e, kazimierz: kaz ? e.kazimierz : undefined },
    normal: withParts({ ...base.normal, dps: 0, components: marker }, normal),
    skill: base.skill && withParts({ ...base.skill, dps: 0, components: [] }, active) };
  const output = { ...base, replayDamage: undefined, normal: withParts(base.normal, normal), skill: base.skill && withParts(base.skill, active),
    notes: [...base.notes, '近似：外授盟约取精建的本体攻击动作和阶段面板。特殊技能的窗口按技力时序计算，窗口内按本体攻击频率积分。'] };
  const retired = ctx.skill.skillId === 'skchr_surtr_3';
  // 精建时间轴给出每次开技时刻时：卡西米尔真伤 = 全程附带真伤的累计差 K(t) 在窗口并集上的增量，
  // 窗口为部署后与每次开技后各 L 秒，重叠不叠加。荒芜拉普兰德由本体轴给出窗口，浮游单元另行区分。
  const always = full.customTimeline;
  const memo = (f: (t: number) => number) => { const cache = new Map<number, number>(); return (t: number) => { let v = cache.get(t); if (v === undefined) { v = f(t); cache.set(t, v); } return v; }; };
  const bodyAt = memo(body(0, Infinity).at ?? (t => body(t, Infinity).totalDamage));
  const alwaysAt = memo(always(0, Infinity).at ?? (t => always(t, Infinity).totalDamage));
  const kazAt = (t: number) => alwaysAt(t) - bodyAt(t);
  const exact = (casts: ((t: number) => number[]) | undefined) => kaz && casts ? (t: number) => {
    if (t < 0) return 0;
    const length = e.kazimierz!.duration;
    const windows = [[0, length], ...casts(t).map(c => [c, c + length])].sort((x, y) => x[0]! - y[0]!);
    let sum = 0, start = -1, end = -1;
    const close = () => { if (end > start) sum += (t < end ? kazAt(t) : leftLimit(kazAt, end)) - leftLimit(kazAt, start); };
    for (const [a, b] of windows) {
      if (a! > t) break;
      if (a! > end) { close(); start = a!; end = b!; } else end = Math.max(end, b!);
    }
    close();
    return sum;
  } : undefined;
  output.customTimeline = (duration, hp) => {
    const original = body(duration, hp);
    const windowed = exact(original.castsUntil);
    // 一次性技能沿用原轴的有效时长。黄昏结束后退场，已生成的流沙继续跳伤。
    const once = retired || !original.cycle && Number.isFinite(base.duration);
    const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
    const regular = { ...extra, repeatDuration: original.cycle?.skillDurationSec ?? extra.repeatDuration };
    const restTime = original.cycle?.spRecoverSec;
    const clock = level.spType === 'INCREASE_WITH_TIME' && !e.skillEndSp && cost > 0 && restTime && Number.isFinite(restTime)
      ? { ...level, increment: cost / restTime - e.spRecovery } : level;
    const need = Math.max(0, cost - level.initSp - e.initSp);
    const recovery = level.spType === 'INCREASE_WITH_TIME' ? level.increment + e.spRecovery
      : level.spType === 'ON_ATTACK' && marker.some(c => c.hitsPerSec > 0 && c.damageType !== 'none') ? 1 / base.normal.stats.attackInterval : 0;
    const first = !base.skill ? Infinity : base.lifecycle === 'on_deploy' || need === 0 ? 0 : recovery > 0 ? need / recovery : Infinity;
    // 有开技时刻时附伤轴只剩流沙；卡西米尔改按窗口并集结算。
    const strip = (phase: PhaseResult): PhaseResult => {
      const components = phase.components.filter(c => c.source !== kazimierzSource);
      return { ...phase, components, dps: components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0) };
    };
    const axis: GenericModel = windowed ? { ...extra, battle: { ...extra.battle!, kazimierz: undefined }, normal: strip(extra.normal), skill: extra.skill && strip(extra.skill) } : extra;
    const prefix: Segment[] = once ? [phaseSegment(axis, false, first)] : [];
    if (once && Number.isFinite(first)) {
      prefix.push(phaseSegment(axis, true, base.duration));
      if (!retired) prefix.push(phaseSegment(axis, false, Infinity));
    }
    const projected = (t: number) => {
      const add = windowed?.(t) ?? 0;
      if (windowed && !skillSand.length) return { totalDamage: add, cycle: null };
      if (!once) {
        const part = timeline({ ...axis, repeatDuration: regular.repeatDuration }, clock, t, Infinity);
        return { ...part, totalDamage: part.totalDamage + add };
      }
      const ground = skillSand.length && Number.isFinite(first) ? tickCount(t, first + e.quicksand!.firstDelay, e.quicksand!.interval) * skillSand[0]!.perHit : 0;
      return { totalDamage: integrate(prefix, [], t, Infinity).totalDamage + ground + add, cycle: null };
    };
    // 盟约附伤叠加在精建本体轴之上：卡西米尔按部署后与每次开技后的窗口、流沙按首次开技后的节拍结算。
    const bonus = (t: number) => projected(t).totalDamage;
    const totalDamage = original.totalDamage + bonus(duration);
    const average = projected(duration).cycle?.avgDps ?? (base.duration === Infinity ? skillSand.reduce((sum, c) => sum + c.dps, 0) : 0);
    const cycle = original.cycle && { ...original.cycle, avgDps: original.cycle.avgDps + average };
    const at = memo(t => bodyAt(t) + bonus(t));
    const guess = Number.isFinite(original.killTimeSec) ? original.killTimeSec : hp / (cycle?.avgDps || sand[0]?.dps || 1);
    // 保留本体的提前处决判定。其余模型只需查已建好的累计曲线，无需在二分每一步重新求击杀。
    const executes = Number.isFinite(original.killTimeSec) && bodyAt(original.killTimeSec) < hp * (1 - 1e-9);
    const lethal = executes ? (t: number) => {
      const add = bonus(t);
      return add >= hp || body(duration, hp - add).killTimeSec <= t ? hp : bodyAt(t) + add;
    } : at;
    return { ...original, totalDamage, cycle, at, killTimeSec: firstCrossing(lethal, hp, guess) };
  };
  return output;
}
