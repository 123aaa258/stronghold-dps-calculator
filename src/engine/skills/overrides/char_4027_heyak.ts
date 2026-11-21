import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const heyakOverride = operatorAttack('arts', ({ ctx, n, b, talent, trait, hit, notes }) => {
  const air = !ctx.boss.attributes?.immunities.levitateImmune;
  notes.push('Boss 处于地面；能浮空时按外部浮空条件满足，免疫时不计空中目标加成。');
  const scale = air ? talent(0).atk_scale ?? 1 : 1, resPenetrationFixed = trait.magic_resist_penetrate_fixed;
  const normal = hit(false, { resPenetrationFixed, scale });
  if (n === 1) return instant(normal, hit(true, { scale:scale * b.atk_scale!, resPenetrationFixed }), true);
  if (n === 2) return { normal, skill:hit(true, { hits:9, scale:scale * b['attack@atk_scale']!, resPenetrationFixed }) };
  notes.push('默认 Boss 位于旋风达到最大倍率的距离，单个 Boss 只命中一列旋风。');
  return { normal, skill:hit(true, { interval:ctx.tier.attributes.baseAttackTime + b.base_attack_time!, scale:scale * b['attack@max_atk_scale']!, resPenetrationFixed }) };
});
