import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const frostlOverride = operatorAttack('physical', ({ ctx, n, b, talent, trait, blocked, hit, add, notes }) => {
  const interval = ctx.tier.attributes.baseAttackTime + (talent(0).base_attack_time ?? 0);
  if (!blocked) notes.push('目标未被阻挡时按远程攻击及其特性倍率计算。');
  const baseScale = blocked ? 1 : trait.atk_scale!;
  const build = (active:boolean) => {
    const opts = { interval, speed:active ? b.attack_speed : 0 };
    const p = hit(active,{ ...opts, scale:baseScale * (active ? b.atk_scale ?? 1 : 1) });
    return trait.atk_scale_m ? add(p, active, '模组法术附伤',{ ...opts, type:'arts', scale:trait.atk_scale_m }) : p;
  };
  const normal = build(false), skill = build(true);
  return n === 1 ? instant(normal,skill,true) : { normal,skill };
});
