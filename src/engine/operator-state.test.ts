import { expect, it } from 'vitest';
import operators from '../data/generated/operators.json' with { type: 'json' };
import { calculate } from './calc.ts';
import { resolveOperatorState } from './operator-state.ts';
import { rankAll } from './rank.ts';
import type { CalcInput, OperatorData } from './types.ts';

const conditions = { bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], durationSec: 30 };
const eyja: CalcInput = { ...conditions, charId: 'char_180_amgoat', tier: 'b', skillId: 'skchr_amgoat_3', equips: [] };
const roster = operators as unknown as OperatorData[];
const baseAtk = 535 + (645 - 535) * 59 / 89 + 40;

it('艾雅法拉精锐火山按潜能门槛切换面板、炎息和乱火，再叠自身练度', () => {
  // 精二60、信赖0、模组1攻击+40。3号潜能索引加27攻，5号把炎息14%升至16%。
  // 2号起乱火从7..15变为10..19，均值从11变为14.5，技能初动从29秒变为25.5秒。
  // 火山+85%与炎息加算；胄法抗25减模组穿透10，剩85%法伤；单目标每0.5秒一击。
  for (const potential of [0, 1, 2, 3, 4, 5]) {
    const result = calculate({ ...eyja, potential, cultivation: 2060 });
    const panel = (baseAtk + (potential >= 3 ? 27 : 0)) * 1.1;
    const talent = potential === 5 ? .16 : .14;
    const normal = panel * (1 + talent) * .85 / 1.6;
    const skill = panel * (1 + talent + .85) * .85 / .5;
    const wait = potential >= 2 ? 25.5 : 29;
    expect(result.normal.stats.atk).toBeCloseTo(panel * (1 + talent), 8);
    expect(result.skill!.dps).toBeCloseTo(skill, 8);
    expect(result.totalDamage.value).toBeCloseTo(wait * normal + (30 - wait) * skill, 8);
    expect(result.skill!.stats.derivation.atk).toContainEqual(expect.objectContaining({
      label: '自身练度：精二 60 级 攻击 ×1.1', op: 'mul', value: 1.1,
    }));
  }
  const original = calculate(eyja);
  expect(original.normal.stats.atk).toBeCloseTo(baseAtk * 1.14, 8);
  expect(original.skill!.dps).toBeCloseTo(baseAtk * 1.99 * .85 / .5, 8);
  expect(calculate({ ...eyja, potential: 0, cultivation: 1 })).toEqual({ ...original, input: { ...eyja, potential: 0, cultivation: 1 } });
});

it('四档练度分别映射攻击、防御和生命，使用潜能及模组之后的面板', () => {
  const operator = roster.find(op => op.charId === eyja.charId)!;
  // 精二60生命1359+(1743−1359)×59/89，模组+130；防御109+(122−109)×59/89。
  const hp = 1359 + 384 * 59 / 89 + 130;
  const defense = 109 + 13 * 59 / 89;
  for (const [cultivation, atkMul, defMul, hpMul] of [
    [1, 1, 1, 1], [1001, 1.05, 1.05, 1], [2001, 1.1, 1.05, 1.05], [2060, 1.1, 1.1, 1.1],
  ]) {
    const { tier } = resolveOperatorState(operator, { ...eyja, cultivation, potential: 5 });
    expect(tier.attributes.atk).toBeCloseTo((baseAtk + 27) * atkMul, 8);
    expect(tier.attributes.def).toBeCloseTo(defense * defMul, 8);
    expect(tier.attributes.maxHp).toBeCloseTo(hp * hpMul, 8);
  }
});

it('通用模型读取艾丽妮满潜天赋，攻速增量只解释一次', () => {
  // 剑之潮满潜的黑板为21；说明里的「（+3）」是18→21的差值。
  const input = { ...eyja, charId: 'char_4009_irene', skillId: 'skchr_irene_3' };
  expect(calculate(input).normal.stats.attackSpeed).toBe(118);
  const full = calculate({ ...input, potential: 5 });
  expect(full.normal.stats.attackSpeed).toBe(121);
  expect(full.notes.some(note => note.includes('未覆盖') && note.includes('攻击速度+21'))).toBe(false);
});

it('四名自选的普通阶全结果一致，缺省逐项等同六阶，非自选忽略费用阶', () => {
  for (const op of roster.filter(o => o.diy)) {
    for (const tier of ['a', 'b'] as const) for (const skillId of op.skillIds) {
      const input = { ...eyja, charId: op.charId, tier, skillId };
      const original = calculate(input);
      const six = { ...input, diyShopLevel: 6 };
      expect(calculate(six)).toEqual({ ...original, input: six });
      const five = { ...input, diyShopLevel: 5 };
      const result = calculate(five);
      if (tier === 'a') expect(result).toEqual({ ...original, input: five });
      else expect(result.normal.stats.derivation.atk).toContainEqual(expect.objectContaining({ label: '5 阶自选：模组 1 级' }));
    }
  }
  const input = { ...eyja, diyShopLevel: 5 };
  expect(calculate(input)).toEqual({ ...calculate(eyja), input });
});

it('排行中所有行保留练度及潜能，四名自选与艾雅法拉可按同一条件复算', () => {
  const options = { ...conditions, diyShopLevel: 5, cultivation: 2060, potential: 5 };
  const rows = rankAll(options);
  expect(rows.every(({ input }) => input.cultivation === 2060 && input.potential === 5)).toBe(true);
  for (const op of roster.filter(o => o.diy || o.charId === eyja.charId)) {
    const input = { ...options, tier: 'b' as const, charId: op.charId, skillId: op.skillIds[2]!, equips: [], uniEquipId: op.tiers.b.uniEquipId };
    const row = rows.find(r => r.charId === op.charId && r.tier === input.tier && r.skillId === input.skillId && r.uniEquipId === input.uniEquipId)!;
    expect(row.input).toEqual(input);
    expect(row.result).toEqual(calculate(input));
    expect(row.result.skill!.dps).not.toBeCloseTo(calculate({ ...input, potential: 0, cultivation: 1 }).skill!.dps);
  }
});
