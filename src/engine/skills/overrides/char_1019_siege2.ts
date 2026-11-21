import { duel } from './single-boss.ts';
import { token, tokenEffects } from './duel-effects.ts';
import { isBlocked } from './shared.ts';

// 诸王的叹息按范围内友方数给加攻；S1 额外真伤保留本体法伤，S3 普攻转真伤。
export const siege2Override = duel(({ ctx, s, b, t, trait, e, attack, add }) => {
  const speed = isBlocked(ctx.boss) ? 0 : trait('attack_speed');
  const allies = 2;
  const base = t(0, 'atk') * allies;
  const normal = attack(false, 'arts', { atk: base, speed });
  let skill = attack(true, s === 3 ? 'true' : 'arts', { atk: base + (s === 3 ? t(0, 'atk') : 0) + (b.atk ?? 0), speed, delay: b.base_attack_time });
  if (s === 3) {
    const lion = token(ctx, 'token_10040_siege2_vlion').attributes;
    skill = add(skill, { label: '黄金盟誓普攻', type: 'true', flat: lion.atk, interval: lion.baseAttackTime, independent: true }, tokenEffects(e));
  }
  return { normal, skill: s === 1 ? add(skill, { type: 'true', label: '重铸晖光', scale: b.atk_scale }) : skill,
    battle: s === 2 ? { ...e, spRecovery: e.spRecovery + b.sp_recovery_per_sec } : e,
    assumptions: ['维娜周围按两名友方单位（含自身）计算天赋与进赴故土的回复；技能三按另有一块贴近 Boss 的可部署地面，计一只黄金盟誓的真伤与天赋加攻。'] };
});