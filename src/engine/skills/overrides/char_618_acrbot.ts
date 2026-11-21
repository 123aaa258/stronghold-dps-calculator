import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const acrbotOverride = operatorAttack('physical', ({ ctx, b, hit, notes }) => {
  notes.push('默认干员存活，自身被击倒时才触发的爆炸不计入本场对 Boss 输出。');
  return { normal:hit(false), skill:hit(true,{ atk:b.atk, interval:ctx.tier.attributes.baseAttackTime + b.base_attack_time! }) };
});
