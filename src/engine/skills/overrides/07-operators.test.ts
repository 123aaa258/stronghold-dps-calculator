import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import { calculate } from '../../calc.ts';

it('隐德来希二技能的单血镰持续刷新一份萃血法伤', () => {
  const op = operators.find(o => o.charId.endsWith('_etlchi'))!;
  const result = calculate({ charId: op.charId, skillId: op.skillIds[1]!, tier: 'b',
    equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10' });
  const dots = result.skill!.components.filter(c => c.label === '萃血');
  expect(dots).toHaveLength(1);
  expect(dots[0]!.dps).toBeCloseTo(200 * .75, 8);
});

// 裸装精锐七级、胄防御 1000 / 法抗 25。每格直接列第一轮技能本体的单段手算式与段数。
// a 来自精锐基础攻击，p 独立计算逐段扣防和 5% 保底，m 独立结算法抗。
const p = (attack: number, def = 1000) => Math.max(attack - def, attack * .05);
const m = (attack: number, res = 25) => attack * (1 - res / 100);
type Expected = (a: number) => number[][];
const hand: Record<string, Expected> = {
  mcnist: a => [[p(a * 1.1), 5], [p(a * 2.2)], [m(a * 3.2 * 2.4)]],
  glady: a => [[p(a * 1.8)], [p(a * 1.5)], [m(a)]],
  etlchi: a => [[p(a * 1.45), 2], [p(a * 1.7)], [p(a * 2.1)]],
  fartth: a => [[p(a * 1.49) * 1.15], [p(a * 1.15) * 1.15], [p(a * 2.15) * 1.15 * 1.3]],
  judge: a => [[p(a)], [m(a * 1.1)], [p(a * 4.2)]],
  vulpis: a => [[p(a * 1.08)], [m(a * 1.08 * 2.45)], [p(a * 1.88)]],
  slbell: a => [[m(a)], [m(a, 25 * .74)]],
  alga: a => [[p(a * 1.45), 2], [p(a * 1.5)]],
  snhunt: a => [[p(a * 1.2 * 2)], [p(a * 2.1), 2]],
  sidero: a => [[0], [m(a * 1.8) * 1.1]],
  bison: a => [[p(a)], [0]],
};

for (const [id, manual] of Object.entries(hand)) {
  const operator = operators.find(o => o.charId.endsWith('_' + id))!;
  const expected = manual(operator.tiers.b.attributes.atk);
  for (const [index, skillId] of operator.skillIds.entries()) {
    it(operator.name + ' S' + (index + 1) + ' 裸装单段、段数和双阶180秒总伤', () => {
      for (const tier of ['a', 'b'] as const) {
        const result = calculate({ charId: operator.charId, tier, skillId, equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10' });
        expect(result.model).toBe('override');
        expect(Number.isFinite(result.totalDamage.value)).toBe(true);
        expect(result.totalDamage.value).toBeGreaterThanOrEqual(0);
        if (tier === 'a') continue;
        const body = (result.skill ?? result.normal).components[0]!;
        const [perHit, hits = 1] = expected[index]!;
        expect(body.perHit).toBeCloseTo(perHit!, 6);
        expect(body.hitsPerAttack).toBe(hits);
      }
    });
  }
}
