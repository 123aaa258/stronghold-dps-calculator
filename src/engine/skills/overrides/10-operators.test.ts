import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json';
import { calculate } from '../../calc.ts';
import type { OperatorData } from '../../types.ts';
import { batch } from './batches/b10.ts';

it('深靛普通一技能第179秒解除束缚，释放普攻与三份储能', () => {
  const op = (operators as unknown as OperatorData[]).find(o => o.charId.endsWith('_indigo'))!;
  const at = (durationSec: number) => calculate({ charId: op.charId, skillId: op.skillIds[0]!, tier: 'a',
    equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10', durationSec }).totalDamage.value;
  expect(at(179.01) - at(178.99)).toBeCloseTo(4 * .75 * op.tiers.a.attributes.atk, 6);
});

const p = (atk: number) => Math.max(.05 * atk, atk - 1000);
const m = (atk: number) => .75 * atk;
// 精锐 7 级，胄防御 1000、法抗 25。每行独立给出每个技能主目标的一段伤害与段数。
const expected: Record<string, (a: number) => number[][]> = {
  pallas: a => [[p(a*1.3*1.45),2], [p(a*1.8),1], [p(a*2.1),1]],
  tocka: a => [[p(a),1], [p(a),1], [p(a*1.9),1]],
  vvana: a => [[m(a*1.7)*1.16,2], [m(a*1.3)*1.16,1], [m(a*1.75)*1.16,2]],
  mizuki: a => [[p(2.3*a),1], [p(1.2*a),1], [p(2.05*a),1]],
  f12yin: a => [[Math.max(p(a*2),m(a*2)),1], [Math.max(p(a*1.5),m(a*1.5)),1], [Math.max(p(a*1.7),m(a*1.7)),2]],
  archet: a => [[p(2*a),1], [p(1.2*a),5], [p(1.15*a),3]],
  pithst: a => [[m(1.4*a),1]],
  christ: a => [[m(1.2*a),1], [m(.85*a),1]],
  tinman: a => [[m(.6*a),1], [m(.8*a),1]],
  indigo: a => [[m(.4*a),1], [m(a),1]],
  whitew: a => [[p(1.55*a),1], [m(1.9*a),1]],
};
for (const op of (operators as unknown as OperatorData[]).filter(o => o.charId in batch)) {
  it(op.name + '两阶空装全技能与精锐单段复核', () => {
    const panels = expected[op.charId.split('_')[2]!]!(op.tiers.b.attributes.atk);
    for (const [i,skillId] of op.skillIds.entries()) for (const tier of ['a','b'] as const) {
      const r = calculate({charId:op.charId, skillId, tier, equips:[], bonds:[], bossId:'boss_1', modeId:'mode_single_10', durationSec:180});
      expect(r.model).toBe('override');
      expect(r.totalDamage.value).toBeGreaterThan(0);
      expect(Number.isFinite(r.totalDamage.value)).toBe(true);
      if (tier === 'b') {
        const hit = r.skill!.components[0]!;
        expect(hit.perHit, skillId).toBeCloseTo(panels[i]![0]!,6);
        expect(hit.hitsPerAttack).toBe(panels[i]![1]);
      }
    }
  });
}
