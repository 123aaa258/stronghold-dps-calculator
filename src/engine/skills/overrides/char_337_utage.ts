import { frameInterval } from '../../stats.ts';
import { operatorRotation } from './batches/phase-07-09.ts';
// 部署失血后，按每次命中回复 trait.value，由当前失血比例推坚忍攻速。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, trait, talent }) => {
  if (slot === 1) return { active: { body: { type: 'none' } } };
  const t = talent(0), text = ctx.tier.talents[0]?.desc ?? '';
  const maxSpeed = t.min_attack_speed ?? Number(text.match(/最高\+(\d+)/)?.[1] ?? 100);
  const fullLoss = t.min_hp_ratio !== undefined ? 1 - t.min_hp_ratio : Number(text.match(/损失(\d+)%/)?.[1] ?? 70) / 100;
  let lost = s.hp_ratio * ctx.tier.attributes.maxHp, speed = 0, time = 0;
  const breaks = [];
  while (lost > 0 && breaks.length < 100 && time <= s.duration) {
    const nowSpeed = maxSpeed * Math.min(1, lost / ctx.tier.attributes.maxHp / fullLoss);
    if (ctx.elapsed >= time - 1e-8) speed = nowSpeed;
    time += frameInterval(ctx.tier.attributes.baseAttackTime / (1 + nowSpeed / 100));
    breaks.push(time);
    lost = Math.max(0, lost - (trait.value || 1));
    if (!lost && ctx.elapsed >= time - 1e-8) speed = 0;
  }
  return { active: { body: { type: 'arts', atk: s.atk, speed } }, lifecycle: 'on_deploy', duration: s.duration, breakpoints: breaks,
    assumptions: ['部署初始满血；失血仅来自落地斩，按每次命中自疗。回复时点按自身攻速排布，外来攻速会影响实际恢复时点。'] };
});
