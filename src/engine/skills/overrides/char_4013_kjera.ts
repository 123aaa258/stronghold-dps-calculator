import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const kjeraOverride = operatorAttack('arts', ({ n, b, talent, trait, hit, add, notes }) => {
  const atk = talent(0)['kjera_t_1[high].atk']!;
  notes.push('默认攻击范围内至少两格地面。原有浮游单元持续锁定同一 Boss，技能新放出的单元从首击倍率独立爬升。');
  const cap = trait.max_stack_cnt!, scale = (k:number) => Math.min(trait.max_atk_scale!, trait.init_atk_scale! + k * trait.delta_atk_scale!);
  const normals = Array.from({ length:cap + 1 }, (_,k) => add(hit(false,{ atk }),false,'浮游单元',{ atk,scale:scale(k) }));
  const skills = Array.from({ length:cap + 1 }, (_,k) => {
    const opts = { atk:atk + b.atk! };
    return add(hit(true,opts),true,'初始浮游单元',{ ...opts, scale:scale(k) });
  });
  const extra = skills.map(p => Array.from({ length:cap + 1 }, (_,k) => add(p,true,'技能浮游单元',{ atk:atk + b.atk!, scale:scale(k) })));
  return { normal:normals[0]!, skill:n === 2 ? extra[0]![0]! : skills[0]!, sequence:{ select:s => {
    const k = Math.min(cap,s.attacks);
    return !s.active ? normals[k]! : n === 2 ? extra[k]![Math.min(cap,s.skillAttacks)]! : skills[k]!;
  } } };
});
