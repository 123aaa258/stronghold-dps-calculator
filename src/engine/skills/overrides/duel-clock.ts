import type { GenericModel } from '../generic.ts';
import type { OverrideContext } from './index.ts';
import type { PhaseResult } from '../../types.ts';
import { Track, firstCrossing, swiftRefundSucceeds } from '../../swift.ts';
import { actionDamage, dotDps } from './shared.ts';

export interface DuelState {
  time: number;
  cast: number;
  active: boolean;
  start: number;
  attack: number;
  sp: number;
}
interface Actions {
  normal: PhaseResult;
  skill: PhaseResult;
  length: (cast: number) => number;
  panel: (state: DuelState) => PhaseResult;
  shot?: (state: DuelState, panel: PhaseResult) => number;
  endAfterShot?: (state: DuelState) => boolean;
  onCast?: (state: DuelState) => number;
  /** 开技缴械等会中断当前普通攻击；有此行为时给出恢复攻击后的首次命中时刻。 */
  nextShotAfterCast?: (state: DuelState) => number;
  onEnd?: (state: DuelState) => void;
  nextEvent?: (state: DuelState) => number;
  event?: (state: DuelState) => number;
  /** 下一次普攻直接替换为技能攻击。 */
  nextAttack?: boolean;
  retired?: () => boolean;
}

/** 技能与普攻分别计时。前摇未给出时，首次命中在第一个完整攻击间隔末。 */
export function duelClock(ctx: OverrideContext, model: GenericModel, a: Actions) {
  const e = model.battle!, lv = ctx.level;
  const cost = Math.max(e.spCostMin, lv.spCost * e.spCostScale);
  const capacity = cost * Math.max(1, lv.maxChargeTime);
  const rate = lv.spType === 'INCREASE_WITH_TIME' ? Math.max(0, lv.increment + e.spRecovery) : 0;
  const state: DuelState = { time: 0, cast: 0, active: false, start: 0, attack: 0, sp: Math.min(capacity, lv.initSp + e.initSp) };
  const track = new Track();
  let end = Infinity, nextShot = a.normal.stats.attackInterval, earliestCast = 0;
  const eps = 1e-9;
  let lastNormalTime = -Infinity, lastNormalDamage = 0, preCastDamage = 0;
  model.normal = a.normal;
  model.skill = a.skill;
  model.duration = a.length(1);
  model.burst = false;
  const finish = () => {
    end = Infinity;
    state.active = false;
    a.onEnd?.(state);
    if (e.skillEndSp > 0 && swiftRefundSucceeds(state.cast - 1, e.skillEndProbability, state.time)) state.sp = Math.min(capacity, state.sp + e.skillEndSp);
    track.push({ duration: 0, dps: 0, end: true });
  };
  const advance = (target: number) => {
    while (track.time <= target + eps && Number.isFinite(track.time)) {
      const before = a.panel(state);
      const ready = state.active ? Infinity : Math.max(earliestCast, state.sp >= cost - eps ? state.time :
        rate > 0 ? state.time + (cost - state.sp) / rate : Infinity);
      const castAt = a.nextAttack && ready <= nextShot + eps ? nextShot : ready;
      const eventAt = a.nextEvent?.(state) ?? Infinity;
      const time = Math.min(nextShot, end, castAt, eventAt);
      if (!Number.isFinite(time) || a.retired?.()) { track.push({ duration: Infinity, dps: 0 }); break; }
      const dt = Math.max(0, time - state.time);
      track.push({ duration: dt, dps: dotDps(before) });
      if (!state.active) state.sp = Math.min(capacity, state.sp + dt * rate);
      state.time = time;
      if (end <= time + eps) finish();
      let burst = 0;
      let nextShotReset = false;
      if (eventAt <= time + eps) burst += a.event?.(state) ?? 0;
      if (!state.active && state.sp >= cost - eps && time >= earliestCast - eps && (!a.nextAttack || nextShot <= time + eps)) {
        if (!state.cast && Math.abs(lastNormalTime - time) < eps) preCastDamage = lastNormalDamage;
        state.active = true;
        state.start = time;
        state.cast++;
        // 真蓄力无论是否蓄满都消费现有技力；可充能技能只扣一份。
        state.sp = model.overcharge ? 0 : Math.max(0, state.sp - cost);
        end = time + a.length(state.cast);
        burst += a.onCast?.(state) ?? 0;
        if (a.nextShotAfterCast) {
          nextShot = a.nextShotAfterCast(state);
          nextShotReset = true;
        }
        track.push({ duration: 0, dps: 0, cast: true });
      }
      if (nextShot <= time + eps) {
        const p = a.panel(state);
        const shot = a.shot ? a.shot(state, p) : actionDamage(p);
        if (!state.active) { lastNormalTime = time; lastNormalDamage = shot; }
        burst += shot;
        state.attack++;
        if (state.active && a.endAfterShot?.(state)) end = time;
        if (!state.active && lv.spType === 'ON_ATTACK') state.sp = Math.min(capacity, state.sp + lv.increment);
        nextShot = time + a.panel(state).stats.attackInterval;
      } else if (!nextShotReset) {
        // 攻速变化时继承已经完成的攻击进度。
        nextShot = time + (nextShot - time) * a.panel(state).stats.attackInterval / before.stats.attackInterval;
      }
      if (end <= time + eps) {
        finish();
        if (state.sp >= cost - eps) earliestCast = time + a.normal.stats.attackInterval;
      }
      if (burst) track.push({ duration: 0, dps: 0, burst });
      if (time >= target - eps) break;
    }
  };
  // 屏幕窗口逐事件算；长时击杀重用最后一个完整施放区间，保留伤害跳点。
  let tail: { from: number; until: number; gain: number } | undefined;
  const limit = 720;
  const at = (t: number): number => {
    if (t < 0) return 0;
    advance(Math.min(t, limit));
    if (t <= limit || !Number.isFinite(track.time)) return track.at(t);
    if (!tail) {
      const casts = track.casts.filter(time => time <= limit);
      const until = casts.length >= 3 ? casts.at(-1)! : limit;
      const from = casts.length >= 3 ? casts[Math.max(0, casts.length - 5)]! : limit / 2;
      tail = { from, until, gain: track.at(until) - track.at(from) };
    }
    const period = tail.until - tail.from;
    const n = Math.floor((t - limit) / period);
    return track.at(limit) + n * tail.gain + track.at(tail.from + t - limit - n * period) - track.at(tail.from);
  };
  const eventsUntil = (events: number[], t: number) => {
    at(t);
    const times = events.filter(time => time <= Math.min(t, limit));
    if (!tail || t <= limit || !Number.isFinite(t)) return times;
    const offsets = events.filter(time => time > tail!.from && time <= tail!.until).map(time => time - tail!.from);
    if (!offsets.length) return times;
    const period = tail.until - tail.from;
    for (let start = limit; start <= t && times.length < 100000; start += period) {
      for (const offset of offsets) if (start + offset <= t) times.push(start + offset);
    }
    return times;
  };
  model.customTimeline = (t, hp) => {
    const totalDamage = at(t);
    // 查找首轮事件不改变累计曲线，零时长窗口也能给出完整阶段。
    if (!track.casts.length) advance(Math.min(limit, Math.max(180, t)));
    const start = track.casts[0] ?? Infinity;
    const avg = at(180) / 180;
    const kill = !Number.isFinite(hp) ? Infinity : firstCrossing(at, hp, hp / Math.max(1, avg));
    return { totalDamage, killTimeSec: kill, at, firstSkill: { start, preCastDamage, end: track.ends[0] ?? start + a.length(1) },
      castsUntil: (time: number) => eventsUntil(track.casts, time),
      endsUntil: (time: number) => eventsUntil(track.ends, time),
      cycle: !Number.isFinite(a.length(1)) ? null : { avgDps: avg, skillDurationSec: (track.ends[0] ?? start + a.length(1)) - start || 0, spRecoverSec: Math.max(0, (track.casts[1] ?? start + a.length(1)) - start - a.length(1)) || 0 },
      notes: [], caveats: [] };
  };
  const note = '普攻从首个完整攻击间隔命中；超过720秒的累计伤害与击杀按末段施放周期推算。';
  model.assumptions = [...model.assumptions ?? [], note];
  model.notes.push('近似：' + note);
  model.nativeRotation = false;
  model.rebuild = undefined;
  return model;
}
