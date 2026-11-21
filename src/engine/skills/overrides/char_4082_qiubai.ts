import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const qiubaiOverride = operatorAttack('physical', ({ ctx, n, b, talent, trait, blocked, hit, add, notes }) => {
  notes.push('默认目标持续处于外源停顿，触发天赋附伤；被阻挡时按近战攻击。');
  const attached = (active: boolean, opts: { atk?:number; speed?:number; type?:'arts' } = {}) => {
    let p = hit(active, { scale:blocked || n === 3 && active ? 1 : trait.atk_scale, ...opts });
    p = add(p, active, '入隙天赋', { ...opts, type:'arts', scale:talent(0).atk_scale });
    return trait.atk_scale_m ? add(p, active, '模组法伤', { ...opts, type:'arts', scale:trait.atk_scale_m }) : p;
  };
  const normal = attached(false);
  if (n === 1) {
    notes.push('束缚结束的法术伤害归入本次强化普攻，提前至本击结算。');
    return instant(normal, add(attached(true), true, '束缚结束', { type:'arts', scale:b.aoe_scale }), true);
  }
  if (n === 2) {
    notes.push('起手法伤和收招物伤按技能时长分摊；起手按开启前面板，收招按技能面板。');
    let skill = attached(true, { atk:b.atk });
    skill = add(skill, true, '起手剑气', { type:'arts', scale:b.sword_begin_atk_scale, fixedInterval:ctx.level.duration });
    skill = add(skill, true, '收招剑气', { atk:b.atk, scale:b.sword_end_atk_scale, fixedInterval:ctx.level.duration });
    return { normal, skill };
  }
  notes.push('问雪每轮从零层攻速开始，在本次攻击完成时叠一层，下一次攻击采用新间隔。');
  const steps = Array.from({ length:b.max_stack_cnt! + 1 }, (_, k) => attached(true,{ type:'arts',atk:b.atk,speed:k * b.attack_speed! }));
  return { normal, skill:steps[0]!, sequence:{ select:s => s.active ? steps[Math.min(s.skillAttacks,steps.length-1)]! : normal } };
});
