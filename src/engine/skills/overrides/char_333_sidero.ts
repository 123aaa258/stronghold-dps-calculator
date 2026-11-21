import { operatorRotation, amplify } from './batches/phase-07-09.ts';
// 单 Boss 击杀前没有七次击杀；生命回复是单次治疗，对攻击不产生占用。
export const override = operatorRotation('arts', ({ effects, slot, skill: s, trait, blocked }) => ({
  effects: amplify(effects, 'trait:sidero', blocked ? (trait.damage_scale ?? 1) - 1 : 0, true, true),
  active: { body: slot === 1 ? { type: 'none' } : { atk: s.atk } },
  lifecycle: slot === 1 ? 'instant' : 'timed', burst: slot === 1,
  assumptions: ['只有一个 Boss，佣兵之韧在击倒前没有累计到所需击杀数。'],
}));
