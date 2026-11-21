import { operatorRotation } from './batches/phase-07-09.ts';
// 裂云兽用本体面板，独立造成一次伤害；特殊子弹的两段分别扣防。
export const override = operatorRotation('physical', ({ slot, skill: s, trait, talent }) => ({
  idle: { body: { scale: trait.atk_scale } },
  active: { body: { scale: slot === 1 ? trait.atk_scale * s.atk_scale : s.atk_scale_2, hits: slot === 2 ? 2 : 1 },
    extra: [{ label: '裂云一击', strike: { type: 'physical', scale: talent(0).atk_scale } }] },
  lifecycle: 'instant', burst: slot === 2,
  assumptions: ['默认 Boss 静止，风雪连弩使用特殊子弹，不重复乘普通子弹特性。普通攻击按有弹，装填空窗尚未计入。'],
}));
