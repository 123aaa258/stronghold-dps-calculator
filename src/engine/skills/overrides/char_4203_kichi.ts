import { operatorAttack } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const kichiOverride = operatorAttack('physical', ({ ctx, n, b, trait, hit, notes }) => {
  notes.push('Boss 在正前方横排，击杀 Boss 前没有其他敌人倒下。');
  const scale = trait.atk_scale;
  const interval = ctx.tier.attributes.baseAttackTime + b.base_attack_time!;
  const normal = hit(false, { scale });
  if (n === 2) return { normal, skill:hit(true, { atk:b.atk, scale, interval }) };
  notes.push('开技时保留上一轮普攻的动作进度，切换是否重置前摇缺少模式内实测。');
  const steps = Array.from({ length:b.max_stack_cnt! + 1 }, (_, k) => hit(true, { atk:k * b.atk!, scale, interval }));
  return { normal, skill:steps[0]!, sequence:{ select:s => s.active ? steps[Math.min(s.skillAttacks, steps.length - 1)]! : normal } };
});
