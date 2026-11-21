import { operatorAttack, instant } from './operator-attack.ts';
import { swiftSucceeds } from '../../swift.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const flamtlOverride = operatorAttack('physical', ({ ctx, b, n, talent, hit, notes }) => {
  // PRTS「焰心」的攻击间隔按技能黑板乘算；双击在成功闪避后的下一次攻击生效。
  const interval = n === 3 ? ctx.tier.attributes.baseAttackTime * b.base_attack_time! : undefined;
  const normal = hit(false), normalDouble = hit(false, { hits:2 });
  const skill = n === 1 ? hit(true,{ type:'none' }) : n === 2 ? hit(true,{ scale:b.atk_scale, hits:2 }) : hit(true,{ atk:b.atk, interval });
  const double = hit(true, { atk:b.atk, interval, hits:2 });
  const incoming = bossAttackInterval(ctx.boss).interval;
  notes.push('默认 Boss 的普攻为物理攻击，按攻击间隔逐次判定闪避；额外目标不重复计伤。');
  const rotation = n < 3 ? instant(normal, skill) : { normal, skill };
  return { ...rotation, sequence:{ select:s => {
    if (s.active && n < 3) return skill;
    const actionInterval = s.active ? skill.stats.attackInterval : normal.stats.attackInterval;
    const index = Math.floor((s.time + 1e-8) / incoming);
    const prior = Math.floor((s.time - actionInterval + 1e-8) / incoming);
    let evade = false;
    for (let i = Math.max(1, prior + 1); i <= index; i++) {
      const t = i * incoming;
      const prob = n === 2 && t >= s.lastCast && t < s.lastCast + b['flamtl_s_2.duration']! ? b['flamtl_s_2.prob']! : s.active && n === 3 ? b.prob! : talent(1).prob ?? 0;
      evade ||= n === 1 && t >= s.lastCast && t < s.lastCast + incoming || swiftSucceeds(i - 1, prob, 1);
    }
    return s.active ? evade ? double : skill : evade ? normalDouble : normal;
  } } };
});
