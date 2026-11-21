import { firstCrossing, swiftLockNote, swiftNote, swiftRefundSucceeds } from '../../swift.ts';
import { swiftCycles } from './swift.ts';
import type { SkillOverride } from './index.ts';
import { battleEffects } from '../../effects/common.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { integrate, type Segment } from '../../timeline.ts';
import { overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/引星棘刺：炼金单元独立存在、可叠加；S3减益取最高，区域只计算一次。
export const thorn2Override: SkillOverride = (context, generic) => {
  const { tier, skill, level, boss } = context;
  const model = overrideBase(generic);
  const e = generic.battle ?? battleEffects();
  const clock = new ShredClock(e);
  const bb = level.blackboard.nums;
  const talent = tier.talents[0]!.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1'), s3 = skill.skillId.endsWith('_3');
  const modifiers = [{ stat: 'atk' as const, bucket: 'pct' as const, value: talent.atk!, source: 'talent:thorn2:1' },
    { stat: 'attackSpeed' as const, bucket: 'direct' as const, value: tier.talents[1]!.blackboard.nums.attack_speed_ally!, source: 'talent:thorn2:2' }];
  const lifetime = bb.projectile_delay_time! + talent.projectile_extend!;
  const unitRate = tier.talents.find(t => t.blackboard.nums.sp_recovery_per_sec !== undefined)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  const at = (ages: number[]) => {
    const stacks = ages.map(age => s3 ? Math.min(bb.max_stack_cnt!, Math.floor((age + 1e-9) / bb.interval!)) : 0);
    const oldest = stacks.length ? Math.max(...stacks) : 0;
    const defReduction = s3 && ages.length ? -(bb.def! + oldest * bb.def_per_interval!) : 0;
    const resReduction = s3 && ages.length ? -(bb.magic_resistance! + oldest * bb.magic_resistance_per_interval!) : 0;
    const p = phase(context, { ...e, defReductionFixed: e.defReductionFixed + Math.max(0, (boss.attributes?.def ?? 0) - e.defReductionFixed) * defReduction },
      { ownerActions: 1, type: 'physical', modifiers, resReductionPct: resReduction, damageEvents:clock.count });
    if (!s1) for (const count of stacks) {
      // 持续伤害不属于普攻事件，不重复触发逐击装备、也不继承普攻倍率。
      const dot = phase(context, { ...e, extraHits: [], attackScale: 1 }, { active: true, type: 'arts', modifiers,
        fixedInterval: 1, scale: bb.atk_scale! + (s3 ? count * bb.atk_scale_per_interval! : 0), resReductionPct: resReduction, damageEvents:clock.count });
      dot.components[0]!.label = s3 ? '炼金区域' : '炼金单元';
      p.components.push(...dot.components);
    }
    p.dps = p.components.reduce((sum, c) => sum + c.dps, 0);
    return p;
  };
  model.normal = at([]);
  model.skill = at([0]);
  // 技能期面板为单次炼金单元生命周期内的平均值；时间过程仍保留S3每秒成长。
  if (s3) {
    const samples = Array.from({ length: Math.ceil(lifetime) }, (_, i) => ({ p: at([i]), weight: Math.min(1, lifetime - i) / lifetime }));
    model.skill.components = model.skill.components.map((c, i) => ({ ...c,
      perHit: samples.reduce((sum, s) => sum + s.p.components[i]!.perHit * s.weight, 0),
      dps: samples.reduce((sum, s) => sum + s.p.components[i]!.dps * s.weight, 0) }));
    model.skill.dps = model.skill.components.reduce((sum, c) => sum + c.dps, 0);
  }
  model.lifecycle = level.maxChargeTime > 1 ? 'charge' : 'instant';
  model.duration = lifetime;
  model.burst = false;
  model.passive = false;
  model.notes.push('近似：假设阻挡队友位于攻击范围内，心相延长炼金单元生效；S3投掷区域覆盖Boss，仅计一个区域，未凭目标数倍乘伤害。',
    '近似：瞬发投掷忽略动画技力锁定；单元存在期间继续普攻和回复技力，模组+0.1/秒只在至少一个单元存在时生效。',
    '近似：地图缺少连续6格道路信息，视界只取基础+5攻速；S3每秒成长按投掷后第1秒起增加。');
  if (e.timedStats.length || e.skillStats.length) model.notes.push('近似：炼金单元按部署时外部属性缓存，技能限定属性只作用于投掷快照；未重建限时属性到期。');
  model.caveats.push('炼金师普攻为物理；S1只治疗/加防不额外扣血；S2落点取Boss地块，扩圈快于移动，静止Boss持续在圈内。休整盟约由输入层数给定。');
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const wait = (sp: number, speed: number) => sp <= 0 ? 0 : speed > 0 ? sp / speed : Infinity;
  const initial = Math.min(cost * Math.max(1, level.maxChargeTime), Math.max(0, level.initSp + e.initSp));
  const first = wait(cost - initial, rate);
  const recover = (need: number) => {
    const activeRecovery = wait(need, rate + unitRate);
    return activeRecovery <= lifetime ? activeRecovery : lifetime + wait(need - lifetime * (rate + unitRate), rate);
  };
  const period = recover(cost);
  const firstPeriod = recover(cost - (cost > 0 && initial >= cost ? initial % cost : 0));
  // shortcut: 零消耗不定义无限次投掷，未来有此类输入时需明确游戏的施放动画冷却。
  if (period === 0) model.notes.push('近似：零消耗技能仅投掷一次，未虚构无限频率炼金单元。');
  const extraInitial = cost > 0 ? Math.max(0, Math.floor(initial / cost) - 1) : 0;
  const casts = [0, ...Array.from({ length: extraInitial }, () => 0)];
  const stable = Number.isFinite(period) && period > 0;
  const warmup = stable ? firstPeriod + Math.ceil(lifetime / period) * period : lifetime;
  if (stable) for (let time = firstPeriod; time < warmup + period - 1e-9; time += period) casts.push(time);
  const segments = (start: number, end: number): Segment[] => {
    const boundaries = new Set([start, end]);
    for (const cast of casts) {
      for (const t of [cast, cast + lifetime]) if (t > start && t < end) boundaries.add(t);
      if (s3) for (let k = 1; k <= bb.max_stack_cnt!; k++) {
        const t = cast + k * bb.interval!;
        if (t > start && t < end) boundaries.add(t);
      }
    }
    const times = [...boundaries].sort((a, b) => a - b);
    const parts: Segment[] = [];
    times.slice(0, -1).forEach((t, i) => {
      const midpoint = (t + times[i + 1]!) / 2;
      const ages = casts.filter(c => c <= midpoint && midpoint < c + lifetime).map(c => midpoint - c);
      clock.append(parts,times[i+1]! - t,()=>at(ages));
    });
    return parts;
  };
  const prefix: Segment[] = [];
  clock.append(prefix,first,()=>at([]));
  const initialCount = clock.count;
  prefix.push(...segments(0, warmup));
  while (stable && clock.count < clock.cap) {
    const previous = clock.count;
    prefix.push(...segments(warmup,warmup+period));
    if (previous === clock.count) break;
  }
  const repeat = stable ? segments(warmup, warmup + period) : [];
  if (!stable) clock.append(prefix,Infinity,()=>at([]));
  model.customTimeline = (duration, hp) => ({ ...integrate(prefix, repeat, duration, hp),
    cycle: { spRecoverSec: period, skillDurationSec: lifetime,
      avgDps: stable ? repeat.reduce((sum, s) => sum + s.duration * s.dps, 0) / period : model.normal.dps }, notes: [], caveats: [] });
  if (e.skillEndProbability && e.skillEndSp) {
    const segmentsForSingleUnit = (): Segment[] => {
      const plan: Segment[] = [];
      clock.reset(0);
      clock.append(plan,first,()=>at([]));
      const step = s3 ? bb.interval! : lifetime;
      for (let age = 0; age < lifetime && step > 0; age += step)
        clock.append(plan,Math.min(step, lifetime - age),()=>at([age]));
      clock.append(plan,Infinity,()=>at([]));
      return plan;
    };
    const soonest = recover(Math.max(0, cost - e.skillEndSp));
    if (!s1 && !s3 && Number.isFinite(first) && (soonest < lifetime || initial > cost)) {
      const dot = model.skill.dps - model.normal.dps;
      const maxCharges = Math.max(1, level.maxChargeTime);
      const reward = e.skillEndSp;
      // E[同时存在的单元数] = N(t) - N(t-L)，N 为累计投掷次数的期望。
      // 对时间积分只需最近 L 秒的 N；无须保留所有炼金单元的年龄组合。
      // 迅捷：每次投掷（瞬发技能结束）按固定判定序列判定一次回技；回技足以续开时两次投掷至少间隔一个攻击间隔（模型假设）。
      const lock = model.normal.stats.attackInterval;
      const plan = (until: number) => {
        const times: number[] = [];
        // 首投发生在库存攒到一次消耗之后：此时库存为 max(初始, 消耗)，不再欠首轮技力。
        let sp = Math.max(initial, cost), time = 0, k = 0;
        while (time <= until && times.length < 20000) {
          sp -= cost; times.push(time);
          if (swiftRefundSucceeds(k++, e.skillEndProbability, first + time)) sp = Math.min(maxCharges * cost, sp + reward);
          if (sp >= cost - 1e-9) time += lock;
          else { time += recover(cost - sp); sp = cost; }
        }
        return times;
      };
      const damageAt = (t: number) => {
        if (t <= 0) return 0;
        casts.length = 0;
        casts.push(...(t > first ? plan(t - first) : []));
        clock.reset(0);
        const parts: Segment[] = [];
        clock.append(parts, Math.min(first, t), () => at([]));
        if (t > first) parts.push(...segments(0, t - first));
        return integrate(parts, [], t, Infinity).totalDamage;
      };
      model.customTimeline = (duration, hp) => {
        const thrown = plan(duration - first);
        const gaps = thrown.slice(1).map((t, i) => t - thrown[i]!);
        const meanInterval = gaps.length ? gaps.reduce((n, g) => n + g, 0) / gaps.length : period;
        const cycle = { spRecoverSec: meanInterval, skillDurationSec: lifetime, avgDps: model.normal.dps + dot * lifetime / meanInterval };
        const totalDamage = damageAt(duration);
        const killTimeSec = firstCrossing(damageAt, hp, cycle.avgDps > 0 ? hp / cycle.avgDps : duration);
        return { totalDamage, killTimeSec, cycle, notes: [swiftNote, swiftLockNote], caveats: [],
          castsUntil: (t: number) => plan(t - first).map(offset => first + offset) };
      };
    } else if (s1 || soonest >= lifetime && initial <= cost) {
      // 单元从投掷时开始造成伤害，回复与单元寿命并行。无重叠时仅需最近一次投掷。
      const ageSegments = (seconds: number) => {
        const plan: Segment[] = [];
        if (s1) { clock.append(plan,seconds,()=>at([])); return plan; }
        const points = [0, Math.min(seconds, lifetime)];
        if (s3) for (let k = 1; k <= bb.max_stack_cnt! && k * bb.interval! < points[1]!; k++) points.push(k * bb.interval!);
        points.sort((a,b) => a-b);
        points.slice(1).forEach((end,i)=>clock.append(plan,end-points[i]!,()=>at([points[i]!])));
        if (seconds > lifetime) clock.append(plan,seconds-lifetime,()=>at([]));
        return plan;
      };
      clock.reset(0);
      const opening: Segment[] = [];
      clock.append(opening,first,()=>at([]));
      swiftCycles(model, level, cost, initial, opening, recover, ageSegments, 0, clock, initialCount);
    } else if (s3) model.notes.push('近似：S3重叠时减防、减抗取最老单元，须联合计算各单元年龄与库存；重叠配置暂未计迅捷。');
  }
  return model;
};
