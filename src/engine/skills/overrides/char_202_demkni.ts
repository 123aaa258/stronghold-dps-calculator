import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const demkniOverride = operatorAttack('physical', ({ b, n, talent, elapsed, hit, notes }) => {
  const t = talent(0);
  const breakpoints = Array.from({ length:t.max_stack_cnt! }, (_, i) => (i + 1) * t.interval!);
  const atk = breakpoints.filter(time => elapsed >= time - 1e-8).length * t.atk!;
  const normal = hit(false, { atk }), heal = hit(true, { type:'heal', atk });
  notes.push('默认有可治疗的友军，治疗目标不是塞雷娅自身，精神回复不会回复本人技力。');
  const rotation = n < 3 ? instant(normal, heal, n === 1) : { normal, skill:heal };
  return { ...rotation, breakpoints };
});
