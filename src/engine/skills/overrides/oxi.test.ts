import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { BossData, OperatorData, SkillData } from '../../types.ts';
import { generic } from '../generic.ts';
import { oxiOverride } from './char_4247_oxi.ts';
import { advanceBurning, burningProfile } from '../../effects/elemental.ts';

const operator = operators.find(o => o.charId === 'char_4247_oxi') as unknown as OperatorData;
const boss = bosses.find(b => b.bossId === 'boss_1') as BossData;
const build = (index: number, tierName: 'a' | 'b' = 'b') => {
  const tier = operator.tiers[tierName];
  const skill = Object.values(skills).find(s => s.skillId === operator.skillIds[index]) as SkillData;
  const level = skill.levels[String(tier.skillLevel)]!;
  return oxiOverride({ operator, tier, skill, level, boss }, generic(operator, tier, skill, level, boss));
};

it('进阶S3：初始7秒、怒火爬升、18秒过载、灼燃转换的30秒手算', () => {
  // A=830.5056179775281，RES=25；N=A*.75/1.2，7秒普攻后开启36秒技能。
  // 前半基础B=A*2.2*1.75*.75/(80/30)。技能前3秒无怒火，随后6个0.5秒段倍率
  // 1,1.025,...,1.125；技能第6秒后1.15。达到累计2000/.11扣血时爆条。
  // T=13+[2000/.11−7N−B*(6+.5*.025*15)]/(1.15B)，T在13..25秒。
  // T爆条7000，T..25为元素速率E=B*1.15/.75；25..30过载Eo=E*(8/3)/2。
  const a = 830.5056179775281;
  const n = a * .75 / 1.2;
  const b = a * 2.2 * 1.75 * .75 / (80 / 30);
  const t = 13 + (2000 / .11 - 7 * n - b * (6 + .5 * .025 * 15)) / (b * 1.15);
  const e = b * 1.15 / .75;
  const eo = e * (80 / 30) / 2;
  const expected30 = 2000 / .11 + 7000 + e * (25 - t) + eo * 5;
  // 冷却结束T+10后恢复法术，直到43秒技能结束仍未第二次爆条。
  const expectedSkill = (2000 / .11 + 7000 + e * (25 - t) + eo * (t + 10 - 25)
    + eo * .75 * (43 - t - 10) - 7 * n) / 36;
  const model = build(2);
  expect(t).toBeGreaterThan(13);
  expect(t).toBeLessThan(25);
  expect(model.customTimeline!(30, Infinity).totalDamage).toBeCloseTo(expected30, 6);
  expect(model.skill!.dps).toBeCloseTo(expectedSkill, 6);
  expect(model.skill!.components.reduce((s, c) => s + c.dps, 0)).toBeCloseTo(expectedSkill, 6);
});

it('S2不受击不触发；普攻灼燃阈值、7000爆发及10秒锁条手算', () => {
  // 满血不受击：不因初始18SP自动开启S2。N=A*.75/1.2，T=2000/(.11N)。
  // T时伤害2000/.11+7000；随后10秒法抗25−20=5，伤害率A*.95/1.2且不积累。
  const model = build(1);
  const a = 830.5056179775281;
  const n = a * .75 / 1.2;
  const t = 2000 / (.11 * n);
  expect(model.skill).toBeNull();
  expect(model.customTimeline!(30, Infinity).totalDamage).toBeCloseTo(30 * n, 6);
  expect(model.customTimeline!(t + 10, Infinity).totalDamage).toBeCloseTo(2000 / .11 + 7000 + a * .95 / 1.2 * 10, 6);
  expect(model.elemental!.perSec).toBeCloseTo(n * .11, 6);
});

it('元素抗性分别用于损伤与扣血，冷却期间忽略所有积累', () => {
  const profile = burningProfile({ ...boss, levelType: 'BOSS', attributes: { ...boss.attributes!, epResistance: 50, epDamageResistance: 20 } });
  const state = { buildup: 0, remaining: 0 };
  // 400/s损伤抵抗后200/s：10秒满2000；元素扣血7000*.8=5600。
  expect(advanceBurning(state, profile, 400, 30)).toEqual({ seconds: 10, burst: 5600 });
  expect(advanceBurning(state, profile, 99999, 30)).toEqual({ seconds: 10, burst: 0 });
  expect(state).toEqual({ buildup: 0, remaining: 0 });
  expect(advanceBurning(state, profile, 400, 5)).toEqual({ seconds: 5, burst: 0 });
  expect(state.buildup).toBe(1000);
  expect(advanceBurning(state, profile, 0, Infinity)).toEqual({ seconds: Infinity, burst: 0 });
  expect(state.buildup).toBe(1000);
  state.buildup = 2000;
  expect(advanceBurning(state, profile, 0, 0)).toEqual({ seconds: 0, burst: 5600 });
});

it('两阶三技能均有有限的时间积分，S1按8秒技力触发', () => {
  for (const tier of ['a', 'b'] as const) for (const skill of [0, 1, 2]) {
    const model = build(skill, tier);
    expect(Number.isFinite(model.customTimeline!(30, 100000).totalDamage)).toBe(true);
    expect(Number.isFinite(model.customTimeline!(30, 100000).killTimeSec)).toBe(true);
  }
  // S1进阶在8秒施放4.9A法伤；小于爆条阈值，无怒火和灼燃爆发。
  const a = 830.5056179775281;
  expect(build(0).customTimeline!(8, Infinity).totalDamage).toBeCloseTo(a * .75 / 1.2 * 8 + a * 4.9 * .75, 6);
});
