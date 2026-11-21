import { duel } from './single-boss.ts';

// 剑盾骑士只作用于受击回复技能，仁慈须尊重敌人的睡眠免疫。
export const blemshOverride = duel(({ ctx, e, s, b, t, attack, add }) => {
  const sleeping = !ctx.boss.attributes?.immunities.sleepImmune;
  const scale = sleeping ? t(1, 'atk_scale') || 1 : 1;
  const normal = attack(false, 'physical', { scale });
  let skill = attack(true, 'physical', { scale: scale * (b.atk_scale ?? 1), atk: b.atk });
  if (s === 3) skill = add(skill, { label: '先贤化身法伤', type: 'arts', scale: b['attack@blemsh_s_3_extra_dmg[magic].atk_scale'] * scale });
  return { normal, skill, battle: ctx.level.spType === 'ON_DEFEND' ? { ...e, spRecovery: e.spRecovery + t(0, 'sp') / normal.stats.attackInterval } : e,
    lifecycle: s === 1 ? 'instant' : 'timed', duration: s === 1 ? skill.stats.attackInterval : ctx.level.duration,
    assumptions: [...(ctx.level.spType === 'ON_DEFEND' ? ['瑕光受击回复技能在充能阶段同时按自己的普攻与 Boss 攻击间隔回技。'] : []),
      ...(sleeping ? ['对可沉睡的目标，默认其他来源维持沉睡，仁慈倍率生效。'] : [])] };
});