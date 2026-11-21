import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

// 天体仪按部署后每个 interval 叠层，两阶上限和每层数值各取自己的天赋黑板。
export const astesiOverride = duel(({ ctx, b, t, trait, e, attack }) => {
  const count = t(0, 'max_stack_cnt'), step = t(0, 'interval');
  const stacks = step > 0 ? Math.min(count, Math.floor(ctx.elapsed / step)) : 0;
  const effects = { ...e, modifiers: [...e.modifiers, { kind: 'fragile' as const, group: 'arts-fragile', types: ['arts' as const],
    value: isBlocked(ctx.boss) ? trait('damage_scale', 1) - 1 : 0, source: 'module:' + ctx.tier.uniEquipId }] };
  const make = (active: boolean) => attack(active, 'arts', { effects, atk: active ? b.atk : 0, speed: stacks * t(0, 'attack_speed') });
  return { normal: make(false), skill: make(true), breakpoints: Array.from({ length: count }, (_, i) => (i + 1) * step),
    assumptions: ['星极在场时每到天体仪的间隔加一层，自行阻挡时计模组法术脆弱。'] };
});