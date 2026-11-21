import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

export const override = duel(({ ctx, s, b, trait, t, attack }) => {
  const vigor = t(0, 'peak_performance.atk');
  const scale = isBlocked(ctx.boss) ? 1 : trait('atk_scale', 1.2);
  const normal = attack(false, 'physical', { atk: vigor, scale });
  const skill = attack(true, 'physical', { atk: (b.atk ?? 0) + Math.max(vigor, b['attack@peak_performance.atk'] ?? 0),
    hits: s === 1 ? 2 : 1, scale: scale * (b.atk_scale ?? 1) });
  return { normal, skill, assumptions: ['帕拉斯满血触发精力充沛，身前空位时英勇的祝福给自身，同名精力充沛取最高。'] };
});
