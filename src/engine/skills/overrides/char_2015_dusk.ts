import { firstCrossing, renewalCurve, swiftRefundSucceeds } from '../../swift.ts';
import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import tokens from '../../../data/generated/tokens.json' with { type: 'json' };
import type { SkillOverride } from './index.ts';
import type { PhaseResult, TokenData } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { resolveTokenTier } from '../../operator-state.ts';
import { integrate, type Segment } from '../../timeline.ts';
import { overrideBase, phase } from './shared.ts';

type DuskSegment = Segment & { low: number; active?: boolean; summoned?: boolean };
// https://prts.wiki/w/夕 ：化境需击杀；S2仅自身对半血目标增伤；S3间隔乘1.4，同格刷新而非叠召唤。
// https://prts.wiki/w/“小自在” ：法术攻击；属性、间隔、持续时间读取提取的token数据。
export const duskOverride: SkillOverride = (context, generic) => {
  const { tier, skill, level } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const bb = level.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1');
  const s2 = skill.skillId.endsWith('_2');
  const s3 = skill.skillId.endsWith('_3');
  const source = `skill:${skill.skillId}`;
  const modifiers = [{ stat: 'atk' as const, bucket: 'pct' as const, value: bb.atk ?? 0, source },
    { stat: 'attackSpeed' as const, bucket: 'direct' as const, value: bb.attack_speed ?? 0, source },
    { stat: 'attackInterval' as const, bucket: 'pct' as const, value: s3 ? bb.base_attack_time! : 0, source }];
  const body = (active: boolean, low: boolean, damageEvents: number) => phase(context, low ? { ...e,
    modifiers: [...e.modifiers, { group: 'dusk-s2', kind: 'increase', types: ['arts'], value: s2 ? bb.damage_scale! - 1 : 0, source }] } : e,
    {ownerActions: 1, active, modifiers: active ? modifiers : [], scale: active ? bb.atk_scale ?? 1 : 1, damageEvents});
  model.normal = body(false, false, 0);
  const active = body(true, false, 0), low = body(true, true, 0);
  const token = resolveTokenTier(tokens.token_10015_dusk_drgn as TokenData, context.operator, tier)!;
  // 召唤物不继承夕的攻击、装备附加击或穿透；仅共享施加于Boss的减抗/伤害修饰。
  const tokenEffects = { ...battleEffects(), resReductionFixed: e.resReductionFixed, resShred: e.resShred, modifiers: e.modifiers.filter(m => m.kind === 'fragile') };
  const summoned = (damageEvents: number) => phase({ ...context, tier: { ...tier, attributes: token.attributes } }, tokenEffects, { damageEvents });
  const summon = summoned(0);
  const component = summon.components[0]!;
  component.label = '小自在法术攻击（存在时）';
  component.source = 'token:token_10015_dusk_drgn';
  const tokenDps = summon.dps;
  const life = token.talents![0]!.blackboard.nums.duration;
  // https://prts.wiki/w/卫戍协议#干员 仅明确棋子自身属性。小自在按独立面板攻击。
  if ((context.cultivation ?? 1) > 1) model.notes.push('近似：小自在使用独立攻击面板，自身练度映射只作用于夕；本季召唤物是否也获得练度加成尚缺实测。参照 https://prts.wiki/w/卫戍协议#干员');
  const addToken = (p: PhaseResult): PhaseResult => ({ ...p, components: [...p.components, component], dps: p.dps + tokenDps });
  // 非技能面板列出首次召唤物存在时的分项；时间过程仍只计真实存在窗口。
  model.normal = addToken(model.normal);
  model.skill = s3 ? addToken(active) : active;
  model.lifecycle = s1 ? 'charge' : 'timed';
  model.duration = s1 ? active.stats.attackInterval : level.duration;
  model.burst = false;
  model.passive = false;
  model.caveats.push('夕：单Boss击杀前化境为0层；炎/奥术休整期获取层数由输入提供。范围扩大和额外溅射不增加单Boss命中数。');
  model.notes.push('近似：假设Boss所在格可部署且小自在可攻击Boss；首次攻击按一个完整攻击间隔末端召唤。小自在不受击，S3每次只刷新同格一只，忽略前摇/弹道；召唤物不继承干员专属装备/盟约属性。');
  if (e.timedStats.length) model.notes.push('近似：限时外部属性按部署值计算，未在到期时重建伤害阶段');
  if (s2) model.caveats.push('S2技能期/循环DPS展示Boss半血以上；时间过程和击杀用时在半血处切换自身法伤增幅，小自在不继承该增幅。');
  model.caveats.push('非技能期面板含首次小自在存在时的伤害分项；25秒后消失，时间过程不永久保留。S3技能面板含小自在存在时伤害。');
  const normal = model.normal.dps - tokenDps;
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? sp / rate : Infinity;
  const stored = Math.min(cost * Math.max(1, level.maxChargeTime), Math.max(0, level.initSp + e.initSp));
  const recovery = wait(cost);
  const first = wait(cost - stored);
  const skillSegment: DuskSegment = { duration: model.duration, dps: active.dps, low: low.dps, active: true };
  const normalSegment = (duration: number): DuskSegment => ({ duration, dps: normal, low: normal });
  let prefix: DuskSegment[] = [normalSegment(first), skillSegment];
  const repeatBase: DuskSegment[] = [normalSegment(recovery), skillSegment];
  if (s1 && stored >= cost && cost > 0) {
    prefix = Array.from({ length: Math.floor(stored / cost) }, () => skillSegment);
    prefix.push(normalSegment(wait(cost - stored % cost)), skillSegment);
  }
  const firstAttack = first >= model.normal.stats.attackInterval ? model.normal.stats.attackInterval : first + active.stats.attackInterval;
  const initialEnd = firstAttack + life;
  const sumDuration = (segments: Segment[]) => segments.reduce((sum, segment) => sum + segment.duration, 0);
  // 将首次召唤的有限窗口留在前缀中，后续重复周期不再触发点睛。
  while (sumDuration(prefix) < initialEnd && recovery + model.duration > 0) prefix.push(...repeatBase);
  const windows: [number, number][] = [[firstAttack, initialEnd]];
  let repeatWindows: [number, number][] = [];
  if (s3) {
    const interval = active.stats.attackInterval;
    const lastAttack = Math.floor(model.duration / interval) * interval;
    if (lastAttack > 0) {
      // 当攻速足够低使攻击间隔大于寿命时，各次召唤之间保留空档。
      for (let at = interval; at <= model.duration + 1e-9; at += interval) windows.push([first + at, first + at + life]);
      repeatWindows = [[0, Math.max(0, lastAttack + life - model.duration)]];
      for (let at = interval; at <= model.duration + 1e-9; at += interval) repeatWindows.push([recovery + at, recovery + at + life]);
    }
  }
  const overlay = (segments: DuskSegment[], ranges: [number, number][]) => {
    const result: DuskSegment[] = [];
    let time = 0;
    for (const segment of segments) {
      const end = time + segment.duration;
      const points = [...new Set([time, end, ...ranges.flat().filter(t => t > time && t < end)])].sort((a, b) => a - b);
      for (let i = 1; i < points.length; i++) {
        const start = points[i - 1]!;
        const bonus = ranges.some(([a, b]) => start >= a && start < b) ? tokenDps : 0;
        result.push({ duration: points[i]! - start, dps: segment.dps + bonus, low: segment.low + bonus, active: segment.active, summoned: bonus > 0 });
      }
      time = end;
    }
    return result;
  };
  prefix = overlay(prefix, windows);
  let repeat = overlay(repeatBase, repeatWindows);
  if (e.resShred) {
    const cap = Math.ceil(e.resShred.max / e.resShred.perHit);
    let count = 0, ownerProgress = 0, tokenProgress = 0;
    const advance = (stages: DuskSegment[]) => {
      const result: DuskSegment[] = [];
      for (const stage of stages) {
        if (!stage.summoned) tokenProgress = 0;
        let left = stage.duration;
        while (left > 1e-9) {
          const high = body(!!stage.active, false, count), token = stage.summoned ? summoned(count) : undefined;
          const low = stage.active && s2 ? body(true, true, count) : high;
          const ownerHit = (1 - ownerProgress) * high.stats.attackInterval;
          const tokenHit = token ? (1 - tokenProgress) * token.stats.attackInterval : Infinity;
          const duration = count >= cap ? left : Math.min(left, ownerHit, tokenHit);
          result.push({duration, dps: high.dps + (token?.dps ?? 0), low: low.dps + (token?.dps ?? 0)});
          if (count >= cap) break;
          ownerProgress += duration / high.stats.attackInterval;
          if (token) tokenProgress += duration / token.stats.attackInterval;
          if (duration >= ownerHit - 1e-9) { count += high.components.reduce((sum, hit) => sum + hit.hitsPerAttack, 0); ownerProgress = 0; }
          if (duration >= tokenHit - 1e-9) { count++; tokenProgress = 0; }
          count = Math.min(cap, count);
          left -= duration;
        }
      }
      return result;
    };
    prefix = advance(prefix);
    while (count < cap) {
      const previous=count;
      prefix.push(...advance(repeat));
      if (count===previous) break;
    }
    repeat = advance(repeat);
  }
  const period = sumDuration(repeat);
  // 从任意时点切出余下前缀，完整重复周期直接取模，避免大HP逐轮循环。
  const after = (segments: Segment[], seconds: number): Segment[] => {
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]!;
      if (seconds < segment.duration) return [{ ...segment, duration: segment.duration - seconds }, ...segments.slice(i + 1)];
      seconds -= segment.duration;
    }
    return [];
  };
  model.customTimeline = (duration, hp) => {
    let result = integrate(prefix, repeat, duration, hp);
    if (s2) {
      const half = hp * bb.hp_ratio!;
      const crossing = integrate(prefix, repeat, 0, hp - half).killTimeSec;
      if (Number.isFinite(crossing)) {
        const lowPrefix = prefix.map(s => ({ duration: s.duration, dps: s.low }));
        const lowRepeat = repeat.map(s => ({ duration: s.duration, dps: s.low }));
        const prefixDuration = sumDuration(prefix);
        const tail = crossing < prefixDuration ? after(lowPrefix, crossing) : after(lowRepeat, (crossing - prefixDuration) % period);
        const remainder = integrate(tail, lowRepeat, Math.max(0, duration - crossing), half);
        result = { totalDamage: duration <= crossing ? result.totalDamage : hp - half + remainder.totalDamage,
          killTimeSec: crossing + remainder.killTimeSec };
      }
    }
    return { ...result, cycle: { spRecoverSec: recovery, skillDurationSec: model.duration,
      avgDps: Number.isFinite(period) ? repeat.reduce((sum, s) => sum + s.duration * s.dps, 0) / period : normal }, notes: [], caveats: [] };
  };
  if (e.resShred && e.skillEndProbability && e.skillEndSp && Number.isFinite(first)) {
    const clock=new ShredClock(e);
    let below=false;
    const stages=(seconds:number,elapsed:number,initial=false)=>{
      const ranges:[number,number][]=[];
      if (elapsed<initialEnd) ranges.push([firstAttack-elapsed,initialEnd-elapsed]);
      if (s3) {
        const interval=active.stats.attackInterval;
        const last=Math.floor(model.duration/interval)*interval;
        if (!initial && last>0) ranges.push([0,last+life-model.duration]);
        for(let time=interval;time<=model.duration+1e-9;time+=interval) ranges.push([seconds+time,seconds+time+life]);
      }
      const parts:Segment[]=[];
      for(const part of overlay([normalSegment(seconds),skillSegment],ranges)) clock.append(parts,part.duration,count=>{
        const owner=body(!!part.active,below && !!part.active,count), token=part.summoned?summoned(count):undefined;
        return token?{...owner,dps:owner.dps+token.dps,components:[...owner.components,...token.components]}:owner;
      });
      return parts;
    };
    const firstCast=stages(first,0,true);
    swiftCycles(model,level,cost,stored,firstCast,wait,stages,initialEnd,clock);
    if (s2) {
      const high=model.customTimeline!;
      below=true;clock.reset(0);
      const lowPrefix=stages(first,0,true);
      swiftCycles(model,level,cost,stored,lowPrefix,wait,stages,initialEnd,clock);
      const low=model.customTimeline!;
      model.customTimeline=(time,hp)=>{
        below=false;
        const threshold=hp*(1-bb.hp_ratio!), crossing=high(time,threshold), result=high(time,hp);
        if (!Number.isFinite(crossing.killTimeSec)) return result;
        below=true;
        const offset=low(crossing.killTimeSec,Infinity).totalDamage-threshold;
        const tail=low(time,hp+offset);
        return {...result,totalDamage:time<=crossing.killTimeSec?result.totalDamage:tail.totalDamage-offset,killTimeSec:tail.killTimeSec,
          notes:[...result.notes,'近似：迅捷与逐击减抗同时开启时，各分支维护受击层数，半血增伤在期望伤害曲线越过阈值时切换。']};
      };
    }
  } else if (s1 && e.skillEndProbability && e.skillEndSp && Number.isFinite(first)) {
    // 点睛仅触发一次，其存在窗口与后续充能无关，直接叠加到本体期望曲线。
    const curve = renewalCurve({
      prefix: [normalSegment(first), skillSegment], stock: Math.max(0, stored - cost), cost,
      maxCharges: level.maxChargeTime, probability: e.skillEndProbability, reward: e.skillEndSp,
      wait, segments: seconds => [normalSegment(seconds), skillSegment], skillDuration: model.duration,
    });
    const at = (t: number) => curve.at(t) + tokenDps * Math.max(0, Math.min(t - firstAttack, life));
    model.customTimeline = (duration, hp) => {
      const totalDamage = at(duration);
      const killTimeSec = firstCrossing(at, hp, hp / curve.cycle.avgDps);
      curve.finishNotes();
      return { totalDamage, killTimeSec, cycle: curve.cycle, notes: curve.notes, caveats: [] };
    };
  } else if (s3) {
    const firstCast = overlay([normalSegment(first), skillSegment], windows);
    swiftCycles(model, level, cost, stored, firstCast, wait, (seconds, at) => {
      const ranges: [number, number][] = [];
      if (at < initialEnd) ranges.push([firstAttack - at, initialEnd - at]);
      if (s3) {
        const interval = active.stats.attackInterval;
        const last = Math.floor(model.duration / interval) * interval;
        if (last > 0) ranges.push([0, last + life - model.duration]);
        for (let t = interval; t <= model.duration + 1e-9; t += interval) ranges.push([seconds + t, seconds + t + life]);
      }
      return overlay([normalSegment(seconds), skillSegment], ranges);
    }, first + model.duration >= initialEnd ? 0 : initialEnd);
  } else if (e.skillEndProbability && e.skillEndSp && Number.isFinite(first)) {
    const probability = e.skillEndProbability;
    const fast = wait(Math.max(0, cost - e.skillEndSp));
    const duration = model.duration;
    // 单层库存的S2每轮技能期固定；以单位技能DPS构造曲线，得到指定时刻的期望技能秒数。
    const skillTime = renewalCurve({
      prefix: [{ duration: first, dps: 0 }, { duration, dps: 1 }],
      stock: 0, cost, maxCharges: 1, probability, reward: e.skillEndSp, wait, skillDuration: duration,
      segments: seconds => [{ duration: seconds, dps: 0 }, { duration, dps: 1 }],
    });
    // 首次召唤在首轮内消失时，用累计高血量伤害当“时钟”，直接查询到半血为止的期望技能秒数。
    const damageTime = first + duration >= initialEnd && normal > 0 && active.dps > 0 ? renewalCurve({
      // 此曲线横轴是伤害。第 n 次结束的实际秒数来自开场、n+1 个技能期和已过去的回复期。
      toBattleTime: (_damage, cycles, recoverySum) => first + (cycles + 1) * duration + recoverySum,
      prefix: [0, first, first + duration, firstAttack, initialEnd].sort((a, b) => a - b).flatMap((end, i, points) => {
        if (!i || end <= points[i - 1]!) return [];
        const start = points[i - 1]!;
        const onSkill = start >= first;
        const dps = (onSkill ? active.dps : normal) + (start >= firstAttack && start < initialEnd ? tokenDps : 0);
        return [{ duration: (end - start) * dps, dps: onSkill ? 1 / dps : 0 }];
      }),
      stock: 0, cost, maxCharges: 1, probability, reward: e.skillEndSp, wait, skillDuration: duration,
      segments: seconds => [{ duration: seconds * normal, dps: 0 }, { duration: duration * active.dps, dps: 1 / active.dps }],
    }) : undefined;
    model.customTimeline = (window, hp) => {
      const threshold = hp * (1 - bb.hp_ratio!);
      const summonTime = (time: number) => Math.min(life, Math.max(0, time - firstAttack));
      const baseline = (time: number, activeSeconds: number) =>
        normal * time + (active.dps - normal) * activeSeconds + tokenDps * summonTime(time);
      // 第n轮结束后的成功次数服从二项分布；给定n和k，技能累计n×duration秒，
      // 前序普攻时间与首次召唤伤害也确定，半血判定无需保存判定的先后顺序。
      const before = (time: number, n: number, k: number) => {
        const start = first + n * duration + (k ? k * fast : 0) + (n > k ? (n - k) * recovery : 0);
        if (start >= time || !Number.isFinite(start)) return 0;
        const end = Math.min(start + duration, time);
        let remaining = threshold - baseline(start, n * duration);
        if (remaining <= 0) return 0;
        if (start >= initialEnd || end <= firstAttack) return Math.min(end - start, active.dps ? remaining / active.dps : Infinity);
        let cursor = start;
        for (const boundary of [firstAttack, initialEnd, end]) {
          if (remaining <= 0 || cursor >= end) break;
          const until = Math.min(boundary, end);
          if (until <= cursor) continue;
          const dps = active.dps + (cursor >= firstAttack && cursor < initialEnd ? tokenDps : 0);
          const length = Math.min(until - cursor, dps > 0 ? remaining / dps : Infinity);
          cursor += length;
          remaining -= length * dps;
          if (cursor < until) break;
        }
        return cursor >= start + duration ? duration : cursor - start;
      };
      let capped = false;
      // 迅捷按固定判定序列逐次判定：第n轮开始前的成功次数k是确定的，逐轮累加半血前的技能秒数。
      const beforeHalf = (time: number) => {
        let sum = 0, k = 0, n = 0;
        for (; n < 60000; n++) {
          const seconds = before(time, n, k);
          if (seconds <= 0) break;
          sum += seconds;
          const end = first + (n + 1) * duration + (k ? k * fast : 0) + (n > k ? (n - k) * recovery : 0);
          if (swiftRefundSucceeds(n, probability, end)) k++;
        }
        if (n === 60000) capped = true;
        return sum;
      };
      let complete: number | undefined;
      const at = (time: number) => {
        const seconds = skillTime.at(time);
        const high = baseline(time, seconds);
        if (Math.max(active.dps, normal) * time + tokenDps * summonTime(time) <= threshold || active.dps === low.dps) return high;
        // 即使始终处于较低DPS相位也已越过半血，此后不再重复积分半血前的技能期。
        const pre = Math.min(active.dps, normal) * time >= threshold ? complete ??= damageTime?.at(threshold) ?? beforeHalf(Infinity) : beforeHalf(time);
        return high + (low.dps - active.dps) * Math.max(0, seconds - pre);
      };
      const cycle = { ...skillTime.cycle, avgDps: normal + (active.dps - normal) * skillTime.cycle.avgDps };
      const totalDamage = at(window);
      const killTimeSec = firstCrossing(at, hp, cycle.avgDps > 0 ? hp / cycle.avgDps : window);
      skillTime.finishNotes();
      damageTime?.finishNotes();
      const notes = [...new Set([...skillTime.notes, ...damageTime?.notes ?? []])];
      if (capped) notes.push('近似：夕二技能半血前达到60000轮上限，忽略此后的半血前技能时间。');
      return { cycle, totalDamage, killTimeSec, notes, caveats: [] };
    };
  }
  return model;
};
