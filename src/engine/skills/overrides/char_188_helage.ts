import { operatorRotation } from './batches/phase-07-09.ts';
// 满血时坚忍的攻速为零，新月与弦月均为两次独立的物理伤害。
export const override = operatorRotation('physical', ({ slot, skill: s }) => ({
  active: { body: { hits: slot === 3 ? 1 : 2, atk: s.atk, scale: s.atk_scale } }, lifecycle: slot === 1 ? 'instant' : 'timed',
  assumptions: ['满血单挑场景无主动失血，坚忍按零额外攻速。'],
}));
