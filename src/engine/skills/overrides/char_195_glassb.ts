import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const glassbOverride = operatorAttack('arts', ({ ctx, b, talent, hit }) => {
  const speed = talent(0).attack_speed ?? 0;
  return { normal:hit(false, { speed }), skill:hit(true, { speed, atk:b.atk, interval:ctx.tier.attributes.baseAttackTime + (b.base_attack_time ?? 0) }) };
});
