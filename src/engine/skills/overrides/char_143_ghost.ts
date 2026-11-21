import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const ghostOverride = operatorAttack('physical', ({ b, n, trait, blocked, hit, notes }) => {
  const scale = blocked ? trait.atk_scale ?? 1 : 1;
  if (n === 2) notes.push('肉斩骨断结束的自身晕眩会压缩下一轮普攻输出，持续时间取技能黑板 stun。');
  const normal = hit(false, { scale }), skill = hit(true, { scale, atk:b.atk });
  const idle = hit(false, { type:'none' });
  return { normal, skill, sequence:n === 2 ? {
    select:s => s.active ? skill : s.time < s.lastEnd + b.stun! - 1e-8 ? idle : normal,
    next:s => s.time < s.lastEnd + b.stun! - 1e-8 ? s.lastEnd + b.stun! : Infinity,
  } : undefined };
});
