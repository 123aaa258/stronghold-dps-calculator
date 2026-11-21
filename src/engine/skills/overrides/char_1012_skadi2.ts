import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const skadi2Override = operatorAttack('none', ({ ctx, n, b, talent, hit, notes }) => {
  const normal = hit(false);
  if (n !== 3) return { normal, skill:hit(true) };
  const atk = talent(1)['skadi2_t_2[atk][2].atk'] ?? 0;
  const module = ctx.tier.talents.find(t => t.index < 0 && t.blackboard.nums.cnt)?.blackboard.nums.atk ?? 0;
  notes.push('默认有深海猎人及满足模组人数的友军，每次开技部署海嗣覆盖同一 Boss。真实伤害按一秒的节拍，自己不接受鼓舞。');
  return { normal, skill:hit(true,{ atk:atk + module, type:'true', hits:2, scale:b.atk_scale, fixedInterval:1, ownerActions:0 }) };
});
