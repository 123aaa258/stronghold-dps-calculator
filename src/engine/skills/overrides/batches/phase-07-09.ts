import { defineRotation } from '../rotation.ts';
import { isBlocked, phase, type PhaseOptions } from '../shared.ts';
import type { OverrideContext } from '../index.ts';
import { battleEffects, type BattleEffects } from '../../../effects/common.ts';
import tokens from '../../../../data/generated/tokens.json' with { type: 'json' };
import { resolveTokenTier } from '../../../operator-state.ts';
import { swiftRefundSucceeds } from '../../../swift.ts';
import type { TokenData } from '../../../types.ts';
import type { DamageType, PhaseResult, SkillLifecycle } from '../../../types.ts';

type Clock = OverrideContext & { elapsed: number; damageEvents: number };
type Strike = PhaseOptions & { atk?: number; speed?: number; delay?: number };
interface Entry {
  /** 本体动作与附伤分开，以免召唤物和技能附伤重复触发逐击装备。 */
  body?: Strike;
  extra?: { label: string; strike: Strike; token?: Clock['tier']['attributes']; cast?: boolean;
    defPenetrationFixed?: number; subtractScale?: number; floorRatio?: number }[];
  effects?: BattleEffects;
}
interface Decision {
  idle?: Entry;
  active?: Entry;
  lifecycle?: SkillLifecycle;
  duration?: number;
  ammo?: number;
  repeatDuration?: number;
  burst?: boolean;
  leavesAt?: number;
  effects?: BattleEffects;
  breakpoints?: number[];
  assumptions?: string[];
}
interface Mechanic {
  ctx: Clock;
  effects: BattleEffects;
  slot: number;
  skill: Record<string, number>;
  trait: Record<string, number>;
  talent: (index: number) => Record<string, number>;
  blocked: boolean;
}

/** 技能槽、黑板和召唤物面板来自当前阶级及其模组、潜能状态。 */
export function operatorRotation(type: DamageType, decide: (mechanic: Mechanic) => Decision) {
  return defineRotation((ctx, base) => {
    const effects = base.battle ?? battleEffects();
    const plan = decide({ ctx, effects, slot: ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1,
      skill: ctx.level.blackboard.nums, trait: ctx.tier.trait?.blackboard.nums ?? {},
      talent: i => ctx.tier.talents.find(t => t.index === i)?.blackboard.nums ?? {}, blocked: isBlocked(ctx.boss) });
    const external = plan.effects ?? effects;
    function stage(entry: Entry = {}, active: boolean): PhaseResult {
      const body = entry.body ?? {};
      const strike = (opts: Strike, effect: BattleEffects, attributes = ctx.tier.attributes) => {
        const source = active ? `skill:${ctx.skill.skillId}` : `talent:${ctx.operator.charId}`;
        return phase({ ...ctx, tier: { ...ctx.tier, attributes } }, effect, {
          active, type, elapsed: ctx.elapsed, damageEvents: ctx.damageEvents, ...opts,
          interval: opts.interval ?? attributes.baseAttackTime + (opts.delay ?? 0),
          modifiers: [...opts.modifiers ?? [],
            ...(opts.atk ? [{ stat: 'atk' as const, bucket: 'pct' as const, value: opts.atk, source }] : []),
            ...(opts.speed ? [{ stat: 'attackSpeed' as const, bucket: 'direct' as const, value: opts.speed, source }] : [])],
        });
      };
      const stageEffects = entry.effects ?? external;
      const result = strike({ ownerActions: body.type === 'none' ? 0 : 1, ...body }, stageEffects);
      for (const { label, strike: extra, token, cast, defPenetrationFixed, subtractScale, floorRatio } of entry.extra ?? []) {
        const separate = { ...stageEffects, judgment: undefined, kazimierz: undefined, extraHits: [],
          splash: undefined, dots: [], atkProc: undefined };
        if (token) Object.assign(separate, { stats: external.stats.filter(s => s.source.includes('lethaniaShip')),
          skillStats: [], timedStats: [], weakness: undefined, attackScale: 1,
          modifiers: external.modifiers.filter(m => m.kind === 'fragile'),
          defPenetrationPct: 0, resPenetrationPct: 0, defPenetrationFixed: defPenetrationFixed ?? 0, resPenetrationFixed: 0 });
        const opts = { ...(token ? {} : { atk: body.atk, speed: body.speed, delay: body.delay, modifiers: body.modifiers }), ...extra };
        const p = strike(opts, separate, token);
        const c = { ...p.components[0]!, label, source: `${cast ? 'cast' : token ? 'token' : 'talent'}:${ctx.operator.charId}:${label}` };
        if (subtractScale !== undefined) c.perHit -= strike({ ...opts, scale: subtractScale }, separate, token).components[0]!.perHit;
        if (floorRatio !== undefined) c.perHit = Math.max(c.perHit, p.stats.atk * floorRatio);
        c.dps = c.perHit * c.hitsPerSec;
        if (cast) { c.dps = 0; c.hitsPerSec = 0; }
        result.components.push(c);
        result.dps += c.dps;
      }
      return result;
    }
    const lifecycle = plan.lifecycle ?? base.lifecycle;
    const passive = lifecycle === 'permanent' && ctx.level.spType === 'PASSIVE';
    const skill = stage(plan.active, true);
    const duration = plan.duration ?? (plan.ammo !== undefined ? plan.ammo * skill.stats.attackInterval
      : lifecycle === 'permanent' ? Infinity : lifecycle === 'instant' ? plan.burst ? 0 : skill.stats.attackInterval : base.duration);
    return { normal: passive ? skill : stage(plan.idle, false), skill: passive ? null : skill, lifecycle,
      duration, repeatDuration: plan.repeatDuration, burst: plan.burst ?? false, burstAttack: plan.burst && skill.components[0]!.damageType !== 'none',
      passive, leavesAt: plan.leavesAt, battle: external, breakpoints: plan.breakpoints, assumptions: plan.assumptions ?? [] };
  });
}

/** 敌人的重量在原始属性来源中保留，关卡覆盖项在后。 */
export function mass(ctx: OverrideContext): number | undefined {
  return ctx.boss.attributeSource.flatMap(s => {
    const value = s.match(/"massLevel":([\d.]+)/);
    return value ? [Number(value[1])] : [];
  }).at(-1);
}

export function companion(ctx: OverrideContext, id: keyof typeof tokens) {
  return resolveTokenTier(tokens[id] as TokenData, ctx.operator, ctx.tier)!;
}

/** 定时技能的开技时刻，用于跨轮或轮内的专属状态。共享迅捷序列与技力修正。 */
export function castClock(ctx: Clock, effects: BattleEffects, lockout = 0) {
  const cost = Math.max(effects.spCostMin, ctx.level.spCost * effects.spCostScale);
  const rate = ctx.level.increment + effects.spRecovery;
  const starts: number[] = [];
  let time = Math.max(0, cost - ctx.level.initSp - effects.initSp) / rate;
  for (let i = 0; time <= Math.max(180, ctx.elapsed) && i < 1000; i++) {
    starts.push(time);
    const end = time + Math.max(0, ctx.level.duration);
    const refund = effects.skillEndSp > 0 && swiftRefundSucceeds(i, effects.skillEndProbability, end) ? effects.skillEndSp : 0;
    time += Math.max(.1, Math.max(0, ctx.level.duration) + lockout + Math.max(0, cost - refund) / rate);
  }
  const count = starts.filter(t => t <= ctx.elapsed + 1e-8).length;
  return { starts, count, age: ctx.elapsed - (starts[count - 1] ?? Infinity) };
}

export function amplify(e: BattleEffects, source: string, value: number, fragile = false, artsOnly = false): BattleEffects {
  return { ...e, modifiers: [...e.modifiers, { source, kind: fragile ? 'fragile' : 'increase',
    group: fragile ? artsOnly ? '法术脆弱' : '脆弱' : source, value, types: artsOnly ? ['arts'] : undefined }] };
}
