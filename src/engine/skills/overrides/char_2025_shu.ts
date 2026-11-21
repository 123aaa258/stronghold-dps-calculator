import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const shuOverride = operatorAttack('physical', ({ b, n, talent, e, hit, notes }) => {
  const t = talent(1);
  notes.push('默认编队与场上满足岁的技力、攻击力和攻速条件，周期技力按每秒等效值计算。');
  e.spRecovery += (t.sp ?? 0) / (t.interval || 1);
  const team = { atk:t.atk ?? 0, speed:t.attack_speed ?? 0 };
  const normal = hit(false, team);
  if (n === 1) {
    notes.push('默认每次充能就绪都有一名不足半血的友方需要治疗，占用一个攻击间隔。');
    return instant(normal, hit(true, { ...team, type:'heal' }), true);
  }
  if (n === 2) return { normal, skill:hit(true, { ...team, type:'heal', atk:team.atk + b.atk! }) };
  notes.push('默认地面 Boss 位于播种地块，黍同时享受离离枯荣的群体加攻与攻速。');
  return { normal, skill:hit(true, { atk:team.atk + b.atk! + b.e_atk!, speed:team.speed + b.e_attack_speed! }) };
});
