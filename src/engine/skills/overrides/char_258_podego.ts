import { skillPulse } from './attack-sequence.ts';
import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const podegoOverride = operatorAttack('arts', ({ ctx, b, n, talent, e, hit, add, notes }) => {
  const atk = talent(0).atk;
  e.spRecovery += ctx.tier.talents.find(t => t.blackboard.nums.sp_recovery_per_sec)?.blackboard.nums.sp_recovery_per_sec ?? 0;
  const normal = hit(false,{ atk });
  if (n === 1) return { normal, skill:hit(true,{ type:'heal', atk:(atk ?? 0) + b.atk! }) };
  notes.push('孢子群覆盖静止 Boss，技能瞬发后本体继续普攻；毒雾于黑板持续时间后消失。');
  const hitSpore = hit(true,{ atk, scale:b.atk_scale, ownerActions:0 });
  return { ...instant(normal,hitSpore), burst:false, duration:0, sequence:{
    pulse:s => skillPulse(s,1,b.projectile_delay_time!,hitSpore.components[0]!.perHit),
  } };
});
