import { expandWindow, integrate, segmentDamage, type Segment, type TimelineResult, type WindowState } from './timeline.ts';

export const swiftNote = '迅捷在每次技能结束时判定一次，成功时整笔返还技力。成员回技与40层额外回技共用本次判定。';
export interface RenewalPlan {
  /** 轮次只由本次回技决定，本体与其他技能轴之间没有共享的随机状态。 */
  independentCycles?: boolean;
  prefix: Segment[];
  stock: number;
  cost: number;
  maxCharges: number;
  discreteSp?: boolean;
  overcharge?: boolean;
  probability: number;
  reward: number;
  wait: (need: number) => number;
  segments: (recovery: number, elapsed: number) => Segment[];
  stableAfter?: number;
  skillDuration: number;
  /** 本计划第一次判定之前已经结束的技能次数，用于在固定判定序列中对齐。 */
  drawOffset?: number;
  /** 非秒坐标（例如帧数或累计伤害）与分支的局部时间在此转换为部署后秒数。 */
  toBattleTime?: (cursor: number, cycles: number, recoverySum: number) => number;
  /** 回技后立即续开时，两次施放的最短间隔（秒）。缺省只防止零时长连发（1 秒）。 */
  minCycle?: number;
  /** 技能有跨轮计数时，与技力库存一起保留。parts 从上次技能结束起，直到本次付费施放结束。 */
  counter?: {
    initial: number;
    afterCharge: (count: number, recovery: number, stockAfterPayment: number, elapsed: number) =>
      { count: number; stock: number; weight: number; parts: Segment[]; freeSkills?: FreeSkills }[];
  };
}
const elapsed = (parts: Segment[]) => parts.reduce((sum, s) => sum + s.duration, 0);
const round = (n: number) => Math.round(n * 1e9) / 1e9;
export function firstCrossing(at: (t: number) => number, hp: number, guess: number) {
  if (!Number.isFinite(hp)) return Infinity;
  if (at(0) >= hp) return 0;
  let lo = 0, lower = at(0), hi = Math.max(1, guess), upper = at(hi);
  for (let i = 0; upper < hp; i++) {
    if (i >= 40) return Infinity;
    lo = hi; lower = upper; hi *= 2; upper = at(hi);
  }
  for (let i=0; i<52 && hi-lo>1e-8; i++) {
    let mid = lo+(hp-lower)*(hi-lo)/(upper-lower);
    if (i%3===2 || !(mid>lo+1e-10 && mid<hi-1e-10)) mid=(hi+lo)/2;
    const value = at(mid);
    if (Math.abs(value-hp) <= 1e-10*Math.max(1,hp) && at(Math.max(lo,mid-1e-8))<hp && at(Math.min(hi,mid+1e-8))>=hp) return mid;
    if (value >= hp) {hi=mid;upper=value;} else {lo=mid;lower=value;}
  }
  return hi;
}

export function stockAfterCast(sp:number, cost:number, maxCharges:number, discreteSp=false, overcharge=false) {
  const needed = Math.max(0,cost-sp);
  const charged = discreteSp ? Math.ceil(needed-1e-10) : needed;
  const capacity = cost * Math.max(1,maxCharges);
  return overcharge && sp + charged >= capacity ? 0 : round(Math.max(0, Math.min(capacity,sp+charged)-cost));
}

/**
 * 固定判定序列（模型假设）：第 k 次判定（k 从 0 起）取黄金分割序列
 * u_k = frac(0.5 + offset + k × 0.6180339887…)，u_k < 概率即成功。
 * - 同一配置结果固定；
 * - 同一序列下概率越高，成功的判定只增不减；
 * - 序列在 [0,1) 上分布均匀，前 n 次的成功次数与 概率 × n 相差不超过约 2 次。
 * stream 区分互不相关的判定（0：迅捷回技与装备概率；1：精建循环中的加权分支），
 * 各条序列的起点错开 √2−1，避免同步。
 */
const GOLDEN = 0.6180339887498949;
const STREAM_OFFSET = 0.41421356237309503;
export function swiftDraw(k: number, stream = 0): number {
  const x = 0.5 + stream * STREAM_OFFSET + k * GOLDEN;
  return x - Math.floor(x);
}
export function swiftSucceeds(k: number, probability: number, stream = 0): boolean {
  return probability >= 1 || probability > 0 && swiftDraw(k, stream) < probability;
}

interface FreeSkills { count: number; firstEnd: number; interval: number }
type SwiftDecision = (k: number, probability: number, endTime?: number) => boolean;
let currentSwiftPath: SwiftDecision | undefined;
let refundReads = 0;
/** 面板重建若读取过迅捷结果，这个面板不能跨概率分支复用。 */
export function swiftReadCount() { return refundReads; }

/** 同步运行一条指定的迅捷路径，嵌套计算返回或抛错时恢复上一条路径。 */
export function withSwiftPath<T>(decide: SwiftDecision, run: () => T): T {
  const previous = currentSwiftPath;
  currentSwiftPath = decide;
  try { return run(); }
  finally { currentSwiftPath = previous; }
}

/** 本体、附加效果和状态重建对同次技能结束均使用同一个 k，从零起算。 */
export function swiftRefundSucceeds(k: number, probability: number, endTime?: number): boolean {
  if (!(probability > 0)) return false;
  if (probability >= 1) return true;
  if (!currentSwiftPath) return swiftSucceeds(k, probability);
  refundReads++;
  return currentSwiftPath(k, probability, endTime);
}
/** 前 n 次判定（k = 0…n−1）中成功的次数。 */
export function sequenceSuccesses(n: number, probability: number, stream = 0): number {
  let count = 0;
  for (let k = 0; k < n; k++) if (swiftSucceeds(k, probability, stream)) count++;
  return count;
}
export const swiftLockNote = '近似：迅捷回技足以立即续开零时长技能时，两次施放至少间隔一个攻击间隔（无攻击间隔信息时按1秒），期间照常普攻；来源：模型假设';

/** 按绝对时间顺序追加的分段轨迹，窗口秒伤在追加时折入；支持任意时刻的累计伤害查询。 */
export class Track {
  time = 0;
  readonly parts: Segment[] = [];
  /** 带 cast 标记的分段起点（开技时刻）。 */
  readonly casts: number[] = [];
  /** 带 end 标记的分段起点（技能结束时刻）。 */
  readonly ends: number[] = [];
  private starts: number[] = [];
  private before: number[] = [];
  private total = 0;
  private state: WindowState = {};
  push(segment: Segment) {
    if (!Number.isFinite(this.time)) return;
    if (segment.cast && this.casts.at(-1) !== this.time) this.casts.push(this.time);
    if (segment.end && this.ends.at(-1) !== this.time) this.ends.push(this.time);
    if (!segment.window && !segment.cast) {
      this.append({ ...segment });
    } else {
      for (const piece of expandWindow(segment, this.time, this.state)) this.append(piece);
    }
  }
  private append(piece: Segment) {
    this.parts.push(piece); this.starts.push(this.time); this.before.push(this.total);
    this.total += (piece.burst ?? 0) + segmentDamage(piece, piece.duration);
    this.time += piece.duration;
  }
  get damage() { return this.total; }
  at(t: number): number {
    if (t < 0 || !this.parts.length) return 0;
    let lo = 0, hi = this.parts.length - 1;
    if (this.starts[0]! > t + 1e-10) return 0;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (this.starts[mid]! <= t + 1e-10) lo = mid; else hi = mid - 1; }
    const piece = this.parts[lo]!;
    return this.before[lo]! + (piece.burst ?? 0) + segmentDamage(piece, Math.max(0, Math.min(piece.duration, t - this.starts[lo]!)));
  }
}

const maxCycles = 20000;
let expectedRenewals = false;
/** 仅在外层已排除装备、其他盟约和跨轨迹联动的窗口伤害查询中启用。 */
export function withExpectedRenewals<T>(run:()=>T):T {
  const previous = expectedRenewals;
  expectedRenewals = true;
  try { return run(); } finally { expectedRenewals = previous; }
}

function staticRenewalCurve(plan:RenewalPlan): ReturnType<typeof sampledRenewalCurve> | undefined {
  const p = plan.probability;
  if (!plan.independentCycles || plan.counter || plan.toBattleTime || plan.stableAfter || plan.stock !== 0 ||
      !(p > 0 && p < 1) || plan.prefix.some(s => s.window || !Number.isFinite(s.duration))) return;
  const prefix = new Track();
  for (const part of plan.prefix) prefix.push(part);
  const outcome = (gain:number) => {
    const sp = Math.min(plan.maxCharges * plan.cost, gain);
    if (stockAfterCast(sp, plan.cost, plan.maxCharges, plan.discreteSp, plan.overcharge) !== 0) return;
    let recovery = plan.wait(Math.max(0, plan.cost - sp));
    if (!Number.isFinite(recovery)) return;
    let parts = plan.segments(recovery, Infinity);
    const length = elapsed(parts);
    const lock = plan.minCycle ?? (length <= 1e-9 ? 1 : 0);
    if (recovery <= 1e-9 && length < lock - 1e-9) {
      recovery += lock - length;
      parts = plan.segments(recovery, Infinity);
    }
    if (parts.some(s => s.window || !Number.isFinite(s.duration))) return;
    const track = new Track();
    for (const part of parts) track.push(part);
    return track.time > 0 ? { track, recovery } : undefined;
  };
  const slow = outcome(0), fast = outcome(plan.reward);
  if (!slow || !fast) return;
  const cycleTime = (1-p) * slow.track.time + p * fast.track.time;
  const cycleDamage = (1-p) * slow.track.damage + p * fast.track.damage;
  const at = (time:number) => {
    let value = prefix.at(time);
    if (time < prefix.time) return value;
    if (!Number.isFinite(time)) return cycleDamage > 0 ? Infinity : value;
    // 已经过 rounds 轮、成功 wins 次的所有次序，到达同一结束时刻。各分支只加窗口内的分段伤害。
    let weights = [1];
    for (let rounds=0; weights.length; rounds++) {
      const next:number[] = [];
      for (let wins=0; wins<weights.length; wins++) {
        const mass = weights[wins];
        if (!mass) continue;
        const remaining = time - (prefix.time + (rounds-wins) * slow.track.time + wins * fast.track.time);
        if (remaining < -1e-10) continue;
        const age = Math.max(0, remaining);
        value += mass * ((1-p) * slow.track.at(age) + p * fast.track.at(age));
        if (age >= slow.track.time - 1e-10) next[wins] = (next[wins] ?? 0) + mass * (1-p);
        if (age >= fast.track.time - 1e-10) next[wins+1] = (next[wins+1] ?? 0) + mass * p;
      }
      weights = next;
    }
    return value;
  };
  let sampled: ReturnType<typeof sampledRenewalCurve> | undefined;
  const representative = () => sampled ??= sampledRenewalCurve(plan);
  return { at, cycle:{ spRecoverSec:(1-p)*slow.recovery+p*fast.recovery, skillDurationSec:plan.skillDuration,
    avgDps:cycleDamage/cycleTime }, notes:[swiftNote], finishNotes:()=>sampled?.finishNotes(),
    killTime:hp=>Number.isFinite(hp) ? representative().killTime(hp) : Infinity,
    castsUntil: slow.track.casts.length || fast.track.casts.length || prefix.casts.length ? t=>representative().castsUntil?.(t) ?? [] : undefined,
    endsUntil: slow.track.ends.length || fast.track.ends.length || prefix.ends.length ? t=>representative().endsUntil?.(t) ?? [] : undefined };
}

export function renewalCurve(plan:RenewalPlan):ReturnType<typeof sampledRenewalCurve> {
  return (expectedRenewals && staticRenewalCurve(plan)) || sampledRenewalCurve(plan);
}

function sampledRenewalCurve(plan: RenewalPlan) {
  const { prefix, cost, probability: p, reward, wait, segments, skillDuration } = plan;
  const capacity = cost * Math.max(1, plan.maxCharges);
  const track = new Track();
  for (const s of prefix) track.push(s);
  const prefixLength = elapsed(prefix);
  let stock = Math.min(Math.max(0, capacity - cost), Math.max(0, plan.stock));
  let count = plan.counter?.initial ?? 0;
  let draw = plan.drawOffset ?? 0;
  let cycles = 0, recoverySum = 0, lengthSum = 0, damageSum = 0, blocked = !Number.isFinite(prefixLength);
  const battleTime = (cursor: number) => plan.toBattleTime ? plan.toBattleTime(cursor, cycles, recoverySum) : cursor;
  const notes = [swiftNote];
  type Outcome = { count: number; stock: number; weight: number; parts: Segment[]; length: number; recovery: number; freeSkills?: FreeSkills };
  // 缓存的是候选分支（含各自权重），每次施放仍按固定判定序列重新抽取，不复用上一次抽中的结果。
  const cache = new Map<string, Outcome[]>();
  const outcomes = (recovery: number, paid: number, time: number, stable: boolean): Outcome[] => {
    const list = plan.counter?.afterCharge(count, recovery, paid, stable ? Infinity : time)
      ?? [{ count: 0, stock: paid, weight: 1, parts: segments(recovery, stable ? Infinity : time) }];
    return list.map(o => ({ ...o, length: elapsed(o.parts), recovery }));
  };
  const candidates = (recovery: number, paid: number, time: number, stable: boolean): Outcome[] => {
    const list = outcomes(recovery, paid, time, stable);
    // 零时长技能被回技立即续开时，不能在同一时刻无限连发。
    return list.map((o, i) => {
      const lock = plan.minCycle ?? (o.length <= 1e-9 ? 1 : 0);
      if (!(recovery <= 1e-9 && o.length < lock - 1e-9 && Number.isFinite(o.length))) return o;
      if (!notes.includes(swiftLockNote)) notes.push(swiftLockNote);
      return outcomes(recovery + lock - o.length, paid, time, stable)[i] ?? o;
    });
  };
  const step = () => {
    const time = track.time;
    const gain = reward > 0 && swiftRefundSucceeds(draw++, p, battleTime(time)) ? reward : 0;
    const sp = Math.min(capacity, stock + gain);
    const recovery = wait(Math.max(0, cost - sp));
    const paid = stockAfterCast(sp, cost, plan.maxCharges, plan.discreteSp, plan.overcharge);
    const stable = time >= (plan.stableAfter ?? 0);
    const key = `${count}/${paid}/${recovery}`;
    let list = stable ? cache.get(key) : undefined;
    if (!list) {
      list = candidates(recovery, paid, time, stable);
      if (stable) cache.set(key, list);
    }
    // 计数分支本身带权重时同样按固定判定序列抽取（第二条序列）。
    let next = list[0]!;
    if (list.length > 1) {
      let u = swiftDraw(cycles, 1) * list.reduce((n, o) => n + o.weight, 0);
      for (const o of list) { next = o; u -= o.weight; if (u < 0) break; }
    }
    const before = track.damage;
    for (const part of next.parts) track.push(part);
    stock = next.stock; count = next.count; cycles++;
    // 免费演奏发生在本轮付费技能之前。预留本次消耗后，库存最多再留 capacity − cost。
    const free = next.freeSkills;
    if (free) {
      for (let i = 0; i < free.count && reward > 0 && stock < capacity - cost; i++) {
        const end = time + free.firstEnd + i * free.interval;
        if (swiftRefundSucceeds(draw + i, p, battleTime(end))) stock = Math.min(capacity - cost, stock + reward);
      }
      draw += free.count;
    }
    if (!Number.isFinite(next.length) || !Number.isFinite(track.time)) { blocked = true; return; }
    recoverySum += next.recovery; lengthSum += next.length; damageSum += track.damage - before;
  };
  const ensure = (t: number) => { while (!blocked && cycles < maxCycles && track.time <= t) step(); };
  const average = () => lengthSum > 0 ? damageSum / lengthSum : track.parts.at(-1)?.dps ?? 0;
  let truncated = false;
  const at = (t: number) => {
    ensure(t);
    if (!blocked && t > track.time) { truncated = true; return track.damage + (t - track.time) * average(); }
    return track.at(t);
  };
  ensure(Math.max(180, prefixLength));
  const cycle = { spRecoverSec: cycles ? recoverySum / cycles : 0,
    skillDurationSec: plan.counter && cycles ? (lengthSum - recoverySum) / cycles : skillDuration, avgDps: average() };
  const killTime = (hp: number) => {
    if (!Number.isFinite(hp)) return Infinity;
    while (!blocked && cycles < maxCycles && track.damage < hp) step();
    if (track.damage >= hp || blocked) return integrate(track.parts, [], Infinity, hp).killTimeSec;
    truncated = true;
    const rate = average();
    return rate > 0 ? track.time + (hp - track.damage) / rate : Infinity;
  };
  // 分段未标记开技事件时不提供开技时刻（缺省而不是“从不开技”）。
  const castsUntil = track.casts.length ? (t: number) => { ensure(t); return track.casts.filter(c => c <= t + 1e-9); } : undefined;
  const endsUntil = track.ends.length ? (t: number) => { ensure(t); return track.ends.filter(c => c <= t + 1e-9); } : undefined;
  return { at, cycle, notes, killTime, castsUntil, endsUntil, finishNotes: () => {
    if (truncated && !notes.some(n => n.includes('超过20000次'))) notes.push('近似：技能循环超过20000次后，剩余时间按已模拟周期的平均秒伤延续。');
  } };
}
export function swiftRenewal(plan: RenewalPlan, duration: number, hp: number): TimelineResult {
  const curve = renewalCurve(plan);
  const totalDamage = curve.at(duration);
  const killTimeSec = curve.killTime(hp);
  curve.finishNotes();
  return { totalDamage, killTimeSec, cycle: curve.cycle, notes: curve.notes, caveats: [], castsUntil: curve.castsUntil, endsUntil: curve.endsUntil };
}
