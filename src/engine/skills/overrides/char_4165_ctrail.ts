import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const ctrailOverride = operatorAttack('physical', ({ b, talent, hit }) => {
  return { normal:hit(false), skill:hit(true, { atk:b.atk, scale:talent(0).atk_scale }) };
});
