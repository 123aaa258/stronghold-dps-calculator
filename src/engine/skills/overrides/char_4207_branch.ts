import { operatorRotation } from './batches/phase-07-09.ts';
// 绝境抵抗与简易包扎只影响生存；生存决心的额外阻挡目标不重复打 Boss。
export const override = operatorRotation('physical', ({ skill: s }) => ({ active: { body: { atk: s.atk } } }));
