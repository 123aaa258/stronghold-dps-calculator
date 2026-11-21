import { operatorRotation } from './batches/phase-07-09.ts';
// 造型仪提供的盾和防御不产生伤害；全自动造型仪期间停止攻击。
export const override = operatorRotation('physical', ({ slot, skill: s }) => ({
  active: { body: slot === 1 ? { atk: s.atk } : { type: 'none' } },
}));
