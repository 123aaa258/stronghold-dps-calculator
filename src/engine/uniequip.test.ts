import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import operators from '../data/generated/operators.json';
import tokens from '../data/generated/tokens.json';
import { calculate } from './calc.ts';
import { resolveOperatorState, resolveTokenTier } from './operator-state.ts';
import type { CalcInput, OperatorData, TokenData } from './types.ts';

const roster = operators as unknown as OperatorData[];
const conditions = { bossId: 'boss_1', modeId: 'mode_single_10', cultivation: 2060, potential: 5, bonds: [], equips: [], durationSec: 30 };
function inputFor(name: string, icon: string, skill = 3): CalcInput {
  const op = roster.find(entry => entry.name === name)!;
  return { ...conditions, charId: op.charId, tier: 'b', skillId: op.skillIds[skill - 1]!,
    uniEquipId: op.uniEquips!.find(module => module.typeIcon === icon)!.uniEquipId };
}

it.each([['CCR-X', 40, .85, 1], ['CCR-Y', 25, .75, 1 + 1 / 1.6]] as const)(
  '艾雅法拉 %s：火山伤害、命中回技、初动与完整循环分别手算', (icon, flat, res, spRate) => {
    const result = calculate(inputFor('艾雅法拉', icon));
    const attack = (535 + (645 - 535) * 59 / 89 + flat + 27) * 1.1;
    const normal = attack * 1.16 * res / 1.6, skill = attack * 2.01 * res / .5;
    const first = (80 - 40 - 14.5) / spRate, recovery = 80 / spRate;
    expect(result.normal.dps).toBeCloseTo(normal, 8);
    expect(result.skill!.dps).toBeCloseTo(skill, 8);
    expect(result.cycle!.spRecoverSec).toBeCloseTo(recovery, 8);
    expect(result.totalDamage.value).toBeCloseTo(normal * first + skill * Math.min(15, 30 - first) + normal * Math.max(0, 15 - first), 8);
    // 循环平均 = 30 秒窗口总伤 ÷ 30。
    expect(result.cycle!.avgDps).toBeCloseTo(result.totalDamage.value / 30, 8);
    expect(result.skill!.stats.derivation.atk).toContainEqual(expect.objectContaining({ label: `模组：${icon} 1 级` }));
  });

it.each([['CCR-Y', 60, .8, .7], ['CCR-D', 67, .6, .65]] as const)(
  '逻各斯 %s：满潜逐击加165再过法抗，分别结算两次随机选取和凋亡', (icon, flat, hits, scale) => {
    const input = inputFor('逻各斯', icon);
    const attack = (556 + (671 - 556) * 59 / 89 + flat + 27) * 1.1;
    const arts = (panel: number) => ((panel + 165) + hits * (scale * panel + 165)) * .85 / 1.6;
    const normal = arts(attack), skill = arts(3.2 * attack);
    const result = calculate(input);
    expect(result.model).toBe('override');
    expect(result.normal.dps).toBeCloseTo(normal, 8);
    const talent = result.normal.components.find(part => part.source === 'talent:logos:1')!;
    expect(talent.hitsPerAttack).toBe(hits);
    if (icon === 'CCR-Y') {
      const first = 27 / (1 + (1 + hits) / 1.6);
      expect(result.skill!.dps).toBeCloseTo(skill, 8);
      expect(result.totalDamage.value).toBeCloseTo(normal * first + skill * (30 - first), 8);
    } else {
      const first = 27, toBurst = (2000 / .08 - first * normal) / skill;
      const extra = 800 + .6 * .6 * 3.2 * attack / 1.6;
      expect(result.elemental!.perSec).toBeCloseTo(.08 * normal, 8);
      expect(calculate({ ...input, durationSec: first + toBurst - .1 }).totalDamage.value).toBeCloseTo(25000 - .1 * skill, 6);
      expect(calculate({ ...input, durationSec: first + toBurst + 1 }).totalDamage.value).toBeCloseTo(25000 + skill + extra, 6);
    }
  });

it('六阶史尔特尔：AFT-X 穿抗但受阻挡时不加攻速，AFT-Y 只对自身阻挡目标施加法术脆弱', () => {
  const left = calculate(inputFor('史尔特尔', 'AFT-X')), right = calculate(inputFor('史尔特尔', 'AFT-Y'));
  expect([left.model, right.model]).toEqual(['override', 'override']);
  expect(left.skill!.stats.attackSpeed).toBe(100);
  expect(left.skill!.components[0]!.perHit).toBeCloseTo(left.skill!.stats.atk, 8);
  expect(right.skill!.components[0]!.perHit).toBeCloseTo(right.skill!.stats.atk * .97 * 1.1, 8);
  expect(left.skill!.dps).not.toBe(right.skill!.dps);
});

it('夕 SPC-Y 无法确定小自在的相邻格时退回通用并解释原因；锏 SWO-Y 对战栗免疫只保留固定穿防', () => {
  const dusk = calculate(inputFor('夕', 'SPC-Y'));
  expect(dusk.model).toBe('generic');
  expect(dusk.accuracy).toBe('approx');
  expect(dusk.notes.some(note => note.includes('相邻可部署格'))).toBe(true);
  const immune = calculate({ ...inputFor('锏', 'SWO-Y'), bossId: 'boss_2' });
  expect(immune.model).toBe('override');
  expect(immune.skill!.components[0]!.derivation).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: '攻击者固定穿透', value: -70 }), expect.objectContaining({ label: '攻击者百分比穿透', value: 1 }),
  ]));
});

it('显式默认、缺省、无效（含别人的模组）逐项相同；普通阶不受自选影响', () => {
  const explicit = inputFor('逻各斯', 'CCR-Y');
  const { uniEquipId, ...omitted } = explicit;
  for (const tier of ['a', 'b'] as const) {
    const previous = calculate({ ...omitted, tier });
    for (const id of [uniEquipId, 'invalid', 'uniequip_003_amgoat', ...(tier === 'a' ? ['uniequip_002_logos'] : [])]) {
      const input = { ...omitted, tier, uniEquipId: id };
      expect(calculate(input)).toEqual({ ...previous, input });
    }
  }
});

it('未选模组的 742 份结果匹配默认计算摘要，模组说明步骤不计入摘要', () => {
  const { bossId, modeId, cultivation, potential } = conditions;
  const baseline = { bossId, modeId, durationSec: 30, bonds: [], cultivation, potential };
  const expected = { a: 'c697916cebd567220977d3aff03a425cb036828f4d177491b95028a25527f0eb', b: '047e5e2182776be5b241df9336b80475ca12e775b7ef8da010b773771005208d' };
  for (const tier of ['a', 'b'] as const) {
    const digest = createHash('sha256');
    for (const { charId, skillIds } of roster) for (const skillId of skillIds) {
      const result = calculate({ ...baseline, charId, tier, skillId, equips: [] });
      for (const phase of [result.normal, result.skill]) if (phase) {
        const { derivation } = phase.stats;
        derivation.atk = derivation.atk.filter(step => !(step.op === 'info' && step.source.startsWith('uniequip_')));
      }
      digest.update(`${charId}/${tier}/${skillId}:${createHash('sha256').update(JSON.stringify(result)).digest('hex')}\n`);
    }
    expect(digest.digest('hex'), tier).toBe(expected[tier]);
  }
}, 30_000);

it('妮芙 PRI-Y：失魂每跳与笞心击附伤各触发一次奥术，无来源的凋亡不触发', () => {
  const input = inputFor('妮芙', 'PRI-Y', 1);
  const result = calculate({ ...input, equips: ['chess_item_3_07_e_b', 'chess_item_6_03_e_a'], bonds: [
    { bondId: 'arcaneShip', stacks: 1, activeChars: 2 }, { bondId: 'skillfulShip', stacks: 50, activeChars: 2, inRange: true },
  ] });
  const freq = (source: string) => result.skill!.components.find(part => part.source === source)!.hitsPerSec;
  const source = `skill:${input.skillId}`;
  expect(freq('talent:nymph:soul')).toBeGreaterThan(0);
  expect(freq('bond:arcaneShip')).toBeCloseTo(freq(source) + freq(`${source}:elemental`) + freq('talent:nymph:soul'), 8);
});

it('空弦 ISW-A / MAR-X：地面胄上只比面板和帧间隔；佩佩 RA-A 同样没有模组特性及天赋', () => {
  const attack = (525.9550561797753 + 27) * 1.1;
  for (const [icon, frames] of [['ISW-A', 28], ['MAR-X', 30]] as const) {
    const input = inputFor('空弦', icon), result = calculate(input);
    expect(result.normal.stats.atk).toBeCloseTo(attack, 8);
    expect(result.normal.components[0]!.dps).toBeCloseTo(attack * .05 / (frames / 30), 8);
  }
  for (const [name, icon, label] of [['空弦', 'ISW-A', '集成战略'], ['佩佩', 'RA-A', '生息演算']] as const) {
    const op = roster.find(entry => entry.name === name)!;
    const input = inputFor(name, icon);
    expect(op.uniEquips!.find(option => option.uniEquipId === input.uniEquipId)!.attrOnly).toBe(true);
    const { tier } = resolveOperatorState(op, input);
    expect(tier.uniEquipId).toBe(input.uniEquipId);
    expect(tier.trait?.equipMods ?? []).toEqual([]);
    expect(tier.talents.every(talent => !talent.equipMods.length)).toBe(true);
    expect(calculate(input).normal.stats.derivation.atk).toContainEqual(expect.objectContaining({ label: `${label}模组：仅计属性` }));
  }
});

it('小自在先按夕的模组取绝对属性和新增天赋，再叠自己的潜能；换回 ISW-A 不残留回技', () => {
  const op = roster.find(entry => entry.name === '夕')!, token = tokens.token_10015_dusk_drgn as TokenData;
  for (const [icon, attack, sp] of [['SPC-Y', 423, 1], ['ISW-A', 398, undefined]] as const) {
    const { tier } = resolveOperatorState(op, inputFor('夕', icon));
    const summon = resolveTokenTier(token, op, tier)!;
    expect(summon.attributes.atk).toBe(attack);
    expect(summon.talents![0]!.blackboard.nums.max_stack_cnt).toBe(18);
    expect(summon.talents![1]?.blackboard.nums.sp).toBe(sp);
  }
});
