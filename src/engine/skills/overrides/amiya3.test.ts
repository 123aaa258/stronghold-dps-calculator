import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import type { CalcInput } from '../../types.ts';

const input: CalcInput = { charId: 'char_1037_amiya3', tier: 'b', skillId: 'skchr_amiya3_2',
  bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [], durationSec: 30 };
const atk = 425 + (532 - 425) * 59 / 79 + 25;
const normal = atk * .75 / 1.6;

it('医疗阿米娅 S2：开技法伤先吃单目标加攻，32秒真伤后恢复法伤，全战只开一次', () => {
  // 7级技能25−10=15秒首开。先按一个敌人加25%攻，开技170%法伤过25法抗，
  // 之后32秒每1.6秒一次真伤；命中数上限2对单Boss只有1段。120秒时只开过一次。
  const opening = atk * 1.25 * 1.7 * .75, active = atk * 1.25 / 1.6;
  const r = calculate({ ...input, durationSec: 120 });
  expect(r.normal.dps).toBeCloseTo(normal, 8);
  expect(r.skill!.components.map(c => c.damageType)).toEqual(['arts', 'true']);
  expect(r.skill!.dps).toBeCloseTo(opening / 32 + active, 8);
  expect(r.totalDamage.value).toBeCloseTo((120 - 32) * normal + opening + 32 * active, 7);
  expect(calculate({ ...input, durationSec: 15 }).totalDamage.value).toBeCloseTo(15 * normal + opening, 7);
  expect(r.cycle).toBeNull();
});

it('医疗阿米娅 S1：咒愈师按攻速提升结算法伤，治疗不扣 Boss 生命', () => {
  // 七级加60攻速，攻击间隔由1.6秒缩短到1秒。开场40秒后开启50秒。
  const r = calculate({ ...input, skillId: 'skchr_amiya3_1', durationSec: 60 });
  expect(r.normal.dps).toBeCloseTo(normal, 8);
  expect(r.skill!.components.map(c => c.damageType)).toEqual(['arts']);
  expect(r.skill!.dps).toBeCloseTo(atk * .75, 8);
  expect(r.totalDamage.value).toBeCloseTo(40 * normal + 20 * atk * .75, 7);
});
