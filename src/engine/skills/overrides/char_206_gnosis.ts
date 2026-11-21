import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const gnosisOverride = operatorAttack('arts', ({ ctx, b, n, talent, hit, notes }) => {
  const frozen = !ctx.boss.attributes?.immunities.frozenImmune;
  const fragile = frozen ? talent(0).damage_scale_freeze! - 1 : talent(0).damage_scale_cold! - 1;
  notes.push('默认有外部寒冷来源。冻结免疫仍可寒冷，只计寒冷脆弱；可冻结时采用冻结脆弱与 15 点减抗（PRTS 灵知）。');
  const opts = { fragile, resReductionFixed:frozen ? 15 : 0 };
  const normal = hit(false, opts);
  if (n === 1) return instant(normal, hit(true, { ...opts, scale:b.atk_scale, hits:2 }), true);
  if (n === 2) {
    notes.push('零度爆发在第一份技力就绪时自动释放，未等待第二份技力的额外寒冷。');
    return instant(normal, hit(true, { ...opts, scale:b.atk_scale }));
  }
  const skill = hit(true, { ...opts, speed:b.attack_speed });
  const endDamage = frozen ? hit(true, { ...opts, scale:b.atk_scale }).components[0]!.perHit : 0;
  return { normal, skill, sequence:endDamage ? { endDamage:() => endDamage } : undefined };
});
