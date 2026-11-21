import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const slent2Override = operatorAttack('arts', ({ n, b, hit, notes }) => {
  if (n === 3) notes.push('无畏者协议最多开启两次；按自动开启、每次持续完整时长处理。');
  return { normal:hit(false), skill:hit(true, { type:'heal', atk:b.atk, speed:b.attack_speed }), sequence:n === 3 ? { maxCasts:b.skill_max_trigger_time } : undefined };
});
