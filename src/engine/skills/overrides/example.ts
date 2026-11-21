import type { SkillOverride } from './index.ts';
/** 未注册的接口示例，不对应真实干员，不添加任何推测倍率。 */
export const exampleOverride: SkillOverride = (_context, model) => ({
  ...model,
  notes: [...model.notes, '精建接口示例（未注册）：确认机制与来源后替换分项和时间过程参数，当前不提升精度'],
});
