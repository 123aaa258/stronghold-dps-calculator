import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { extractBosses } from './bosses.ts';
import type { BossData } from '../../src/engine/types.ts';

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const field = (m_value: unknown, m_defined = true) => ({ m_value, m_defined });
async function fixture(options: { different?: boolean; hpOnly?: boolean; rune?: boolean; missing?: boolean } = {}) {
  const cache = await mkdtemp(join(tmpdir(), 'boss-extract-'));
  temporary.push(cache);
  const enemy = { levelType: field('BOSS'), name: field('测试敌人'), description: field('机制描述'), attributes: {
    def: field(100), magicResistance: field(10), maxHp: field(1000),
    epResistance: field(0), epDamageResistance: field(0), stunImmune: field(true),
  }, talentBlackboard: [{ key: 'damage_resistance', value: 0.2, valueStr: null }],
  skills: [{ prefabKey: 'shield', cooldown: 10, blackboard: [{ key: 'target', value: 0, valueStr: 'enemy_test' }] }] };
  const activity = { autoChessData: { bossInfoDict: { boss_test: { enemyId: 'enemy_test' } } },
    activity: { AUTOCHESS: { act3autochess: { V3_1: {
      bossInfoDict: { boss_test: { bossId: 'boss_test', sortId: 1, isHidingBoss: false, bloodDataDict: { mode_single_1: 1234 } } },
      modeDataDict: Object.fromEntries(['mode_training_1', 'mode_single_1', 'mode_multi_normal'].map((modeId, sortId) => [modeId, { modeId, name: modeId, sortId, modeDifficulty: 'NORMAL', difficulty: 2 }])),
      battleDataDict: { mode_single_1: { 14: [{ bossId: 'boss_test', levelId: 'Activities/TEST/level_single' }] },
        ...((options.different || options.hpOnly) ? { mode_multi_normal: { 14: [{ bossId: 'boss_test', levelId: 'Activities/TEST/level_multi' }] } } : {}) },
    } } } } };
  const write = async (path: string, value: unknown) => { await mkdir(join(cache, path, '..'), { recursive: true }); await writeFile(join(cache, path), JSON.stringify(value)); };
  await write('excel/activity_table.json', activity);
  await write('excel/enemy_handbook_table.json', { enemyData: {} });
  await write('levels/enemydata/enemy_database.json', { enemies: [{ Key: 'enemy_test', Value: [{ level: 0, enemyData: enemy }, { level: 1, enemyData: { levelType: field('NORMAL', false), attributes: { def: field(200), magicResistance: field(0, false) } } }] }] });
  const level = { enemyDbRefs: [{ useDb: true, id: 'enemy_test', level: 1, overwrittenData: { attributes: { def: field(0, false), magicResistance: field(35) } } }],
    runes: options.rune ? [{ key: 'unknown_def_buff', blackboard: [{ key: 'def', value: 2 }] }] : null, optionalRunes: null, globalBuffs: null };
  if (!options.missing) await write('levels/activities/test/level_single.json', level);
  if (options.hpOnly) await write('levels/activities/test/level_multi.json', { ...level, enemyDbRefs: [{ ...level.enemyDbRefs[0], overwrittenData: { attributes: { magicResistance: field(35), maxHp: field(2000) } } }] });
  if (options.different) await write('levels/activities/test/level_multi.json', { ...level, enemyDbRefs: [{ ...level.enemyDbRefs[0], level: 0 }] });
  return cache;
}

describe('Boss 数据提取', () => {
  it('按 enemyDbRefs 等级继承，仅覆盖 m_defined 字段，保留免疫和原始机制', async () => {
    const { bosses, modes } = await extractBosses(await fixture());
    expect(modes.map(mode => mode.modeId)).toEqual(['mode_single_1', 'mode_multi_normal']);
    expect(modes[0]!.difficulty).toBe('NORMAL');
    expect(bosses[0]!.attributes).toEqual({ def: 200, magicResistance: 35, maxHp: 1000, level: 1, epResistance: 0, epDamageResistance: 0, immunities: { stunImmune: true } });
    expect(bosses[0]!.abilities.some(ability => ability.blackboard?.nums.damage_resistance === 0.2)).toBe(true);
    expect(bosses[0]!.abilities.some(ability => ability.blackboard?.strs?.target === 'enemy_test')).toBe(true);
    expect(bosses[0]!.attributeSource.join('\n')).toContain('overwrittenData');
    expect(bosses[0]!.verified).toBe(true);
    expect(bosses[0]!.levelType).toBe('BOSS');
  });
  it('跨模式仅 maxHp 不同仍共用面板，血量取 bloodDataDict', async () => {
    // 单人 HP=1000、多人 HP=2000，DEF=200、RES=35 相同 → 共用面板；模式 HP=1234。
    const { bosses } = await extractBosses(await fixture({ hpOnly: true }));
    expect(bosses[0]!.attributes).toMatchObject({ def: 200, magicResistance: 35 });
    expect(bosses[0]!.hpByMode.mode_single_1).toBe(1234);
  });
  it('跨模式属性不一致时不共用面板，并报告两个来源', async () => {
    const { bosses, issues } = await extractBosses(await fixture({ different: true }));
    expect(bosses[0]!.attributes).toBeNull();
    expect(bosses[0]!.verified).toBe(false);
    expect(issues.join('\n')).toContain('跨模式');
    expect(issues.join('\n')).toContain('mode_multi_normal');
  });
  it('未知符文保留原文并降低可信度，绝不猜乘区', async () => {
    const { bosses, issues } = await extractBosses(await fixture({ rune: true }));
    expect(bosses[0]!.attributes?.def).toBe(200);
    expect(bosses[0]!.verified).toBe(false);
    expect(bosses[0]!.attributeSource.join('\n')).toContain('unknown_def_buff');
    expect(issues.join('\n')).toContain('runes');
  });
  it('缺关卡时不把敌人数据库当已核实关卡属性', async () => {
    const { bosses, issues } = await extractBosses(await fixture({ missing: true }));
    expect(bosses[0]!.name).toBe('测试敌人');
    expect(bosses[0]!.attributes).toBeNull();
    expect(bosses[0]!.verified).toBe(false);
    expect(issues.join('\n')).toContain('缺少关卡');
  });
  it('部分模式缺失关卡时不从其余模式推断身份', async () => {
    const { bosses } = await extractBosses(await fixture({ hpOnly: true, missing: true }));
    expect(bosses[0]!.levelType).toBeNull();
  });
  it('真实数据的全部 16 Boss 均保留规程 1–20 血量，关卡覆盖真实防御/法抗', async () => {
    const bosses = JSON.parse(await readFile('src/data/generated/bosses.json', 'utf8')) as BossData[];
    expect(bosses).toHaveLength(16);
    expect(bosses.filter(b => b.hidden).map(b => b.bossId)).toEqual(['boss_8', 'boss_9', 'boss_10', 'boss_14', 'boss_15', 'boss_16']);
    for (const boss of bosses) {
      expect(boss.mechanics?.length).toBeGreaterThan(0);
      for (const m of boss.mechanics!) {
        expect(m.name + m.desc).not.toMatch(/<@|\$|[{}]/);
        expect(m.source).toContain('enemy_handbook_table.json');
      }
    }
    const hiddenGun = bosses.find(b => b.bossId === 'boss_9')!;
    expect(hiddenGun.mechanics).toContainEqual(expect.objectContaining({
      id: 'core_damage_scale', defaultOn: true, effect: { damageTakenScale: 0.2, damageTypes: ['physical', 'arts'] },
    }));
    const hidden = ['boss_8', 'boss_9', 'boss_10', 'boss_14', 'boss_15', 'boss_16'];
    for (const boss of bosses) {
      expect(boss.hidden).toBe(hidden.includes(boss.bossId));
      expect(Array.isArray(boss.mechanics)).toBe(true);
      for (const mechanic of boss.mechanics!) {
        expect(mechanic.name).toBeTruthy();
        expect(mechanic.desc).toBeTruthy();
        expect(mechanic.name + mechanic.desc).not.toMatch(/<@|<\/|\$|[{}]/);
        expect(mechanic.source).toBeTruthy();
      }
    }
    for (const boss of bosses) for (let level = 1; level <= 20; level++) expect(boss.hpByMode[`mode_single_${level}`]).toBeGreaterThan(0);
    const deer = bosses.find(boss => boss.bossId === 'boss_7')!;
    expect(deer.mechanics?.find(m => m.id === 'madness')?.effect?.damageTakenScale).toBeCloseTo(0.7);
    if (deer.attributes) expect(deer.attributes).toMatchObject({ def: 500, magicResistance: 35 });
    expect(deer.attributeSource.join('\n')).toContain('enemy_9033_acdeer');
    expect(deer.abilities.some(ability => ability.blackboard?.nums['Madness.damage_resistance'] === 0.3)).toBe(true);
  }, 120_000);
});
