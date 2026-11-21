import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const mlyssOverride = operatorAttack('physical', ({ b, hit, notes }) => {
  notes.push('只部署缪尔赛思本体，按本体的攻击力、攻速与初始技力计算，目标未被流形阻挡。');
  return { normal:hit(false), skill:hit(true, { atk:b.atk, speed:b.attack_speed }),
    sequence:{ discreteAttacks:true } };
});
