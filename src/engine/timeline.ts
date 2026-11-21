import { judgmentSource } from './effects/judgment.ts';
import { isDotSource, kazimierzSource, sandSource, sandSkillSource } from './effects/skill-bonds.ts';
import { firstCrossing, renewalCurve, stockAfterCast, swiftLockNote, swiftNote, swiftRenewal, swiftRefundSucceeds, type RenewalPlan } from './swift.ts';
import type { CalcResult, DamageComponent, PhaseResult, SkillLevelData } from './types.ts';
import type { GenericModel } from './skills/generic.ts';
export interface Segment {
  duration: number; dps: number; burst?: number; slope?: number; executeBelow?: number;
  ticks?: { first: number; interval: number; damage: number };
  /**
   * 限时窗口内才计入的额外秒伤（六人卡西米尔：部署后与每次开技后 length 秒内攻击附带真伤）。
   * 窗口从部署（绝对 0 秒）起开启；cast 标记的分段在其开始时刻重新开启窗口，重叠不叠加。
   */
  window?: { dps: number; length: number };
  /** 本分段从一次技能开启开始（开技事件）：重新开启卡西米尔窗口，并记入时间过程的开技时刻。 */
  cast?: boolean;
  /** 本分段从一次技能结束开始（技能实际时长与模型名义时长不同时标记，供阶段区间使用）。 */
  end?: boolean;
}
/** 窗口状态：end 为当前窗口关闭的绝对时刻；undefined 表示尚未遇到带窗口的分段（部署窗口待开启）。 */
export interface WindowState { end?: number }
/** 在 at 处把分段切成两段；斜率、跳伤节拍顺延，瞬时伤害只留在前段。 */
export function splitSegment(s: Segment, at: number): [Segment, Segment] {
  const first: Segment = { ...s, duration: at };
  const rest: Segment = { ...s, duration: s.duration - at, burst: undefined, cast: undefined, dps: s.dps + (s.slope ?? 0) * at };
  if (s.ticks) rest.ticks = { ...s.ticks, first: s.ticks.first + tickCount(at, s.ticks.first, s.ticks.interval) * s.ticks.interval - at };
  return [first, rest];
}
/** 把窗口秒伤折入分段：返回不再带 window/cast 字段的子分段，并推进窗口状态。 */
export function expandWindow(s: Segment, start: number, state: WindowState): Segment[] {
  const { window, cast, ...plain } = s;
  if (!window) return [plain];
  if (state.end === undefined) state.end = window.length;
  if (cast) state.end = Math.max(state.end, start + window.length);
  const inside = Math.min(s.duration, state.end - start);
  if (inside <= 1e-12) return [plain];
  if (inside >= s.duration - 1e-12) return [{ ...plain, dps: plain.dps + window.dps }];
  const [a, b] = splitSegment(plain, inside);
  return [{ ...a, dps: a.dps + window.dps }, b];
}
const windowed = (parts: Segment[]) => parts.some(s => s.window);
export interface TimelineResult {
  totalDamage: number; killTimeSec: number; cycle: CalcResult['cycle']; notes: string[]; caveats: string[];
  /** 第一次开启技能的时刻（秒）；从不开启为 Infinity，未知时缺省。 */
  firstCast?: number;
  /** 时间过程中的面板快照：normal 为第一次开技能前一刻，skill 为第一次开技能时。缺省沿用模型自身的阶段。 */
  phases?: { normal?: PhaseResult; skill?: PhaseResult };
  /** [0, t] 内每次开启技能的时刻（升序）。时间轴分段未标记开技事件时缺省。 */
  castsUntil?: (t: number) => number[];
  /** [0, t] 内每次技能结束的时刻（升序）。缺省时按模型时长推算。 */
  endsUntil?: (t: number) => number[];
  /**
   * 第一次施放技能的实际起止（秒，部署起算）：start 为开技时刻，end 为这一轮技能实际结束的时刻
   * （弹药耗尽、自损中断等提前结束都计入）。从不开技为 { start: Infinity, end: Infinity }。
   */
  firstSkill?: FirstSkill;
  /** 累计伤害曲线 [0, t]（不计击杀），由已构建的时间轴直接查询；缺省时按窗口重新求时间过程。 */
  at?: (t: number) => number;
}
export interface FirstSkill { start: number; end: number; includesEndHit?: boolean; preCastDamage?: number }
/** 首轮技能起止：开技时刻不是有限值时视为从不开技。 */
export function firstSkillAt(start: number, length: number): FirstSkill {
  return Number.isFinite(start) ? { start, end: start + Math.max(0, length) } : { start: Infinity, end: Infinity };
}
/** 分段序列中第一次开技标记的时刻，以及其后第一个技能结束标记的时刻（没有结束标记时为 undefined）。 */
export function markedFirstSkill(prefix: Segment[], repeat: Segment[]): FirstSkill | undefined {
  const casts = castTimes(prefix, repeat, Infinity, 'cast', 1);
  if (!casts) return;
  const start = casts[0];
  if (start === undefined) return { start: Infinity, end: Infinity };
  const end = (castTimes(prefix, repeat, Infinity, 'end', 1, start) ?? [])[0];
  return end === undefined ? undefined : { start, end };
}
/** 分段序列（前缀 + 重复周期）中带 cast 标记的分段起点，截至 horizon（含）。没有任何标记时返回 undefined。 */
export function castTimes(prefix: Segment[], repeat: Segment[], horizon: number, key: 'cast' | 'end' = 'cast', limit = 100000, after = -Infinity): number[] | undefined {
  if (!prefix.some(s => s[key]) && !repeat.some(s => s[key])) return;
  const times: number[] = [];
  let time = 0;
  for (const s of prefix) {
    if (time > horizon + 1e-9 || times.length >= limit) return times;
    if (s[key] && time >= after - 1e-9) times.push(time);
    time += s.duration;
    if (!Number.isFinite(time)) return times;
  }
  const period = repeat.reduce((n, s) => n + s.duration, 0);
  if (!(period > 0) || !Number.isFinite(period) || !repeat.some(s => s[key])) return times;
  const offsets: number[] = [];
  let offset = 0;
  for (const s of repeat) { if (s[key]) offsets.push(offset); offset += s.duration; }
  for (let start = time; start <= horizon + 1e-9 && times.length < Math.min(limit, 100000); start += period) {
    for (const o of offsets) if (start + o <= horizon + 1e-9 && start + o >= after - 1e-9 && times.length < limit) times.push(start + o);
    if (start + period <= start) break;
  }
  return times;
}
/**
 * 累计伤害曲线在 t 处的左极限（不含 t 时刻的瞬时伤害）：用 t 之前两点线性外推，分段线性区间内精确。
 */
export function leftLimit(at: (t: number) => number, t: number, step = 1e-6) {
  if (t <= 0) return 0;
  const h = Math.min(step, t / 2);
  return 2 * at(t - h) - at(t - 2 * h);
}
/** 零时长的开技事件标记：放在精建时间轴每次技能开启处，供开技时刻查询（卡西米尔窗口、阶段区间）。 */
export const castMark = (): Segment => ({ duration: 0, dps: 0, cast: true });
/** 零时长的技能结束标记（技能实际时长与模型名义时长不同时使用）。 */
export const endMark = (): Segment => ({ duration: 0, dps: 0, end: true });
/** 带开技时刻查询的分段积分。 */
export function integrateWithCasts(prefix: Segment[], repeat: Segment[], duration: number, hp: number): Pick<TimelineResult, 'totalDamage' | 'killTimeSec' | 'castsUntil' | 'endsUntil' | 'firstCast' | 'firstSkill' | 'at'> {
  const result = { ...integrate(prefix, repeat, duration, hp), at: (t: number) => integrate(prefix, repeat, t, Infinity).totalDamage };
  if (!prefix.some(s => s.cast) && !repeat.some(s => s.cast)) return result;
  const ends = prefix.some(s => s.end) || repeat.some(s => s.end);
  const firstSkill = markedFirstSkill(prefix, repeat);
  return { ...result, firstCast: firstSkill?.start ?? castTimes(prefix, repeat, Infinity, 'cast', 1)?.[0], castsUntil: (t: number) => castTimes(prefix, repeat, t) ?? [], ...(firstSkill ? { firstSkill } : {}),
    ...(ends ? { endsUntil: (t: number) => castTimes(prefix, repeat, t, 'end') ?? [] } : {}) };
}
export function tickCount(time: number, first: number, interval: number) {
  return time < first - 1e-9 ? 0 : 1 + Math.floor((time - first) / interval + 1e-9);
}
export function segmentDamage(s: Segment, t: number) {
  return (s.dps ? t * s.dps : 0) + (s.slope ? s.slope * t * t / 2 : 0)
    + (s.ticks?.damage ? tickCount(t, s.ticks.first, s.ticks.interval) * s.ticks.damage : 0);
}
// 分段积分：保留首轮初始技力与技能开启事件；仅重复的完整周期可整体跳过。
export function integrate(prefix: Segment[], repeat: Segment[], duration: number, hp: number): { totalDamage: number; killTimeSec: number } {
  if (repeat.some(segment => segment.duration === Infinity)) return integrate([...prefix, ...repeat], [], duration, hp);
  if (windowed(prefix) || windowed(repeat)) {
    // 先把窗口折入分段：逐个周期展开，直到周期起点的剩余窗口不再变化，此后各周期完全相同。
    const state: WindowState = {};
    const flat: Segment[] = [];
    let time = 0;
    for (const s of prefix) {
      flat.push(...expandWindow(s, time, state));
      time += s.duration;
      if (!Number.isFinite(time)) return integrate(flat, [], duration, hp);
    }
    const period = repeat.reduce((n, s) => n + s.duration, 0);
    if (!(period > 0) || !Number.isFinite(period)) return integrate(flat, [], duration, hp);
    const left = () => state.end === undefined ? -1 : Math.max(0, state.end - time);
    for (let pass = 0; pass < 64; pass++) {
      const before = left();
      for (const s of repeat) { flat.push(...expandWindow(s, time, state)); time += s.duration; }
      if (Math.abs(left() - before) <= 1e-9) break;
    }
    const steady: Segment[] = [];
    for (const s of repeat) { steady.push(...expandWindow(s, time, state)); time += s.duration; }
    return integrate(flat, steady, duration, hp);
  }
  const area = (s: Segment) => (s.burst ?? 0) + segmentDamage(s, s.duration);
  const period = repeat.reduce((n, s) => n + s.duration, 0);
  const cycleDamage = repeat.reduce((n, s) => n + area(s), 0);
  let remaining = duration;
  let totalDamage = 0;
  const totalSegment = (s: Segment) => {
    if (remaining < 0) return;
    totalDamage += s.burst ?? 0;
    const elapsed = Math.min(remaining, s.duration);
    totalDamage += segmentDamage(s, elapsed);
    remaining = s.duration === Infinity ? -1 : remaining - elapsed;
    if (elapsed < s.duration - 1e-10) remaining = -1;
    else if (remaining < 0 && remaining >= -1e-10) remaining = 0;
  };
  for (const s of prefix) totalSegment(s);
  if (remaining >= 0 && period > 0 && Number.isFinite(period)) {
    const count = Math.floor(remaining / period);
    totalDamage += count * cycleDamage;
    remaining -= count * period;
    for (const s of repeat) totalSegment(s);
  }
  let time = 0;
  let health = hp;
  const killSegment = (s: Segment): number | null => {
    health -= s.burst ?? 0;
    const needed = health - (s.executeBelow ?? 0);
    if (needed <= 0) return time;
    const dealt = segmentDamage(s, s.duration);
    if (s.ticks?.damage && dealt >= needed && Number.isFinite(needed)) {
      const rate = s.dps + s.ticks.damage / s.ticks.interval;
      return time + Math.min(s.duration, firstCrossing(t => segmentDamage(s, t), needed, Math.min(s.duration, needed / rate + s.ticks.first)));
    }
    if (dealt >= needed && (s.dps > 0 || (s.slope ?? 0) > 0)) {
      // 稳定二次根：D(t)=dps*t+slope*t²/2，避免小斜率相消。
      const elapsed = s.slope ? 2 * needed / (s.dps + Math.sqrt(s.dps * s.dps + 2 * s.slope * needed)) : needed / s.dps;
      return time + elapsed;
    }
    health -= dealt;
    time += s.duration;
    return null;
  };
  for (const s of prefix) {
    const kill = killSegment(s);
    if (kill !== null) return { totalDamage, killTimeSec: kill };
    if (!Number.isFinite(time)) return { totalDamage, killTimeSec: Infinity };
  }
  if (period > 0 && Number.isFinite(period) && cycleDamage > 0) {
    const threshold = Math.max(0, ...repeat.map(s => s.executeBelow ?? 0));
    const count = Math.max(0, Math.ceil((health - threshold) / cycleDamage) - 1);
    health -= count * cycleDamage;
    time += count * period;
    // 阈值可能仅在周期前段生效，保守跳过后最多再遍历两个周期。
    for (let pass = 0; pass < 2; pass++) for (const s of repeat) {
      const kill = killSegment(s);
      if (kill !== null) return { totalDamage, killTimeSec: kill };
    }
  }
  return { totalDamage, killTimeSec: Infinity };
}
function skillEndSp(model: GenericModel): number {
  return model.battle?.skillEndProbability && model.skill && Number.isFinite(model.duration) && ['timed', 'instant', 'charge', 'ammo'].includes(model.lifecycle)
    ? model.battle?.skillEndSp ?? 0 : 0;
}
const zeroCycleNote = '忽略了 零等待零时长技能重复触发（机制）；仅触发一次后恢复非技能期';

function kazWindow(model: GenericModel, components: DamageComponent[]): Segment['window'] {
  const effect = model.battle?.kazimierz;
  if (!effect) return;
  return { dps: components.find(c => c.source === kazimierzSource)?.dps ?? 0, length: effect.duration };
}

export function phaseSegment(model: GenericModel, active: boolean, duration: number, skillAge = 0): Segment {
  if (!active || !model.skill) {
    const window = kazWindow(model, model.normal.components);
    return window ? { duration, dps: model.normal.dps - window.dps, window } : { duration, dps: model.normal.dps };
  }
  const { components, dps } = model.skill;
  const ground = components.find(c => c.source === sandSource);
  const skillSand = components.find(c => c.source === sandSkillSource);
  const window = kazWindow(model, components);
  // 地面跳伤沿首次开技起算的全局时钟结算，技能秒伤沿本轮开技时钟结算。
  // 持续伤害（伊比利亚）有独立的每秒时钟，不随瞬发动作结算，瞬发期间仍按秒伤连续计入。
  const dot = components.filter(c => c.countsTowardDps && isDotSource(c.source)).reduce((sum, c) => sum + c.dps, 0);
  const part: Segment = { duration, dps: model.burst ? dot : dps - (ground?.dps ?? 0) - (skillSand?.dps ?? 0) - (window?.dps ?? 0) };
  if (skillAge === 0) part.cast = true;
  if (window) {
    // 瞬发技能的附带真伤已在 burst 中结算一次；窗口只负责此后的普攻。
    part.window = model.burst ? { ...window, dps: 0 } : window;
  }
  if (model.burst && skillAge === 0) {
    part.burst = components.filter(c => c.countsTowardDps && c !== ground && c !== skillSand && !isDotSource(c.source))
      .reduce((sum, c) => sum + c.perHit * c.hitsPerAttack, 0);
  } else if (skillAge === 0 && components.some(c => c.source.startsWith('cast:'))) {
    part.burst = components.reduce((n, c) => n + (c.countsTowardDps && c.source.startsWith('cast:') ? c.perHit * c.hitsPerAttack : 0), 0);
  }
  if (skillSand && duration > 0) {
    part.ticks = { first: Math.floor(skillAge + 1e-9) + 1 - skillAge, interval: 1, damage: skillSand.perHit };
  }
  return part;
}

function spGained(model: GenericModel, start: number, seconds: number, rate: number) {
  const clock = model.defendSp;
  if (!clock) return seconds * rate;
  const hits = Math.floor((start + seconds) / clock.interval + 1e-9) - Math.floor(start / clock.interval + 1e-9);
  return hits * clock.gain + seconds * Math.max(0, rate - clock.gain / clock.interval);
}
function waitForSp(model: GenericModel, start: number, need: number, rate: number) {
  if (need <= 0) return 0;
  if (!(rate > 0)) return Infinity;
  const clock = model.defendSp;
  if (!clock || !clock.gain) return need / rate;
  const next = (Math.floor(start / clock.interval + 1e-9) + Math.ceil(need / clock.gain - 1e-9)) * clock.interval - start;
  if (rate <= clock.gain / clock.interval + 1e-10) return next;
  return firstCrossing(t => spGained(model,start,t,rate), need, Math.min(next,need / rate + clock.interval));
}
function stationary(model: GenericModel, level: SkillLevelData, deployed = false, origin = 0) {
  const notes: string[] = [];
  const caveats = ['近似：按各阶段连续DPS积分，忽略逐帧攻击、前摇、弹道与技能切换的攻击重置（机制）；来源：本通用模型假设'];
  const prefix: Segment[] = [];
  let repeat: Segment[] = [];
  let cycle: CalcResult['cycle'] = null;
  let firstCast = Infinity;
  const repeatDuration = model.repeatDuration ?? model.duration;
  const idle = (duration: number): Segment => phaseSegment(model, false, duration);
  const cast = () => {
    const duration = deployed ? repeatDuration : model.duration;
    deployed = true;
    return phaseSegment(model, true, duration);
  };
  if (!model.skill) prefix.push(idle(Infinity));
  else if (model.lifecycle === 'on_deploy') {
    firstCast = 0;
    prefix.push(cast(), idle(Infinity));
  } else {
    let rate = 0;
    if (level.spType === 'INCREASE_WITH_TIME') rate = Math.max(0, level.increment);
    else if (level.spType === 'ON_ATTACK') {
      rate = model.normal.components.some(c => c.hitsPerSec > 0 && c.damageType !== 'none') ? 1 / model.normal.stats.attackInterval : 0;
      notes.push('近似：攻击回复按每次攻击1点技力、普攻频率连续折算；多段不额外回复，忽略攻击事件离散时点（机制）');
    } else if (level.spType === 'ON_DEFEND') notes.push('近似：受击回复缺少Boss攻击频率及受击条件，假设每秒受击0次，不凭空增加技力；初始技力仍可使用（机制）');
    else notes.push(`忽略了 ${level.spType} 技力回复（机制），按回复速度0处理`);
    caveats.push('近似：手动/自动技能均在技力足够时立即开启；技能期间停止回复，充能不等待蓄满（机制）');
    const cost = Math.max(0, level.spCost);
    const capacity = cost * Math.max(1, level.maxChargeTime);
    let sp = Math.min(capacity, Math.max(0, level.initSp));
    const endSp = skillEndSp(model);
    const wait = (need: number, from = origin) => waitForSp(model,from,need,rate);
    firstCast = wait(cost - sp);
    // 初始库存可有多份充能，每次施放只消耗一份。
    while (cost > endSp && sp >= cost) {
      const skill = cast();
      prefix.push(skill);
      if (skill.duration === Infinity) break;
      sp = Math.min(capacity, stockAfterCast(sp, cost, level.maxChargeTime, false, model.overcharge) + endSp);
    }
    if (prefix.at(-1)?.duration !== Infinity) {
      const opening = wait(cost - sp);
      prefix.push(idle(opening));
      if (Number.isFinite(opening)) prefix.push(cast());
      const recovery = wait(cost - endSp, origin + opening + model.duration);
      if (model.duration !== Infinity && recovery + repeatDuration > 0) {
        if (Number.isFinite(recovery)) {
          repeat = [idle(recovery), phaseSegment(model, true, repeatDuration)];
        } else if (Number.isFinite(opening)) prefix.push(idle(Infinity));
        const avgDps = Number.isFinite(recovery)
          ? repeat.reduce((sum, part) => sum + (part.burst ?? 0) + segmentDamage(part, part.duration), 0) / (recovery + repeatDuration)
          : model.normal.dps;
        cycle = { spRecoverSec: recovery, skillDurationSec: repeatDuration, avgDps };
      } else if (repeatDuration === 0 && recovery === 0) {
        notes.push(zeroCycleNote);
        prefix.push(idle(Infinity));
      }
    }
  }
  return { prefix, repeat, cycle, notes, caveats, firstCast };
}

function swiftPlan(model: GenericModel, level: SkillLevelData, atEnd = false, attackProgress = 0, deployed = false, drawOffset = 0) {
  const reward = skillEndSp(model);
  const e = model.battle;
  if (!e?.skillEndProbability || !reward) return;
  const rate = level.spType === 'INCREASE_WITH_TIME' ? Math.max(0,level.increment) : 0;
  const attack = level.spType==='ON_ATTACK' && model.normal.components.some(c=>c.hitsPerSec>0 && c.damageType!=='none');
  const wait = (need: number) => need<=0 ? 0 : attack ? Math.ceil(need-1e-10)*model.normal.stats.attackInterval : waitForSp(model, model.duration, need, rate);
  const cost = level.spCost;
  const initial = Math.min(cost*Math.max(1,level.maxChargeTime),Math.max(0,level.initSp));
  const firstCast = Math.max(0, (model.defendSp ? waitForSp(model,0,cost-initial,rate) : wait(cost - initial)) - (attack ? attackProgress * model.normal.stats.attackInterval : 0));
  const steady = model.repeatDuration ?? model.duration;
  const openingDuration = deployed ? steady : model.duration;
  const plan: RenewalPlan = {
    independentCycles:!atEnd && !deployed && !model.rebuild && !model.defendSp,
    prefix: atEnd ? [] : [phaseSegment(model, false, firstCast), phaseSegment(model, true, openingDuration)],
    stock: atEnd ? initial : stockAfterCast(initial,cost,level.maxChargeTime,attack,model.overcharge), discreteSp: attack, overcharge: model.overcharge,
    cost, maxCharges:level.maxChargeTime, reward, probability:e.skillEndProbability, wait,
    segments: recovery => [phaseSegment(model, false, recovery), phaseSegment(model, true, steady)], skillDuration: steady,
    drawOffset, minCycle: steady > 0 ? 0 : model.skill?.stats.attackInterval,
  };
  return { ...plan, firstCast };
}

// 流沙地面从首次开技起有独立的节拍，后续开启技能不重置它。
function groundTicks(model: GenericModel, firstCast: number, elapsed = 0): Segment['ticks'] {
  const sand = model.battle?.quicksand;
  const hit = model.skill?.components.find(c => c.source === sandSource);
  if (!sand || !hit?.perHit || !Number.isFinite(firstCast)) return;
  const first = firstCast + sand.firstDelay;
  return { first: first + tickCount(elapsed, first, sand.interval) * sand.interval, interval: sand.interval, damage: hit.perHit };
}

function groundCurve(at: (t: number) => number, ticks: Segment['ticks'], origin: number, cycle: CalcResult['cycle']) {
  if (!ticks) return { at, cycle };
  return {
    at: (t: number) => at(t) + tickCount(t + origin, ticks.first, ticks.interval) * ticks.damage,
    cycle: cycle && { ...cycle, avgDps: cycle.avgDps + ticks.damage / ticks.interval },
  };
}
function bodySource(source: string) {
  return source !== judgmentSource && source !== kazimierzSource && source !== sandSource && source !== sandSkillSource && !isDotSource(source);
}

function includeGround(result: TimelineResult, at: (t: number) => number, ticks: Segment['ticks'], duration: number, hp: number): TimelineResult {
  if (!ticks) return { ...result, at };
  const curve = groundCurve(at, ticks, 0, result.cycle);
  const guess = Number.isFinite(result.killTimeSec) ? result.killTimeSec : ticks.first + hp / (ticks.damage / ticks.interval);
  return { ...result, cycle: curve.cycle, totalDamage: curve.at(duration), killTimeSec: firstCrossing(curve.at, hp, guess), at: curve.at };
}

export function timeline(model: GenericModel, rawLevel: SkillLevelData, durationSec: number, hp: number): TimelineResult {
  if (model.customTimeline) return model.customTimeline(durationSec, hp);
  const e = model.battle;
  // 蓄力在就绪即开的时间轴上每次只施放一次。卡涅利安清空技力，薇薇安娜S1未蓄满时仅扣基础消耗。
  // https://prts.wiki/w/卡涅利安#技能 https://prts.wiki/w/薇薇安娜#光影迅捷剑
  const level = { ...rawLevel, initSp: rawLevel.initSp + (e?.initSp ?? 0),
    maxChargeTime: model.overcharge && model.lifecycle === 'timed' ? 1 : rawLevel.maxChargeTime,
    spCost: Math.max(e?.spCostMin ?? 0, rawLevel.spCost * (e?.spCostScale ?? 1)),
    increment: rawLevel.increment + (e?.spRecovery ?? 0) };
  if (!model.rebuild || !e) {
    const swift = swiftPlan(model,level);
    if (swift) {
      const result = swiftRenewal(swift,durationSec,hp);
      const base = stationary({...model,battle:undefined},level);
      result.notes.push(...base.notes.filter(n=>!n.includes('普攻频率连续折算')));
      result.caveats.push(...base.caveats);
      const ticks = groundTicks(model, swift.firstCast);
      const curve = renewalCurve(swift);
      const firstSkill = model.skill ? firstSkillAt(swift.firstCast, model.duration) : undefined;
      return { ...ticks ? includeGround(result, curve.at, ticks, durationSec, hp) : { ...result, at: curve.at }, firstCast: swift.firstCast, firstSkill };
    }
    const plan = stationary(model, level);
    const firstSkill = model.skill ? firstSkillAt(plan.firstCast, model.duration) : undefined;
    const result = { ...integrateWithCasts(plan.prefix, plan.repeat, durationSec, hp), cycle: plan.cycle, notes: plan.notes, caveats: plan.caveats, firstCast: plan.firstCast, firstSkill };
    return includeGround(result, t => integrate(plan.prefix, plan.repeat, t, 0).totalDamage, groundTicks(model, plan.firstCast), durationSec, hp);
  }
  return dynamicTimeline(model,rawLevel,level,durationSec,hp);
}
function dynamicTimeline(model: GenericModel, rawLevel: SkillLevelData, level: SkillLevelData, durationSec: number, hp: number): TimelineResult {
  const e = model.battle!;
  // 有限事件前缀：伤害仍连续积分，但叠层只在技能开启/完成一次攻击/整秒事件发生后增加。
  // 来源：本通用时间过程假设；保留攻击进度，换相位/攻速变化不凭空多送一次攻击。
  interface Snapshot { time:number; counts:number[]; damageEvents:number; attackProgress:number; sp:number; firstCast:number; lastCast:number; weight:number; ends:number }
  const capacity = level.spCost * Math.max(1, level.maxChargeTime);
  const initial: Snapshot = {time:0,counts:e.stacks.map(()=>0),damageEvents:0,attackProgress:0,
    sp:Math.min(capacity,Math.max(0,level.initSp)),firstCast:Infinity,lastCast:0,weight:1,ends:0};
  const phases: NonNullable<TimelineResult['phases']> = {};
  let castAt = Infinity;
  // 第一轮技能实际结束的时刻；首次开技发生在稳定尾段时按尾段模型的首轮时长。
  let firstEndAt = Infinity, firstLength = 0;
  const firstEnd = (at: number) => { if (Number.isFinite(castAt) && !Number.isFinite(firstEndAt)) firstEndAt = at; };
  // 首次开技发生在稳定尾段时，尾段面板即开技时的面板。
  const tailCast = (model: GenericModel, at: number) => {
    if (Number.isFinite(castAt) || !Number.isFinite(at)) return;
    castAt = at;
    firstLength = model.duration;
    phases.normal ??= model.normal;
    phases.skill ??= model.skill ?? undefined;
  };
  const curves: {start:number; weight:number; at:(t:number)=>number}[] = [];
  const notes = new Set<string>();
  const caveats = new Set<string>();
  const queue = new Map<string,Snapshot>();
  const stableCycles: {cycle:NonNullable<TimelineResult['cycle']>;weight:number}[] = [];
  const finishNotes: (()=>void)[] = [];
  const addPrefix = (parts: Segment[], snap: Snapshot) => {
    if(parts.length) curves.push({start:snap.time,weight:snap.weight,at:t=>integrate(parts,[],t,Infinity).totalDamage});
  };
  let expanded = 0;
  const walk = (snap: Snapshot): TimelineResult | undefined => {
    const prefix: Segment[] = [];
    const counts = [...snap.counts];
    let { damageEvents, time, attackProgress, sp, firstCast, lastCast, ends } = snap;
    // 零时长技能被回技立即续开时，下一次施放最早在一个攻击间隔之后（模型假设）。
    let lockedUntil = -Infinity;
    let deployed = Number.isFinite(firstCast);
    let nextGround: Segment['ticks'];
    let nextSecond = Math.floor(time+1e-9)+1;
    let attackSpProgress = 0;
    let active = false;
    let remainingSkill = 0;
    let current = model;
    const eventNotes = new Set<string>();
    let branched = false;
    const finish = () => {
      if (snap === initial) firstEnd(time);
      active = false;
      const endSp = skillEndSp(current);
      const prob = current.battle?.skillEndProbability ?? 0;
      // 迅捷：每次技能结束按固定判定序列判定一次。
      if (endSp && swiftRefundSucceeds(ends, prob, time)) sp = Math.min(capacity, sp + endSp);
      ends++;
      if (prob>0) eventNotes.add(swiftNote);
    };
    const rebuild = () => {
      const oldInterval = current.skill?.stats.attackInterval;
      current = model.rebuild!(e.stacks.map((s, i) => ({ ...s.modifier, value: s.modifier.value * counts[i] })), time, damageEvents);
      // 弹药/下次攻击按剩余攻击进度计时；攻速中途变化不能沿用开启瞬间的秒数。
      if (active && oldInterval && current.skill && (model.lifecycle === 'ammo' || (model.lifecycle === 'instant' || model.lifecycle === 'charge') && !model.burst && level.duration <= 0)) {
        remainingSkill *= current.skill.stats.attackInterval / oldInterval;
      }
    };
    const trigger = (kind: 'skill' | 'attack' | 'second') => {
      e.stacks.forEach((s, i) => { if (s.trigger === kind) counts[i] = Math.min(s.max, counts[i] + 1); });
      rebuild();
    };
    const canActivate = () => current.skill !== null && (model.lifecycle !== 'on_deploy' || !deployed) && time >= lockedUntil - 1e-9;
    const start = () => {
      if (!Number.isFinite(firstCast)) phases.normal = current.normal;
      if (model.lifecycle !== 'on_deploy') sp = stockAfterCast(sp, level.spCost, level.maxChargeTime, false, model.overcharge);
      const recast = deployed;
      deployed = true;
      firstCast = Math.min(firstCast, time);
      castAt = Math.min(castAt, time);
      lastCast = time;
      attackSpProgress = 0;
      trigger('skill');
      if (!Number.isFinite(snap.firstCast) && firstCast === time && !phases.skill) phases.skill = current.skill ?? undefined;
      active = true;
      remainingSkill = recast ? current.repeatDuration ?? current.duration : current.duration;
      if (current.burst || current.skill?.components.some(c => c.source.startsWith('cast:'))) {
        prefix.push(phaseSegment(current, true, 0));
        damageEvents += current.skill!.components.filter(c => c.countsTowardDps && (current.burst ? bodySource(c.source) : c.source.startsWith('cast:'))).reduce((sum,c) => sum+c.hitsPerAttack,0);
        if (current.burstAttack) trigger('attack'); else rebuild();
      }
    };
    rebuild();
    if ((expanded>4096 || snap.weight<1e-14) && !(e.judgment && time < e.judgment.until)) {
      const plan = swiftPlan(current,{...level,initSp:sp,increment:rawLevel.increment+(current.battle?.spRecovery ?? 0)}, false, attackSpProgress, deployed, ends);
      if(plan) {
        const curve = renewalCurve({ ...plan, toBattleTime: t => snap.time + t });
        const ground = groundCurve(curve.at, groundTicks(current, Math.min(firstCast, time+plan.firstCast), time), snap.time, curve.cycle);
        curves.push({start:snap.time,weight:snap.weight,at:ground.at});
        stableCycles.push({cycle:ground.cycle!,weight:snap.weight});
        finishNotes.push(()=>{curve.finishNotes();curve.notes.forEach(n=>notes.add(n));});
        notes.add('近似：动态前缀超过4096个状态或分支概率低于10⁻¹⁴，后续按该分支当前属性计算。');
        return;
      }
    }
    if (!deployed && model.lifecycle === 'on_deploy' && current.skill) start();
    let tail: ReturnType<typeof stationary> | undefined;
    while (true) {
      if (active && remainingSkill <= 1e-9) finish();
      if (branched) return;
      if (!active && canActivate() && sp >= level.spCost - 1e-9) {
        start();
        if (remainingSkill === 0) {
          finish();
          if (sp >= level.spCost - 1e-9 && canActivate()) {
            lockedUntil = time + (current.skill?.stats.attackInterval ?? current.normal.stats.attackInterval);
            eventNotes.add(swiftLockNote);
          }
          continue;
        }
      }
      const phase = active ? current.skill! : current.normal;
      const age = time - lastCast;
      const attacks = phase.components.some(c => bodySource(c.source) && c.hitsPerSec > 0 && c.damageType !== 'none');
      const proc = phase.components.find(c => c.source === judgmentSource);
      const hits = phase.components.filter(c => c.countsTowardDps && bodySource(c.source)).reduce((sum,c) => sum+c.hitsPerAttack, 0);
      const dynamic = current.battle ?? e;
      const pendingBond = damageEvents * (dynamic.bondStacks?.perDamage ?? 0) < (dynamic.bondStacks?.max ?? 0);
      const attackCanChange = attacks && (proc !== undefined || hits > 0 && pendingBond || e.stacks.some((s,i)=>s.trigger==='attack' && counts[i]<s.max) || hits > 0 && damageEvents*(dynamic.resShred?.perHit ?? 0)<(dynamic.resShred?.max ?? 0));
      const pendingSkill = canActivate() && e.stacks.some((s,i)=>s.trigger==='skill' && counts[i]<s.max);
      const pendingSecond = e.stacks.some((s,i)=>s.trigger==='second' && counts[i]<s.max);
      const expiry = Math.min(dynamic.judgment && dynamic.judgment.until > time + 1e-9 ? dynamic.judgment.until : Infinity,
        ...(model.breakpoints ?? []).filter(t => t > time + 1e-9), ...dynamic.timedStats.filter(t=>t.until>time+1e-9).map(t=>t.until));
      // 以后还有技能才可能出现攻击/开启叠层；不可到达的事件不无限等待。
      const rate = level.spType === 'INCREASE_WITH_TIME' ? Math.max(0,rawLevel.increment + (dynamic.spRecovery ?? 0))
        : level.spType === 'ON_ATTACK' && attacks ? 1/current.normal.stats.attackInterval : 0;
      const discrete = dynamic.skillEndProbability>0 && dynamic.skillEndSp>0 && level.spType==='ON_ATTACK';
      const skillReachable = !active && canActivate() && (rate>0 || sp>=level.spCost);
      // 回技足以立刻续开时，技能间没有普攻时间，不能等待普攻叠层。
      const normalReachable = active && Number.isFinite(remainingSkill) && (!canActivate() || (current.battle?.skillEndProbability ?? 0) > 0 && current.battle!.skillEndProbability < 1 || skillEndSp(current) < level.spCost - 1e-9);
      const laterPhases = [...(normalReachable ? [current.normal] : []), ...(skillReachable ? [current.skill!] : [])];
      const laterAttacks = laterPhases.some(p => p.components.some(c=>bodySource(c.source) && c.damageType !== 'none' && c.hitsPerSec>0));
      const laterDamage = laterPhases.some(p => p.components.some(c=>c.countsTowardDps && c.hitsPerSec>0));
      // 治疗可触发攻击/治疗叠层，但不能触发“造成伤害”叠层或减抗。
      const futureAttackChange = laterAttacks && e.stacks.some((s,i)=>s.trigger==='attack' && counts[i]<s.max)
        || laterDamage && (pendingBond || damageEvents*(dynamic.resShred?.perHit ?? 0)<(dynamic.resShred?.max ?? 0));
      nextGround = groundTicks(current, firstCast, time);
      const pendingDamage = pendingBond || damageEvents*(dynamic.resShred?.perHit ?? 0)<(dynamic.resShred?.max ?? 0);
      const lockWait = Math.max(0, lockedUntil - time);
      const lockMayChange = lockWait > 1e-9 && (e.stacks.some((stack, i) => counts[i] < stack.max) || pendingDamage);
      const stable = !attackCanChange && !futureAttackChange && !(nextGround && pendingDamage) && !(pendingSkill && (active && remainingSkill!==Infinity || skillReachable)) && !pendingSecond && expiry===Infinity && !lockMayChange;
      if (stable) {
        const next = model.lifecycle === 'on_deploy' && deployed || active && remainingSkill===Infinity ? { ...current, skill: null } : current;
        const lockedGain = spGained(current,time,lockWait,rate);
        const tailLevel = { ...level, increment:rawLevel.increment+dynamic.spRecovery,initSp:Math.min(capacity,sp+(discrete ? Math.floor(attackSpProgress+lockedGain+1e-9) : lockedGain)) };
        const swift = swiftPlan(next,tailLevel,active,attackSpProgress,deployed,ends);
        if (swift) {
          if (active && snap === initial) firstEnd(time + (current.burst ? 0 : remainingSkill));
          if(active && !current.burst) prefix.push({ ...phaseSegment(current,true,remainingSkill,age), burst: 0 });
          if (lockWait > 0) prefix.push(phaseSegment(current, false, lockWait));
          swift.prefix = [...prefix,...swift.prefix];
          if (!active) tailCast(next, time + lockWait + swift.firstCast);
          const curve = renewalCurve({ ...swift, toBattleTime: t => snap.time + t });
          const ground = groundCurve(curve.at, nextGround ?? groundTicks(current, time+swift.firstCast, time), snap.time, curve.cycle);
          curves.push({start:snap.time,weight:snap.weight,at:ground.at});
          stableCycles.push({cycle:ground.cycle!,weight:snap.weight});
          finishNotes.push(()=>{curve.finishNotes(); curve.notes.forEach(n=>notes.add(n));});
          return;
        }
        const tailOrigin = time + (active ? remainingSkill : 0);
        if (active) {
          if (snap === initial) firstEnd(time + (current.burst ? 0 : remainingSkill));
          if (!current.burst) prefix.push({ ...phaseSegment(current, true, remainingSkill, age), burst: 0 });
          if (Number.isFinite(remainingSkill)) finish();
        }
        tail = stationary(next, { ...level, increment: rawLevel.increment + dynamic.spRecovery, initSp: sp }, deployed, tailOrigin);
        tailCast(next, tailOrigin + tail.firstCast);
        nextGround ??= groundTicks(current, tailOrigin + tail.firstCast, time);
        break;
      }
      const toAttack = attackCanChange ? (1-attackProgress)*phase.stats.attackInterval : Infinity;
      const unlock = !active && time < lockedUntil - 1e-9 && current.skill !== null ? lockedUntil - time : Infinity;
      const toSkill = active ? remainingSkill : canActivate() && rate>0 ? waitForSp(model,time,discrete ? Math.ceil(level.spCost-sp-1e-10)-attackSpProgress : level.spCost-sp,rate) : unlock;
      const toSecond = pendingSecond ? nextSecond-time : Infinity;
      const toGround = nextGround ? nextGround.first - time : Infinity;
      const toSkillTick = pendingDamage && active && phase.components.some(c => c.source === sandSkillSource)
        ? Math.floor(age + 1e-9) + 1 - age : Infinity;
      const delta = Math.min(toAttack,toSkill,toSecond,expiry-time,toGround,toSkillTick);
      if (!Number.isFinite(delta)) { tail = stationary({ ...current, skill: null }, level, deployed); break; }
      const part = phaseSegment(current, active, delta, age);
      // 瞬发已在开技处结算，裁度仍按完整攻击动作离散结算。
      prefix.push({ ...part, burst: 0, dps: current.burst && active ? 0 : part.dps - (proc?.dps ?? 0) });
      if (attacks) attackProgress += delta / phase.stats.attackInterval;
      if (active) remainingSkill -= delta;
      else if (discrete) {
        attackSpProgress += delta*rate;
        const gained = Math.floor(attackSpProgress+1e-9);
        sp = Math.min(capacity,sp+gained);
        attackSpProgress = Math.max(0,attackSpProgress-gained);
      } else sp = Math.min(capacity, sp+spGained(model,time,delta,rate));
      time = Math.abs(time + delta - expiry) < 1e-9 ? expiry : time + delta;
      if (toGround <= delta + 1e-9) {
        prefix.push({ duration: 0, dps: 0, burst: nextGround!.damage });
        damageEvents++;
      }
      if (toSkillTick <= delta + 1e-9) damageEvents++;
      if (toAttack <= delta+1e-9) {
        if (proc) prefix.push({ duration: 0, dps: 0, burst: proc.perHit });
        attackProgress = 0;
        damageEvents += hits;
        trigger('attack');
      } else attackProgress %= 1;
      if (toSecond <= delta+1e-9) { trigger('second'); nextSecond++; }
      else nextSecond = Math.floor(time+1e-9)+1;
      if (toAttack > delta+1e-9 && toSecond > delta+1e-9) rebuild();
    }
    tail ??= stationary(current, { ...level, initSp: sp }, deployed);
    const plan = [...prefix, ...tail.prefix];
    const tailNotes = [...new Set([...eventNotes, ...tail.notes])];
    if (model.burst && !model.burstAttack && e.stacks.some(s => s.trigger === 'attack')) tailNotes.push('近似：瞬发技能的伤害段数不等于攻击事件数，未将瞬发伤害计入攻击触发叠层；待技能精建确认');
    if (e.stacks.length) tailNotes.push('近似：装备叠层按技能开启、完整攻击间隔末端及部署后整秒触发；伤害连续积分，同击各段共用叠层前属性，来源：本时间过程假设');
    const baseAt = (t: number) => integrate(plan,tail.repeat,t,0).totalDamage;
    if(snap===initial) return { ...includeGround({ ...integrateWithCasts(plan,tail.repeat,durationSec,hp), cycle:tail.cycle, notes:tailNotes,caveats:tail.caveats }, baseAt, nextGround, durationSec, hp), firstCast: castAt, phases, firstSkill: dynamicFirst() };
    const ground = groundCurve(baseAt, nextGround, snap.time, tail.cycle);
    curves.push({start:snap.time,weight:snap.weight,at:ground.at});
    if(ground.cycle) stableCycles.push({cycle:ground.cycle,weight:snap.weight});
    tailNotes.forEach(n=>notes.add(n));
    tail.caveats.forEach(n=>caveats.add(n));
  };
  const dynamicFirst = (): FirstSkill | undefined => !model.skill ? undefined
    : Number.isFinite(firstEndAt) ? { start: castAt, end: firstEndAt } : firstSkillAt(castAt, firstLength);
  const direct = walk(initial);
  if(direct) return direct;
  while(queue.size) {
    const states = [...queue.values()];
    queue.clear();
    for (const snap of states) { expanded++; walk(snap); }
  }
  const avgDps = stableCycles.reduce((sum,s)=>sum+s.weight*s.cycle.avgDps,0);
  const cycle = stableCycles.length ? {avgDps, skillDurationSec:stableCycles[0]!.cycle.skillDurationSec,
    spRecoverSec:stableCycles.reduce((sum,s)=>sum+s.weight*s.cycle.spRecoverSec,0)} : null;
  const at = (t:number) => curves.reduce((sum,c)=>sum+(t>=c.start ? c.weight*c.at(t-c.start) : 0),0);
  const totalDamage = at(durationSec);
  const killTimeSec = firstCrossing(at,hp,avgDps>0 ? hp/avgDps : durationSec);
  finishNotes.forEach(f=>f());
  return {totalDamage,killTimeSec,cycle,notes:[...notes],caveats:[...caveats],firstCast:castAt,phases,firstSkill:dynamicFirst(),at};
}
