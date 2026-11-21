import { swiftLockNote, swiftNote } from '../../swift.ts';
import { swiftRecovery } from './swift.ts';
import type { DamageComponent, PhaseResult } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { advanceBurning, artsContribution, burningProfile } from '../../effects/elemental.ts';
import { arcaneOnly, overrideBase, phase } from './shared.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { SkillOverride } from './index.ts';

// https://prts.wiki/w/烛煌：S1火圈快照、不叠加且可在回技力时存在；S2地段结束即清除；S3本身不积累灼燃。
export const blazeOverride: SkillOverride = (context, generic) => {
  const { tier, skill, level, boss } = context;
  const model = overrideBase(generic);
  const e = generic.battle ?? battleEffects();
  const bb = level.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1'), s3 = skill.skillId.endsWith('_3');
  const talent = tier.talents[0]!.blackboard.nums;
  const buff = tier.talents.find(t => t.prefabKey === '10')?.blackboard.nums;
  const profile = burningProfile(boss);
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const burstSp = tier.talents.find(slot => slot.blackboard.nums.sp_recovery_per_sec)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  const reviveSp = tier.talents.find(slot => slot.blackboard.nums.ep_damage_ratio)?.blackboard.nums.sp ?? 0;
  const refund = e.skillEndProbability===1 ? e.skillEndSp : 0;
  const needAfter = Math.max(0,cost-refund);
  const zeroLoop = refund>0 && needAfter===0 && s1;
  // 回技足以立即续开零时长技能时，两次施放至少间隔一个攻击间隔（模型假设）。
  const lock = generic.normal.stats.attackInterval;
  const recovery = zeroLoop ? lock : needAfter<=0 ? 0 : rate>0 ? needAfter/rate : Infinity;
  // 迅捷：每次技能真实结束（S1 火圈放下、S2 持续结束、S3 弹药打完）按固定判定序列判定一次回技。
  const swift = e.skillEndSp > 0 && e.skillEndProbability > 0;
  const afterEnd = swiftRecovery(e, cost, rate, lock, s1);
  const need = Math.max(0, cost - level.initSp - e.initSp);
  const first = need === 0 ? 0 : rate > 0 ? need / rate : Infinity;
  const source = `skill:${skill.skillId}`;
  const effects = (burning: boolean) => ({ ...e, modifiers: [...e.modifiers,
    { group: 'blaze-module', kind: 'increase' as const, value: burning ? (tier.trait?.blackboard.nums.damage_scale ?? 1) - 1 : 0, source: 'module:blaze2' }] });
  const make = (active: boolean, burning: boolean, boosted: boolean, elapsed: number, damageEvents = 0) => phase(context, effects(burning), {
    ownerActions: 1, active, elapsed, damageEvents, resReductionFixed: burning ? profile.resistanceReduction : 0,
    modifiers: [
      { stat: 'atk', bucket: 'pct', value: (active && !s1 ? bb.atk! : 0) + (boosted ? buff?.atk ?? 0 : 0), source },
      { stat: 'attackInterval', bucket: 'direct', value: active && !s1 ? bb.base_attack_time! : 0, source },
    ],
  });
  const normal = make(false, false, false, 0);
  const initialSkill = make(!s1, false, false, first);
  const nominal = s1 ? bb.max_duration! : s3 ? bb['attack@trigger_time']! * initialSkill.stats.attackInterval : level.duration;
  const hammer = e.burning?.ratio ?? 0;
  const displayEnd = first + nominal;
  const cycleEnd = displayEnd + (s1 ? recovery : recovery + nominal);
  // S1火圈无来源，不套自身攻击倍率/模组伤害加成/附加攻击；目标减抗仍参与伤害。
  const dot = (attack: number, burning: boolean, elapsed: number, damageEvents = 0) => {
    const external = { ...arcaneOnly(effects(!s1 && burning)), stats: [], skillStats: [], timedStats: [], attackScale: 1 };
    if (s1) external.extraHits = [];
    const ctx = { ...context, tier: { ...tier, attributes: { ...tier.attributes, atk: attack } } };
    const p = phase(ctx, external, { active: true, elapsed, damageEvents, scale: bb.atk_scale!, fixedInterval: bb.interval ?? 1,
      resReductionFixed: burning ? profile.resistanceReduction : 0 });
    p.components[0]!.label = s1 ? '炙手之援火圈' : '灼烧地段';
    p.components[0]!.source = `${source}:dot`;
    return p;
  };
  const run = (duration: number, hp: number, collect = false) => {
    const clock = new ShredClock(e);
    const state = { buildup: 0, remaining: 0 };
    let time = 0, dealt = 0, total = 0, kill = hp <= 0 ? 0 : Infinity;
    let active = false, nextCast = first, skillEnd = Infinity, ringEnd = 0, snapshot = 0;
    let firstEnd: number | undefined;
    let health = 1, downUntil = 0, buffUntil = 0, ammo = 0, ends = 0;
    const casts: number[] = [];
    let skillDamage = 0, cycleDamage = 0;
    let firstDamage: number | undefined, moduleCycle: { seconds: number; damage: number } | undefined;
    const parts = new Map<string, DamageComponent>();
    const add = (amount: number, seconds: number, components: DamageComponent[]) => {
      if (time <= duration) total += seconds > 0 ? amount * Math.min(seconds, duration - time) / seconds : amount;
      if (kill === Infinity && dealt + amount >= hp && amount > 0) kill = time + seconds * (hp - dealt) / amount;
      dealt += amount;
      if (collect && time >= first && time < displayEnd) {
        skillDamage += amount;
        for (const c of components) {
          const key = `${c.source}:${c.damageType}`;
          parts.set(key, { ...c, dps: (parts.get(key)?.dps ?? 0) + (seconds ? c.dps * seconds : c.perHit) });
        }
      }
      if (collect && time >= displayEnd && time < cycleEnd) cycleDamage += amount;
    };
    const canDamage = normal.dps > 0 || initialSkill.dps > 0;
    while (time < duration || (kill === Infinity && Number.isFinite(hp) && canDamage)) {
      if (downUntil > 0 && time >= downUntil - 1e-9) {
        downUntil = 0; health = 1;
        if (reviveSp && rate > 0) nextCast = Math.max(time, nextCast - reviveSp / rate);
      }
      if (active && (time >= skillEnd - 1e-9 || (s3 && ammo <= 1e-9))) {
        firstEnd ??= time;
        active = false; skillEnd = Infinity; nextCast = time + afterEnd(ends++, time);
      }
      if (!downUntil && time >= nextCast - 1e-9) {
        if (time <= duration) casts.push(time);
        if (collect && burstSp) {
          if (firstDamage === undefined) firstDamage = dealt;
          else if (!moduleCycle && time > first) moduleCycle = { seconds: time - first, damage: dealt - firstDamage };
        }
        if (s1) {
          snapshot = make(true, state.remaining > 0, time < buffUntil, time).stats.atk;
          ringEnd = time + bb.max_duration!; nextCast = time + afterEnd(ends++, time);
        } else {
          active = true; ammo = s3 ? bb['attack@trigger_time']! : 0;
          skillEnd = s3 ? Infinity : time + level.duration; nextCast = Infinity;
        }
      }
      const p = make(active, state.remaining > 0, time < buffUntil, time, clock.count);
      if (downUntil) { p.components = []; p.dps = 0; }
      let rawRate = hammer * artsContribution(p.components);
      if (!s3 && !downUntil && (active || time < ringEnd)) {
        const d = dot(s1 ? snapshot : p.stats.atk, state.remaining > 0, time, clock.count);
        rawRate += d.components[0]!.dps * (s1 ? bb.element_multiplier! : bb.element_damage_scale!);
        if (!s1) rawRate += hammer * artsContribution(d.components);
        p.components.push(...d.components); p.dps += d.dps;
      }
      if (s3 && active && state.remaining > 0 && !downUntil) {
        const element = phase(context, { ...e, extraHits: [], atkProc: undefined }, { active: true, type: 'elemental', elapsed: time,
          scale: bb['attack@atk_scale'], interval: tier.attributes.baseAttackTime + bb.base_attack_time,
          modifiers: [{ stat:'atk', bucket:'pct', value:bb.atk + (time < buffUntil ? buff?.atk ?? 0 : 0), source }] }).components[0]!;
        element.label = '灼燃期间弹药附伤';
        p.components.push(element); p.dps += element.dps;
      }
      const loss = active ? s3 ? bb.lose_hp_scale! : bb['attack@hp_ratio']! / p.stats.attackInterval : 0;
      const expiry = Math.min(...e.timedStats.filter(x => x.until > time).map(x => x.until));
      const boost = state.remaining > 0 && rate > 0 && Number.isFinite(nextCast) && nextCast > time ? burstSp / rate : 0;
      const due = boost ? time + (nextCast - time) / (1 + boost) : nextCast;
      const boundaries = [duration > time ? duration : Infinity, collect && displayEnd > time ? displayEnd : Infinity,
        collect && cycleEnd > time ? cycleEnd : Infinity, downUntil || Infinity,
        downUntil ? Infinity : due, skillEnd, ringEnd > time ? ringEnd : Infinity,
        buffUntil > time ? buffUntil : Infinity, expiry];
      const tick = clock.step(p.components);
      let stop = Math.min(Math.min(...boundaries) - time, tick.seconds);
      if (s3 && active) stop = Math.min(stop, ammo * p.stats.attackInterval);
      if (loss > 0) stop = Math.min(stop, health / loss);
      // 没有未来事件时直接积分剩余常态，避免零回复/零输出下无限循环。
      if (!Number.isFinite(stop) && state.remaining <= 0 && rawRate * profile.buildupMultiplier <= 0) {
        const seconds = Math.max(0, duration - time, Number.isFinite(hp) && p.dps > 0 ? (hp - dealt) / p.dps : 0);
        add(p.dps * seconds, seconds, p.components); break;
      }
      const step = advanceBurning(state, profile, rawRate, Math.max(0, stop));
      tick.advance(step.seconds);
      add(p.dps * step.seconds, step.seconds, p.components);
      if (s3 && active) ammo = Math.max(0, ammo - step.seconds / p.stats.attackInterval);
      health = Math.max(0, health - loss * step.seconds);
      time += step.seconds;
      if (boost) nextCast = time >= due ? time : Math.max(time, nextCast - step.seconds * boost);
      if (step.burst) {
        // 爆发先进入锁条，熔点按爆发前攻击力计算，再赋予模组攻击buff（同帧顺序按此近似）。
        const burstPhase = phase({ ...context, tier: { ...tier, attributes: { ...tier.attributes, atk: p.stats.atk } } },
          { ...arcaneOnly(effects(true)), stats: [], skillStats: [], timedStats: [], attackScale: 1 },
          { type: 'elemental', scale: talent.ep_damage_scale, fixedInterval: 1, damageEvents:clock.count + 1 });
        const burst: DamageComponent = { label: '灼燃爆发', source: 'elemental:burning', damageType: 'elemental', perHit: step.burst,
          hitsPerAttack: 1, hitsPerSec: 0, dps: 0, countsTowardDps: true, derivation: profile.derivation };
        const talentHit = { ...burstPhase.components[0]!, label: '熔点引爆', source: 'talent:blaze2:1' };
        const packets = [burst, talentHit, ...burstPhase.components.slice(1)];
        add(packets.reduce((sum, hit) => sum + hit.perHit * hit.hitsPerAttack, 0), 0, packets);
        clock.burst(packets);
        if (active && s3) ammo += bb.ammo_recover!;
        health = Math.min(1, health + talent.hp_ratio!);
        buffUntil = time + (buff?.duration ?? 0);
      }
      if (active && health <= 1e-9) {
        // PRTS：致命自损中断技能、清buff、倒地回复到满；连续折算忽略0.3秒保护与复活动画。
        firstEnd ??= time;
        active = false; skillEnd = Infinity; buffUntil = 0; nextCast = time + afterEnd(ends++, time);
        downUntil = time + 1 / tier.talents[1]!.blackboard.nums.hp_recovery_per_sec_by_max_hp_ratio!;
      }
      if (step.seconds === 0 && !step.burst) break;
    }
    return { total, kill, firstEnd, skillDamage, cycleDamage, moduleCycle, parts, casts };
  };
  const preview = Number.isFinite(cycleEnd) ? run(cycleEnd, Infinity, true) : null;
  const actualCycle = preview?.moduleCycle;
  const active: PhaseResult = preview ? { ...initialSkill, dps: preview.skillDamage / nominal,
    components: [...preview.parts.values()].map(c => ({ ...c, dps: c.dps / nominal, hitsPerSec: c.perHit > 0 ? c.dps / nominal / c.perHit : 0 })) } : initialSkill;
  model.notes.push('近似：烛煌按连续伤害率积累灼燃、自损与消耗弹药；S2生命流失按最大生命比例折算，忽略攻击起手扣血与离散tick。',
    '近似：倒地后按第二天赋回复满血再复活，回技力按技能中断后即恢复；未模拟倒地/复活动画及其技力锁定。');
  if (!s3) model.notes.push(burstSp ? '近似：PRI-Y 按爆发前攻击力结算熔点，不加 PRI-X 攻击增益。' : '近似：熔点引爆取爆发前攻击力，随后施加模组攻击加成；同帧先后顺序未确认。');
  if (s1) model.notes.push('近似：S1假设火圈选中的最高生命干员就是阻挡Boss者且在范围内；缺少队伍位置与生命数据，实际可能选中其他人。');
  if (!s1 && !s3) model.notes.push('近似：S2按Boss脚下单个地段持续命中，忽略首次攻击前地段生成延迟；不叠加多个地段。');
  if (!boss.levelType) model.notes.push('近似：Boss身份缺失，灼燃阈值暂按领袖2000。');
  model.caveats.push(hammer ? '普通攻击与技能的有来源法伤由灼燃重锤向同一条灼燃累积，S1 无来源火圈只计技能自身损伤。' : '无外部灼燃来源时，普攻与技能三无法引起灼燃爆发。',
    'S1火圈与普攻同时结算，立即开始回技力，重复施放只刷新；S2结束/倒地立即清除地段；单Boss不倍乘额外目标。',
    '卫戍41的【炎】【维多利亚】叠层沿用阵容输入，不额外模拟战斗内爆条叠层。');
  return { ...model, normal, skill: active, duration: nominal, lifecycle: s1 ? 'instant' : s3 ? 'ammo' : 'timed', burst: false, passive: false,
    elemental: { perSec: (hammer * artsContribution(initialSkill.components) + (s3 ? 0 : dot(initialSkill.stats.atk, false, first).dps * ((s1 ? bb.element_multiplier! : bb.element_damage_scale!) + (s1 ? 0 : hammer)))) * profile.buildupMultiplier,
      note: '首次火圈/地段生效且未爆发时的灼燃积累速率；包含灼燃重锤的有来源法伤，爆发锁条期间不积累。' },
    customTimeline: (duration, hp) => {
      const swiftNotes:string[]=[];
      if (swift) swiftNotes.push(swiftNote, '近似：致命自损中断技能也按一次技能结束判定迅捷回技。');
      if (swift && s1) swiftNotes.push(swiftLockNote);
      const result = run(duration, hp);
      return { totalDamage: result.total, killTimeSec: result.kill, firstSkill: { start:first, end:s1 ? first : result.firstEnd ?? preview?.firstEnd ?? first + nominal },
        cycle: preview ? { spRecoverSec: actualCycle ? Math.max(0, actualCycle.seconds - (s1 ? 0 : nominal)) : recovery, skillDurationSec: s1 ? 0 : nominal,
          avgDps: actualCycle ? actualCycle.damage / actualCycle.seconds : preview.cycleDamage / (cycleEnd - displayEnd) } : null,
        castsUntil: (t: number) => run(t, Infinity).casts,
        notes: [...swiftNotes, actualCycle ? '近似：PRI-Y 只在灼燃爆发且未锁技时额外回技；循环取首次至再次施放。' : '近似：技能期DPS为首轮效果平均，循环DPS取首轮效果结束后的一个循环；后续灼燃相位、自损与倒地可能改变循环。'], caveats: [] };
    },
  };
};
