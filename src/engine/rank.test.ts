import { describe, expect, it } from 'vitest';
import bosses from '../data/generated/bosses.json';
import type { BossData, OperatorData } from './types.ts';
import operators from '../data/generated/operators.json';
import { calculate, rankAll } from './index.ts';

const common = { bossId: 'boss_1', modeId: 'mode_single_10', durationSec: 35 };
const skillful = { bondId: 'skillfulShip', stacks: 5, activeChars: 2, inRange: false };
const sunt = { bondId: 'suntShip', stacks: 0, activeChars: 2 };
const solo = { bondId: 'soloShip', stacks: 50, activeChars: 0 };
const roster = operators as unknown as OperatorData[];
const expected = roster.flatMap(op => op.skillIds.flatMap(skillId =>
  [null, ...(op.uniEquips?.map(option => option.uniEquipId) ?? [null])]
    .map((id, index) => [op.charId, index ? 'b' : 'a', skillId, id].join('/'))));

describe('全干员无装备排行', { timeout: 30_000 }, () => {
  it('覆盖全部阶级、技能和生命周期，榜单输入可以复算', () => {
    const rows = rankAll({ ...common, bonds: [skillful, sunt, solo] });
    expect(rows.map(row => [row.charId, row.tier, row.skillId, row.uniEquipId].join('/')).sort()).toEqual([...expected].sort());
    expect(rows.every(row => row.uniEquipId !== undefined && row.uniEquipId === row.input.uniEquipId)).toBe(true);
    const alternate = rows.find(row => row.uniEquipId === 'uniequip_002_logos')!;
    expect(calculate(alternate.input)).toEqual(alternate.result);
    const diyIds = operators.filter(op => 'diy' in op && op.diy).map(op => op.charId);
    const diyRows = rows.filter(row => diyIds.includes(row.charId));
    expect(diyRows).toHaveLength(24);
    expect(diyRows.every(row => row.result.model === 'override')).toBe(true);
    expect(rows.every(({input}) => input.equips.length === 0)).toBe(true);
    for (const index of [0, Math.floor(rows.length / 2), rows.length - 1]) {
      const { input, result } = rows[index]!;
      expect(input.bonds).toEqual([{ ...skillful, inRange: true }, sunt, solo]);
      expect(result).toEqual(calculate(input));
    }
    expect(skillful.inRange).toBe(false);
    for (const { result } of rows) {
      const values = [result.normal.dps, result.skill?.dps ?? 0, result.cycle?.avgDps ?? 0, result.totalDamage.value];
      expect(values.every(dps => Number.isFinite(dps) && dps >= 0), result.input.skillId).toBe(true);
    }
    // 艾丝黛尔既非灵巧也非绝技成员，灵巧5层 +15攻速，绝技2人仅精锐 +30%基础攻击。
    for (const tier of ['a', 'b'] as const) {
      const { input, result } = rows.find(r => r.charId === 'char_127_estell' && r.tier === tier)!;
      const base = calculate({ ...input, bonds: [] }).normal.stats;
      expect(result.normal.stats.attackSpeed).toBe(base.attackSpeed + 15);
      expect(result.normal.stats.atk).toBeCloseTo(base.atk * (tier === 'b' ? 1.3 : 1));
    }
  });

  it('隐秘核心机制开关透传到每行，无减伤排行能复算', () => {
    const hidden = (bosses as BossData[]).find(boss => boss.bossId === 'boss_9')!;
    const shield = hidden.mechanics!.find(mechanic => mechanic.effect?.damageTakenScale === .2)!;
    const bossMechanics = { [shield.id]: false };
    const rows = rankAll({ ...common, bonds: [], bossId: hidden.bossId, bossMechanics });
    expect(rows.every(row => row.input.bossMechanics?.[shield.id] === false)).toBe(true);
    const row = rows.find(row => row.charId === 'char_129_bluep')!;
    expect(row.result).toEqual(calculate(row.input));
    expect(row.result.normal.dps).toBeCloseTo(calculate({ ...row.input, bossMechanics: {} }).normal.dps * 5);
    for (const op of operators.filter(op => 'diy' in op && op.diy)) {
      const diy = rows.find(r => r.charId === op.charId && r.tier === 'b' && r.skillId === op.skillIds[2])!;
      expect(diy.result.normal.dps).toBeCloseTo(calculate({ ...diy.input, bossMechanics: {} }).normal.dps * 5);
    }
  });

  it('跳过一个缺少等级的技能，保留其余阶级和技能', async () => {
    const { default: skills } = await import('../data/generated/skills.json');
    const op = operators[0]!;
    const skillId = op.skillIds[1]! as keyof typeof skills;
    const levels: Record<string, unknown> = skills[skillId].levels;
    const level = String(op.tiers.a.skillLevel);
    const original = levels[level];
    try {
      delete levels[level];
      const rows = rankAll({ ...common, bonds: [] });
      expect(rows.some(r => r.charId === op.charId && r.skillId === skillId && r.tier === 'a')).toBe(false);
      expect(rows.some(r => r.charId === op.charId && r.skillId === skillId && r.tier === 'b')).toBe(true);
      expect(rows).toHaveLength(expected.length - 1);
    } finally {
      levels[level] = original;
    }
  });
});
