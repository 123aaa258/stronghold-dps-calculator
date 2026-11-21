import { operatorRotation, mass } from './batches/phase-07-09.ts';
import { hpSwitch } from './hp-switch.ts';
// 默认模组的重量数值在天赋黑板内，描述挂在特性；无该模组无倍率。
const healthPhase = (low: boolean) => operatorRotation('physical', ({ ctx, slot, skill: s, trait }) => {
  const heavy = trait.atk_scale === undefined
    ? ctx.tier.talents.find(t => t.blackboard.nums.value !== undefined && t.blackboard.nums.atk_scale !== undefined)?.blackboard.nums ?? {}
    : trait;
  const scale = (mass(ctx) ?? -1) >= (heavy.value ?? Infinity) ? heavy.atk_scale ?? 1 : 1;
  const assumptions = ['单个 Boss 从满血开始，半血条件仅随个人累计伤害变化。单人重伤留一血的终结过程暂未计入击杀时间。'];
  if (slot === 1) assumptions.push('半血以上按持续普攻且无强力击伤害；触及半血后的储能连续释放时点未校准。');
  if (slot === 2) assumptions.push('半血后每次开技对同一 Boss 追加一次追击，技能中途刚过血线时追击时点未校准。');
  return { idle: { body: { scale } }, active: { body: { scale: scale * (slot === 1 && low ? s.atk_scale_s1 : 1), atk: s.atk },
    extra: slot === 2 && low ? [{ label: '半血追击', cast: true, strike: { scale: scale * s.atk_scale_s2_extra } }] : [] },
    lifecycle: slot === 1 ? 'instant' : 'timed', assumptions };
});

export const override = hpSwitch(healthPhase(false), healthPhase(true), .5);
