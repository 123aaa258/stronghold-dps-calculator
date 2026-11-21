import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const hodrerOverride = operatorAttack('physical', ({ ctx, n, b, talent, hit, add, notes }) => {
  const t = talent(0);
  notes.push('默认外部束缚成立，使用天赋较高攻击倍率。');
  const scale = t.atk_scale;
  const normal = hit(false, { scale, atk:n === 2 ? b.atk : 0 });
  if (n === 1) return instant(normal, hit(true, { scale:scale! * b.atk_scale! }), true);
  if (n === 2) {
    const slow = hit(true, { scale, atk:b.atk, interval:ctx.tier.attributes.baseAttackTime + b.base_attack_time! });
    notes.push('余烬重荷首次技力就绪切换至重击姿态，后续每次技力就绪切回另一姿态。');
    return { ...instant(normal, slow), burst:false, burstAttack:false,
      sequence:{ select:s => s.casts % 2 ? slow : normal } };
  }
  const skill = hit(true, { atk:b.atk, scale });
  return { normal, skill:add(skill, true, '死境硝烟每秒真伤', { type:'true', scale:0, attackAdd:b['attack@damage'], fixedInterval:1 }) };
});
