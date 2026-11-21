import { operatorAttack, instant } from './operator-attack.ts';
import { actionDamage } from './shared.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const brigidOverride = operatorAttack('physical', ({ ctx, b, n, hit, add, notes }) => {
  const proximity = ctx.tier.talents.find(t => t.blackboard.nums.atk_scale)?.blackboard.nums.atk_scale ?? 1;
  const normal = hit(false, { scale:proximity });
  notes.push('单个 Boss 与水灯心相邻一格，投射物只命中这个目标；忽略往返飞行时间。');
  if (n === 1) {
    return { ...instant(normal, hit(true, { scale:proximity * b.atk_scale! }), true),
      sequence:{ discreteAttacks:true, castOnAttack:true } };
  }
  const hold = b['attack@projectile_delay_time']!;
  const spacing = b['attack@interval']!;
  const cuts = Math.round(b['attack@cut_duration']! / spacing);
  const interval = Math.max(normal.stats.attackInterval, hold);
  const body = hit(true, { atk:b.atk, scale:proximity, fixedInterval:interval });
  const skill = add(body, true, '附着斩击', { atk:b.atk, scale:proximity * b['attack@cut_scale']!, hits:cuts, fixedInterval:interval });
  notes.push('命中后按黑板间隔逐次斩击，最后一斩后回收投射物。');
  return { normal, skill, sequence:{
    discreteAttacks:true, immediateAttackRecovery:true,
    attackReadyAt:s => s.counters.returnAt ?? -Infinity,
    shot:(s, p) => {
      if (!s.active) return { damage:actionDamage(p), hits:1 };
      s.counters.returnAt = s.time + hold;
      s.counters.nextCut = s.time + spacing;
      s.counters.cutsLeft = cuts;
      return { damage:actionDamage(body), hits:1 };
    },
    pulse:s => ({ at:s.counters.cutsLeft ? s.counters.nextCut! : Infinity,
      damage:skill.components.at(-1)!.perHit, hits:1 }),
    afterPulse:s => {
      s.counters.cutsLeft = s.counters.cutsLeft! - 1;
      s.counters.nextCut = s.counters.nextCut! + spacing;
    },
  } };
});
