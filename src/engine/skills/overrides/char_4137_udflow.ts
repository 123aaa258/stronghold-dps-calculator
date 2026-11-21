import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const udflowOverride = operatorAttack('physical', ({ n, b, talent, hit, add, notes }) => {
  const t = talent(0);
  notes.push('目标按非海怪处理；毒伤刷新持续时间，首次命中后按连续秒伤计算，超过毒伤时长的攻击间隔只计实际覆盖时长。');
  const build = (active:boolean) => {
    const p = hit(active, { atk:active ? b.atk : 0, speed:active && n === 2 ? b.attack_speed : 0 });
    return add(p, active, '天赋持续法伤', { type:'arts', scale:0, attackAdd:t.damage, fixedInterval:t.interval! * Math.max(1, p.stats.attackInterval / t.duration!) });
  };
  return { normal:build(false), skill:build(true) };
});
