import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const auroraOverride = operatorAttack('physical', ({ ctx, n, b, talent, trait, e, blocked, hit, notes }) => {
  if (!blocked) e.spRecovery = trait.sp_recover_ratio !== undefined
    ? (ctx.level.increment + e.spRecovery) * (1 + trait.sp_recover_ratio) - ctx.level.increment : -ctx.level.increment;
  const normal = hit(false), idle = hit(false,{ type:'none' });
  const frozen = !ctx.boss.attributes?.immunities.frozenImmune;
  if (n === 2 && frozen) notes.push('默认 Boss 已被外源冻结，子弹使用对冻结目标的倍率。');
  notes.push('只有非技能期技力超过一半才恢复普攻；被阻挡状态按当前 Boss 机制开关。');
  const skill = hit(true, { atk:b.atk, scale:n === 2 && frozen ? b.atk_scale : 1, interval:ctx.tier.attributes.baseAttackTime * (1 + (b.base_attack_time ?? 0)) });
  const duration = n === 1 ? ctx.level.duration : 9 * skill.stats.attackInterval;
  const cutoff = talent(0).sp_ratio!;
  return { normal, skill, lifecycle:n === 1 ? 'timed' : 'ammo', duration, sequence:{
    select:s => s.active ? skill : s.sp < cutoff * s.cost - 1e-8 || s.time < s.lastEnd + (b.stun ?? 0) - 1e-8 ? idle : normal,
    next:s => Math.min(s.time < s.lastEnd + (b.stun ?? 0) - 1e-8 ? s.lastEnd + b.stun! : Infinity,
      !s.active && s.sp < cutoff * s.cost - 1e-8 && ctx.level.increment + e.spRecovery > 0 ? s.time + (cutoff * s.cost - s.sp) / (ctx.level.increment + e.spRecovery) : Infinity)
  } };
});
