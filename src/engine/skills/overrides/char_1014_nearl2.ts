import { operatorRotation } from './batches/phase-07-09.ts';
import type { SkillOverride } from './index.ts';
import { phase } from './shared.ts';
import { timeline } from '../../timeline.ts';
// 攻击无视防御与精准独立叠乘；耀阳落下造成独立的开技真伤。
const rotation = operatorRotation('physical', ({ ctx, effects, slot, skill: s, trait, talent, blocked }) => {
  const scale = blocked ? trait.atk_scale ?? 1 : 1;
  const e = { ...effects, defPenetrationPct: 1 - (1 - effects.defPenetrationPct) * (1 - talent(1).def_penetrate) };
  const assumptions = ['默认 Boss 被临光阻挡；部署天赋默认与 Boss 相邻并命中一次，未提供前一名部署干员，额外第二击不计。'];
  const idle = { body: slot === 2 ? { type: 'none' as const } : { scale } };
  if (slot === 2) return { effects: e, idle, active: { body: { scale, atk: s.atk } }, lifecycle: 'on_deploy', duration: ctx.level.duration,
    leavesAt: ctx.level.duration, assumptions: [...assumptions, '技能结束立即撤退，本场只部署一次。'] };
  return { effects: e, idle, active: { body: { type: slot === 3 && blocked ? 'true' : 'physical', scale, atk: s.atk, speed: s.attack_speed },
    extra: slot === 3 ? [{ label: '耀阳落下', cast: true, strike: { type: 'true', scale: s.value } }] : [] }, assumptions };
});

export const override: SkillOverride = (ctx, generic) => {
  const model = rotation(ctx, generic);
  const e = model.battle!;
  const deploySkill = ctx.level.spType === 'PASSIVE';
  const light = phase(ctx, { ...e, extraHits: [], judgment: undefined, kazimierz: undefined, atkProc: undefined, splash: undefined },
    { type: 'true', active: deploySkill, scale: ctx.tier.talents[0]!.blackboard.nums.atk_scale,
      modifiers: deploySkill ? [{ stat: 'atk', bucket: 'pct', value: ctx.level.blackboard.nums.atk, source: 'skill:' + ctx.skill.skillId }] : [] });
  const hit = light.components[0]!.perHit;
  const component = { ...light.components[0]!, source: 'deployment:nearl2', label: '破晓部署真伤', dps: 0, hitsPerSec: 0 };
  const display = deploySkill ? model.skill! : model.normal;
  display.components.push(component);
  return { ...model, customTimeline: (duration, hp) => {
    const result = timeline(model, ctx.level, duration, Math.max(0, hp - hit));
    const raw = result.at ?? ((t: number) => timeline(model, ctx.level, t, Infinity).totalDamage);
    return { ...result, totalDamage: hit + result.totalDamage, killTimeSec: hp <= hit ? 0 : result.killTimeSec, at: t => hit + raw(t) };
  } };
};
