import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const svash2Override = operatorAttack('physical', ({ b, n, e, talent, hit, notes }) => {
  e.initSp += talent(0).sp ?? 0;
  const normal = hit(false);
  if (n === 1) return instant(normal, hit(true, { type:'none' }));
  if (n === 2) return instant(normal, hit(true, { scale:b.atk_scale }));
  notes.push('风雪之眼需另行部署，部署位置及其他待部署干员未指定，仅计凛御银灰本体；默认目标持续处于本技能脆弱范围。');
  return { normal, skill:hit(true, { scale:b.bird_atk_scale, fragile:b.damage_scale_display }) };
});
