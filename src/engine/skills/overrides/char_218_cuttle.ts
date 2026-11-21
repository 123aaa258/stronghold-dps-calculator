import { duel } from './single-boss.ts';
import { hpSwitch } from './hp-switch.ts';

// 阻滞射击战术在敌人低于半血时失去攻击目标，普攻期仍可攻击。
const rangePhase = (low: boolean) => duel(({ e, s, b, t, trait, attack }) => {
  const bonus = trait('damage_scale');
  const effects = { ...e, modifiers: [...e.modifiers, { kind: 'increase' as const, group: 'distance', value: bonus, source: 'trait:cuttle' }] };
  const speed = t(0, 'attack_speed');
  return { normal: attack(false, 'physical', { speed, effects }),
    skill: attack(true, low && s === 2 ? 'none' : 'physical', { atk: b.atk, speed, effects }),
    assumptions: ['安哲拉按模组最远距离计算；阻滞射击战术在单人造成的累计伤害越过半血后停止瞄准，队友伤害未计入血线。'] };
});
export const cuttleOverride = hpSwitch(rangePhase(false), rangePhase(true), .5);
