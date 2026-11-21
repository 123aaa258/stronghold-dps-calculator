import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const aglinaOverride = operatorAttack('arts', ({ ctx, e, n, b, talent, hit }) => {
  const field = ctx.tier.talents.find(t => t.index === 0);
  // 减速师X模二、三级黑板只保留自身范围内的额外攻速，全场部分仍在天赋描述中。
  const globalSpeed = field?.desc.match(/全场友方单位攻速\+(\d+).*额外/s)?.[1];
  const fieldSpeed = talent(0).attack_speed ?? 0;
  const speed = fieldSpeed + (globalSpeed && fieldSpeed < Number(globalSpeed) ? Number(globalSpeed) : 0);
  const recovery = ctx.tier.talents.find(t => t.blackboard.nums.sp_recovery_per_sec)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  if (ctx.level.spType === 'INCREASE_WITH_TIME') e.spRecovery += recovery;
  const interval = ctx.tier.attributes.baseAttackTime * (n === 2 ? b.base_attack_time! : 1);
  return { normal:hit(false, { type:n === 1 ? 'arts' : 'none', speed }), skill:hit(true,{ speed, interval, atk:b.atk, scale:n === 2 ? b.damage_scale : 1 }) };
});
