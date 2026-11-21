import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { swiftSucceeds } from '../../swift.ts';
import { actionDamage, isBlocked } from './shared.ts';
import { artsFraction, damage } from '../../damage.ts';
import { burningProfile } from '../../effects/elemental.ts';
import type { PhaseResult } from '../../types.ts';

export const override = actionModel(['蓄力剑使用第一份技力；明灭首轮为二连击，第二轮起为三连击。独战时只计自身和装备提供的灼燃。'], (ctx, model) => {
  const b = ctx.level.blackboard.nums, t = ctx.tier.talents[0]!.blackboard.nums;
  const s = ctx.operator.skillIds.indexOf(ctx.skill.skillId) + 1;
  const e = model.battle!, source = 'talent:vvana';
  const talentScale = ctx.boss.levelType === 'NORMAL' ? 1 : t.super_scale!;
  const effect = { ...e, modifiers: [...e.modifiers, { group:'vvana', kind:'increase' as const, types:['arts' as const],
    value:t.damage_scale_m! * talentScale, source },
    { group:'arts-fragile', kind:'fragile' as const, types:['arts' as const], value:isBlocked(ctx.boss) ? (ctx.tier.trait?.blackboard.nums.damage_scale ?? 1) - 1 : 0, source }] };
  const profile = burningProfile(ctx.boss);
  const buildup = (t.ep_damage_ratio_m ?? 0) * talentScale;
  const elementalScale = ctx.tier.trait?.blackboard.nums.ep_damage_ratio ?? 0;
  model.ownsBurning = buildup > 0 || elementalScale > 0 && Boolean(e.burning);
  const locked = new Map<PhaseResult,PhaseResult>();
  const make = (active: boolean, hits = 1, speed = 0, scale = 1) => {
    const opts = { hits, scale, interval:ctx.tier.attributes.baseAttackTime + (active ? b.base_attack_time ?? 0 : 0) };
    const panel = duelAttack(ctx, effect, active, 'arts', active ? b.atk : 0, speed, opts);
    if (model.ownsBurning) locked.set(panel,duelAttack(ctx,effect,active,'arts',active ? b.atk : 0,speed,
      {...opts,resReductionFixed:profile.resistanceReduction}));
    return panel;
  };
  const normal = make(false);
  const first = make(true, s === 2 ? 1 : 2, 0, b.atk_scale);
  const later = s === 3 ? make(true, 3) : first;
  const fast = make(true, 1, b['attack@steal_atk_speed_max']);
  const crit = (speed:number) => make(true, 2, speed, b['attack@atk_scale_twice']);
  const boosted = [crit(0), crit(b['attack@steal_atk_speed_max'] ?? 0)];
  let stolen = false, gauge = 0, unlock = 0;
  return duelClock(ctx, model, { normal, skill:first, length:k => s === 1 ? 0 : k > 1 ? b.enhance_duration ?? ctx.level.duration : ctx.level.duration,
    nextAttack:s === 1, panel:state => !state.active ? normal : s === 2 && stolen ? fast : state.cast > 1 ? later : first,
    shot:(state,p) => {
      if (state.active && s === 2 && swiftSucceeds(state.attack, b['attack@prob_twice']!, 1)) {
        p = boosted[Number(stolen)]!;
        stolen = true;
      }
      if (!model.ownsBurning) return actionDamage(p);
      const hit = p.components[0]!;
      let total = actionDamage(p) - hit.perHit * hit.hitsPerAttack;
      for (let i=0;i<hit.hitsPerAttack;i++) {
        if (state.time < unlock - 1e-9) {
          total += locked.get(p)!.components[0]!.perHit + damage({attack:p.stats.atk,scale:elementalScale,type:'elemental',
            target:ctx.boss,epDamageResistance:ctx.boss.attributes?.epDamageResistance,modifiers:e.modifiers}).perHit;
        } else {
          total += hit.perHit;
          gauge += hit.perHit * (buildup + artsFraction(hit) * (e.burning?.ratio ?? 0)) * profile.buildupMultiplier;
          if (gauge >= profile.threshold - 1e-9) {
            total += profile.burstDamage;
            unlock = state.time + profile.duration;
            gauge = 0;
          }
        }
      }
      return total;
    }, onEnd:() => { stolen = false; } });
});
