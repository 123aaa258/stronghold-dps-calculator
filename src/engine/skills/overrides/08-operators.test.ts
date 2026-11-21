import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import { calculate } from '../../calc.ts';

// 裸装精锐七级、胄防御 1000 / 法抗 25。每格直接列第一轮技能本体的单段手算式与段数。
// a 来自精锐基础攻击，p 独立计算逐段扣防和 5% 保底，m 独立结算法抗。
const p = (attack: number, def = 1000) => Math.max(attack - def, attack * .05);
const m = (attack: number, res = 25) => attack * (1 - res / 100);
type Expected = (a: number) => number[][];
const hand: Record<string, Expected> = {
  nearl2: a => [[p(a * 1.55 * 1.15, 720)], [p(a * 2.2 * 1.15, 720)], [a * 2 * 1.15]],
  halo2: a => [[m(a * 1.6) * 1.14], [m(a * 1.3) * 1.14], [m(a * 1.5) * 1.14]],
  demetr: a => [[p(a * 2.1, 720), 2], [p(a * 1.7, 650)], [p(a * 2.4, 650)]],
  ghost2: a => [[p(a * 2.2)], [p(a * 2)], [p(a * 3)]],
  zumama: a => [[p(a * 1.18 * 1.15)], [p(a * 2.3 * 1.15)], [p(a * 2.7 * 1.15)]],
  vigil: a => [[0], [0], [m(a * 1.5), 3]],
  cathy: a => [[p(a * 1.11)], [0]],
  halo: a => [[m(a * 1.1)], [m(a * 1.25)]],
  ju: a => [[p(a * 1.15)], [p(a * 1.15 * 1.75)]],
  utage: a => [[0], [m(a * 1.8)]],
  branch: a => [[p(a)], [p(a * 2.2)]],
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
