import { operatorRotation } from './batches/phase-07-09.ts';
// 装置只提供屏障，岁月锻打的攻击加成明确也作用于凯瑟琳本人。
export const override = operatorRotation('physical', ({ slot, skill: s }) => ({
  active: { body: slot === 1 ? { atk: s.s1_atk } : { type: 'none' } }, lifecycle: slot === 1 ? 'permanent' : 'timed',
}));
