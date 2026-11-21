import { operatorRotation } from './batches/phase-07-09.ts';
// 交叉掩护和两个技能的防御均不直接造成伤害；仅深化阵线停止攻击。
export const override = operatorRotation('physical', ({ slot }) => ({
  active: { body: slot === 2 ? { type: 'none' } : {} },
}));
