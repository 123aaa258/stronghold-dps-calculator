import { operatorRotation } from './batches/phase-07-09.ts';
// 先声夺人描述为周围八格：自身格不属于这八格。领袖在场不改变自身攻击力。
export const override = operatorRotation('physical', ({ slot, skill: s, trait, blocked }) => {
  const scale = blocked ? 1 : trait.atk_scale;
  return { idle: { body: { scale } }, active: { body: { scale: scale * (s.atk_scale ?? 1), hits: slot === 1 ? 2 : 1, atk: s.atk } },
    lifecycle: slot === 1 ? 'instant' : 'timed', assumptions: ['默认奥尔佳自身阻挡 Boss，天赋的周围八格按其他干员计。'] };
});
