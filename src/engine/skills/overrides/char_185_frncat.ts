import { operatorAttack, instant } from './operator-attack.ts';
import { swiftSucceeds } from '../../swift.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const frncatOverride = operatorAttack('arts', ({ n, b, talent, blocked, trait, hit, notes }) => {
  const speed = !blocked ? trait.attack_speed ?? 0 : 0;
  const normal = [1,2].map(hits => hit(false, { hits, speed }));
  const skill = [1,2].map(hits => hit(true, { hits, speed, atk:b.atk }));
  notes.push('连击天赋按攻击动作逐次判定，多段攻击只回复一次攻击技力。');
  return { ...(n === 1 ? instant(normal[0]!, skill[0]!, true) : { normal:normal[0]!, skill:skill[0]! }),
    sequence:{ select:s => (s.active ? skill : normal)[+swiftSucceeds(s.attacks, talent(0).prob!, 1)]! } };
});
