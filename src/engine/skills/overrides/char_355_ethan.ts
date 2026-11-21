import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const ethanOverride = operatorAttack('physical', ({ b, n, hit, add, notes }) => {
  if (n === 2) return { normal:hit(false), skill:hit(true,{ atk:b.atk }) };
  const body = hit(false);
  notes.push('花式回旋毒伤刷新持续时间；连续攻击间隔超过持续时间时，只计毒伤的实际覆盖比例。');
  const normal = add(body,false,'回旋持续法伤',{ type:'arts', scale:0, attackAdd:b['attack@poison_damage'],
    fixedInterval:Math.max(1,body.stats.attackInterval / b['attack@duration']!) });
  return { normal, skill:null, passive:true, lifecycle:'permanent', duration:Infinity };
});
