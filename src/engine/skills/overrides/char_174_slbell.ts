import { operatorRotation, amplify } from './batches/phase-07-09.ts';
import { hpSwitch } from './hp-switch.ts';
import type { SkillOverride } from './index.ts';
// 双响的第二目标不会再次命中 Boss，传音回响的负攻速作用于敌方。
const healthPhase = (low: boolean) => operatorRotation('arts', ({ effects, slot, skill: s, talent }) => ({
  effects: amplify(effects, 'talent:slbell', low ? talent(0).damage_scale - 1 : 0, true),
  active: { body: { resReductionPct: slot === 2 ? -s.magic_resistance : 0 } },
  assumptions: ['目标从满血开始，按初雪自身的累计伤害跨过天赋血线后给予脆弱；队友伤害未参与压低血线。'],
}));

export const override: SkillOverride = (ctx, generic) => hpSwitch(healthPhase(false), healthPhase(true),
  ctx.tier.talents[0]!.blackboard.nums.hp_ratio)(ctx, generic);
