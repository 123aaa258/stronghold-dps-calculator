import { describe, expect, it } from 'vitest';
import operatorsJson from '../../data/generated/operators.json';
import type { CalcInput, OperatorData } from '../types.ts';
import { calculate } from '../calc.ts';
import { applyGarrisons } from './garrisons.ts';
import { battleEffects } from './common.ts';

const operators = operatorsJson as unknown as OperatorData[];

it.each([
  ['a', 19, 1, 0], ['a', 20, 1, .01], ['b', 29, 1, .02], ['b', 30, 0, 0],
] as const)('克莱门莎%s阶，阿戈尔%d层、%d人在场时侵蚀冷却速度增量为%s', (tier, stacks, activeChars, bonus) => {
  const effects = battleEffects();
  applyGarrisons(effects, [`garrison_65_${tier}`], [{ bondId: 'egirShip', stacks, activeChars }]);
  expect(effects.erosionRecoverySpeed ?? 0).toBeCloseTo(bonus);
});

it.each([['a', 10], ['b', 20]] as const)('玛恩纳%s阶部署特质按真实时限：部署后100秒内基础攻击', (tier, atk) => {
  // 描述“每叠加5层，本干员部署后100秒内基础攻击力+10(+20)”：7层→floor(7/5)=1档，限时100秒，不按全程。
  const effects = battleEffects();
  applyGarrisons(effects, [`garrison_71_${tier}`], [{ bondId: 'kazimierzShip', activeChars: 3, stacks: 7 }]);
  expect(effects.stats).toHaveLength(0);
  expect(effects.timedStats).toEqual([{ until: 100, modifier: { stat: 'atk', bucket: 'direct', value: atk, source: `garrison:garrison_71_${tier}` } }]);
});

it('逻各斯只合并已开启的奥术与远见，之后每满三层加二攻速', () => {
  for (const [arcane,vision,speed] of [[1,1,2],[1,0,0],[0,1,0]]) {
    const effects=battleEffects();
    applyGarrisons(effects,['garrison_92_b'],[{bondId:'arcaneShip',activeChars:arcane!,stacks:2},{bondId:'visiShip',activeChars:vision!,stacks:1}]);
    expect(effects.stats.filter(m=>m.stat==='attackSpeed').reduce((sum,m)=>sum+m.value,0)).toBe(speed);
  }
});

describe('部署触发壳与被引用卫戍特质去重', () => {
  it.each([
    { name: '乌尔比安', shell: '63', stat: 'atk', bucket: 'pct', value: .01, panel: 1.01 },
    { name: '深巡', shell: '60', stat: 'attackSpeed', bucket: 'direct', value: 1, panel: 101 },
  ] as const)('$name 两阶都只计一次，且不依赖壳与效果的排列顺序', ({ name, shell, stat, bucket, value, panel }) => {
    const operator = operators.find(o => o.name === name)!;
    for (const tier of ['a', 'b'] as const) {
      const bonds = [{ bondId: 'egirShip', stacks: tier === 'a' ? 20 : 10, activeChars: 1 }];
      const source = `garrison:garrison_${shell}_${tier}`;
      // 手算：普通 floor(20/20)=1、进阶 floor(10/10)=1；乌尔比安 +1%攻击，深巡 +1攻速，均持续30秒。
      for (const ids of [operator.tiers[tier].garrisonIds, [...operator.tiers[tier].garrisonIds].reverse()]) {
        const effects = battleEffects();
        applyGarrisons(effects, ids, bonds);
        expect(effects.stats).toEqual([]);
        expect(effects.timedStats).toEqual([{ until: 30, modifier: { stat, bucket, value, source } }]);
      }
      const result = calculate({ charId: operator.charId, tier, skillId: operator.skillIds[1]!, bonds,
        equips: [], bossId: 'boss_1', modeId: 'mode_single_10' });
      const steps = result.normal.stats.derivation[stat].filter(s => s.source?.startsWith('garrison:'));
      expect(steps).toHaveLength(1);
      expect(steps[0]).toMatchObject({ source, value });
      expect(result.normal.stats[stat]).toBeCloseTo(stat === 'atk' ? operator.tiers[tier].attributes.atk * panel : panel);
    }
  });

  it('零人在场时留存的层数与空盟约产生相同的卫戍效果', () => {
    const effects = battleEffects();
    const baseline = battleEffects();
    const ids = ['garrison_09_a'];
    applyGarrisons(effects, ids, [{ bondId: 'arcaneShip', stacks: 50, activeChars: 0 }]);
    applyGarrisons(baseline, ids, []);
    expect(effects).toEqual(baseline);
  });

  it('乌尔比安部署加攻在30秒到期，之后不再计入伤害', () => {
    const input: CalcInput = { charId: 'char_4145_ulpia', tier: 'b', skillId: 'skchr_ulpia_2',
      bonds: [{ bondId: 'egirShip', stacks: 10, activeChars: 1 }], equips: [],
      bossId: 'boss_1', modeId: 'mode_single_10' };
    // 手算：S2在78秒开启；A=1568.056179775281，DEF=1000，间隔2.5秒。
    // 0~30秒DPS=(1.01A-1000)/2.5，30~60秒DPS=(A-1000)/2.5。
    const atk = 1568.056179775281;
    const buffed = (atk * 1.01 - 1000) / 2.5;
    const normal = (atk - 1000) / 2.5;
    expect(calculate({ ...input, durationSec: 30 }).totalDamage.value).toBeCloseTo(30 * buffed, 8);
    expect(calculate({ ...input, durationSec: 60 }).totalDamage.value).toBeCloseTo(30 * buffed + 30 * normal, 8);
  });
});
