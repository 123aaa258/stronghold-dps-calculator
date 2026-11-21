import { actionModel, duelAttack } from './duel-attack.ts';
import { duelClock } from './duel-clock.ts';
import { actionDamage } from './shared.ts';
import { swiftSucceeds } from '../../swift.ts';

// https://prts.wiki/w/深靛 ：S1 间隔按 -80%，S2 的正值为间隔乘数；每份储能独立判定束缚。
export const override = actionModel(['深靛从零储能开始，只有单个 Boss。束缚时储能，解除后下一次攻击连同储能全部释放。'], (ctx, model) => {
  const b = ctx.level.blackboard.nums, t = ctx.tier.talents[0]!.blackboard.nums;
  const one = ctx.skill.skillId.endsWith('_1'), e = model.battle!;
  const normal = duelAttack(ctx, e, false, 'arts');
  const skill = duelAttack(ctx, e, true, 'arts', 0, 0, { scale:b['attack@atk_scale'] ?? 1,
    interval:ctx.tier.attributes.baseAttackTime * (one ? 1 + b.base_attack_time! : b.base_attack_time!) });
  const dot = duelAttack(ctx, { ...e, weakness:undefined, atkProc:undefined }, true, 'arts', 0, 0,
    { scale:b['indigo_s_2[damage].atk_scale'] ?? 0, ownerActions:0 }).components[0]!.perHit;
  const cap = ctx.tier.trait?.blackboard.nums.times ?? 3;
  let stored = 0, boundUntil = 0, draw = 0, nextDot = Infinity;
  return duelClock(ctx, model, { normal, skill, length:() => ctx.level.duration, panel: st => st.active ? skill : normal,
    onCast:st => { if (!one) nextDot = st.time + b['indigo_s_2[damage].interval']!; return 0; }, onEnd:() => { nextDot = Infinity; },
    nextEvent:() => nextDot, event:st => { nextDot += b['indigo_s_2[damage].interval']!; return st.time < boundUntil - 1e-9 ? dot : 0; },
    shot:(st, p) => {
      // 攻击与束缚结束同帧时已经可以选中目标，长时间累加间隔会留下浮点尾差。
      if (st.time < boundUntil - 1e-9) { stored = Math.min(cap, stored + 1); return 0; }
      const count = stored + 1;
      stored = 0;
      for (let i = 0; i < count; i++) if (swiftSucceeds(draw++, t.prob! * (st.active ? b.talent_scale ?? 1 : 1), 1)
        && !ctx.boss.attributes?.immunities.groundBoundImmune) boundUntil = st.time + t.duration!;
      return actionDamage(p) * count;
    } });
});
