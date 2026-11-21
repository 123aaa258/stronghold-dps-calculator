import { operatorRotation } from './batches/phase-07-09.ts';
// 单个 Boss 只受一次群攻，天赋回血和模组减伤不改变攻击面板。
export const override = operatorRotation('physical', ({ skill: s }) => ({ active: { body: { atk: s.atk } } }));
