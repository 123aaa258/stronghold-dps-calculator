import { operatorRotation } from './batches/phase-07-09.ts';
// 特性按实际阻挡开关，追凶只在同一个目标的首次命中后十秒内触发。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, blocked, trait, talent }) => {
  const atk = blocked ? trait.atk ?? 0 : 0, t = talent(0);
  const extra = ctx.elapsed < t.interval ? [{ label: '追凶', strike: { type: 'arts' as const, scale: t.atk_scale } }] : [];
  const idle = { body: { atk }, extra };
  const assumptions = ['单个 Boss 的追凶窗口从首次接敌起计十秒；不因后续攻击刷新。'];
  if (slot === 1) return { idle, active: { body: { atk }, extra: [...extra, { label: '小施惩戒附伤', strike: { type: 'arts', scale: s.extra_damage_ratio } }] },
    lifecycle: 'instant', breakpoints: [t.interval], assumptions };
  if (slot === 2) return { idle, active: { body: { type: 'arts', atk, scale: s.atk_scale }, extra },
    lifecycle: 'instant', burst: true, breakpoints: [t.interval], assumptions };
  assumptions.push('坠刃之外的隐狐攻速按技能十秒内线性衰减的平均加成；逐帧攻速取整存在差异。');
  return { idle, active: { body: { atk: atk + s.atk, speed: s.attack_speed / 2 }, extra }, breakpoints: [t.interval], assumptions };
});
