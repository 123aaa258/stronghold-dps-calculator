import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import { calculate } from '../../calc.ts';

// 裸装精锐七级、胄防御 1000 / 法抗 25。每格直接列第一轮技能本体的单段手算式与段数。
// a 来自精锐基础攻击，p 独立计算逐段扣防和 5% 保底，m 独立结算法抗。
const p = (attack: number, def = 1000) => Math.max(attack - def, attack * .05);
const m = (attack: number, res = 25) => attack * (1 - res / 100);
type Expected = (a: number) => number[][];
const hand: Record<string, Expected> = {
  clemnt: a => [[p(a * 2.25)], [p(a * 2.3 * 1.35)], [p(a * 2 * 1.35)]],
  lisa: a => [[m(a * 1.6) * 1.2], [m(a * 1.3) * 1.2], [0]],
  pepe: a => [[p(a * 1.16 * 2.3)], [p(a * 1.86)], [p(a * 2.96)]],
  weedy: a => [[p(a * 1.35)], [p(a * 2.7)], [m(a * 3.2)]],
  helage: a => [[p(a * 1.45), 2], [p(a * 1.5), 2], [p(a * 1.7)]],
  buildr: a => [[0], [p(a * 1.28)]],
  robrta: a => [[p(a * 1.35)], [0]],
  liesel: a => [[m(a * 1.8)], [m(a * 1.6)]],
  gravel: a => [[p(a)], [p(a)]],
  cammou: a => [[m(a * 1.5)], [m(a * 1.58)]],
  estell: a => [[p(a * 1.5)], [p(a * 2.15)]],
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
