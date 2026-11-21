import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const closurOverride = operatorAttack('physical', ({ ctx, n, b, talent, trait, blocked, hit, notes }) => {
  notes.push('默认由指挥中心阻挡 Boss，指挥中心没有攻击；同一目标不因援军数量增加而重复命中。');
  const passive = talent(1).atk ?? 0, scale = blocked ? trait.atk_scale! : 1;
  return { normal:hit(false,{ atk:passive, scale }), skill:hit(true,{ atk:passive + (n === 2 ? b.atk! : 0),
    scale:scale * (b['attack@atk_scale'] ?? 1), interval:ctx.tier.attributes.baseAttackTime + (b.base_attack_time ?? 0) }) };
});
