import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const wildmnOverride = operatorAttack('physical', ({ b, hit }) => {
  return { normal:hit(false), skill:hit(true, { atk:b.atk, speed:b.attack_speed }) };
});
