import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const sntllaOverride = operatorAttack('arts', ({ b, n, talent, elapsed, ctx, hit, notes }) => {
  const t = talent(0);
  const atk = elapsed >= t.interval! ? t.atk! : 0;
  const normal = hit(false, { atk });
  if (n === 2) notes.push('冰凌随机落点与 Boss 站位未指定，按每枚冰凌覆盖目标给出站位上限。');
  const skill = n === 1 ? hit(true, { atk:atk + b.atk!, speed:b.attack_speed })
    : hit(true, { atk, interval:ctx.tier.attributes.baseAttackTime + b.base_attack_time!, scale:b['attack@atk_scale'] });
  return { normal, skill, breakpoints:[t.interval!] };
});
