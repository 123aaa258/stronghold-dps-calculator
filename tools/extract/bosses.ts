import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Blackboard, BossData, ModeData } from '../../src/engine/types.ts';

import { bossMechanics } from './boss-mechanics.ts';

type Field = { m_defined: boolean; m_value: string | number | boolean | null };
type Entry = { key: string; value: number; valueStr?: string | null };
type Skill = { prefabKey: string; blackboard?: Entry[] | null; [key: string]: unknown };
interface EnemyData {
  levelType?: Field;
  name?: Field;
  description?: Field;
  attributes?: Record<string, Field>;
  talentBlackboard?: Entry[] | null;
  skills?: Skill[] | null;
}
interface EnemyLevel { level: number; enemyData: EnemyData }
interface EnemyRef { id: string; level: number; useDb: boolean; overwrittenData?: EnemyData | null }
interface LevelData { enemyDbRefs: EnemyRef[]; runes?: unknown; optionalRunes?: unknown; globalBuffs?: unknown }
interface Battle { bossId: string | null; levelId: string }
interface ActivityTable {
  autoChessData: { bossInfoDict: Record<string, { enemyId: string; handbookEnemyId?: string }> };
  activity: { AUTOCHESS: { act3autochess: { V3_1: {
    bossInfoDict: Record<string, { bossId: string; sortId: number; isHidingBoss: boolean; bloodDataDict: Record<string, number> }>;
    modeDataDict: Record<string, { modeId: string; name: string; modeDifficulty: string; sortId: number }>;
    battleDataDict: Record<string, Record<string, Battle[]>>;
  } } } };
}

const json = async <T>(path: string): Promise<T> => JSON.parse(await readFile(path, 'utf8')) as T;
function blackboard(entries: Entry[]): Blackboard {
  const nums: Record<string, number> = {};
  const strs: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.valueStr != null && entry.valueStr !== '') strs[entry.key] = entry.valueStr;
    else nums[entry.key] = entry.value;
  }
  return Object.keys(strs).length ? { nums, strs } : { nums };
}
function definedAttributes(data: EnemyData): Record<string, string | number | boolean | null> {
  return Object.fromEntries(Object.entries(data.attributes ?? {}).filter(([, value]) => value.m_defined).map(([key, value]) => [key, value.m_value]));
}
function abilities(data: EnemyData, source: string): BossData['abilities'] {
  const result: BossData['abilities'] = [];
  if (data.talentBlackboard) result.push({ key: `${source}:talentBlackboard`, text: `${source}.talentBlackboard`, blackboard: blackboard(data.talentBlackboard) });
  for (const skill of data.skills ?? []) {
    const { blackboard: entries, ...settings } = skill;
    result.push({ key: `${source}:skill:${skill.prefabKey}`, text: `${source}.skills ${JSON.stringify(settings)}`, ...(entries ? { blackboard: blackboard(entries) } : {}) });
  }
  return result;
}

export async function extractBosses(cache: string): Promise<{ bosses: BossData[]; modes: ModeData[]; issues: string[] }> {
  const [table, database, handbook] = await Promise.all([
    json<ActivityTable>(join(cache, 'excel/activity_table.json')),
    json<{ enemies: { Key: string; Value: EnemyLevel[] }[] }>(join(cache, 'levels/enemydata/enemy_database.json')),
    json<{ enemyData: Record<string, { abilityList: { text: string }[] | null }> }>(join(cache, 'excel/enemy_handbook_table.json')),
  ]);
  const activity = table.activity.AUTOCHESS.act3autochess.V3_1;
  const enemies = new Map(database.enemies.map(enemy => [enemy.Key, enemy.Value]));
  const modes = Object.values(activity.modeDataDict).filter(mode => /^mode_(single|multi)_/.test(mode.modeId))
    .sort((a, b) => a.sortId - b.sortId).map(mode => ({ modeId: mode.modeId, name: mode.name, difficulty: mode.modeDifficulty, sortId: mode.sortId }));
  const selectedModes = new Set(modes.map(mode => mode.modeId));
  const issues: string[] = [];
  const bossLevels = new Map<string, Map<string, Set<string>>>();
  for (const [modeId, rounds] of Object.entries(activity.battleDataDict)) {
    if (!selectedModes.has(modeId)) continue;
    for (const battles of Object.values(rounds)) for (const battle of battles) {
      if (!battle.bossId) continue;
      const levels = bossLevels.get(battle.bossId) ?? new Map<string, Set<string>>();
      const modeIds = levels.get(battle.levelId) ?? new Set<string>();
      modeIds.add(modeId);
      levels.set(battle.levelId, modeIds);
      bossLevels.set(battle.bossId, levels);
    }
  }
  const bosses: BossData[] = [];
  for (const info of Object.values(activity.bossInfoDict).sort((a, b) => a.sortId - b.sortId)) {
    const enemyId = table.autoChessData.bossInfoDict[info.bossId]?.enemyId ?? null;
    const entries = enemyId ? enemies.get(enemyId) ?? [] : [];
    const base = entries.find(entry => entry.level === 0)?.enemyData;
    const source = `levels/enemydata/enemy_database.json:${enemyId}`;
    const boss: BossData = {
      bossId: info.bossId, name: base?.name?.m_value as string ?? enemyId ?? info.bossId,
      enemyId, levelType: null, description: base?.description?.m_value as string ?? null,
      hpByMode: { ...info.bloodDataDict }, attributes: null, abilities: [],
      attributeSource: [`excel/activity_table.json:autoChessData.bossInfoDict.${info.bossId}.enemyId=${enemyId}`, `excel/activity_table.json:activity.AUTOCHESS.act3autochess.V3_1.bossInfoDict.${info.bossId}.bloodDataDict`],
      hidden: info.isHidingBoss, mechanics: [], verified: true, image: null,
    };
    for (const entry of entries) boss.abilities.push(...abilities(entry.enemyData, `${source}:level=${entry.level}`));
    const identities = new Set<BossData['levelType']>();
    const serializedDefaults = new Set<string>();
    const variants: { label: string; attributes: NonNullable<BossData['attributes']>; allAttributes: Record<string, string | number | boolean | null>; mechanisms: string; effectiveAbilities: BossData['abilities'] }[] = [];
    const levels = bossLevels.get(info.bossId);
    if (!levels?.size || !enemyId) {
      issues.push(`${info.bossId}: 没有可映射的 Boss 关卡或 enemyId`);
      boss.verified = false;
    }
    for (const [levelId, modeIds] of levels ?? []) {
      const path = `levels/${levelId.toLowerCase()}.json`;
      const label = `${path} [${[...modeIds].join(', ')}]`;
      let level: LevelData;
      try { level = await json<LevelData>(join(cache, path)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
        issues.push(`${info.bossId}: 缺少关卡 ${label}`);
        boss.attributeSource.push(`${label}: 缺少关卡，未审计覆盖及 runes/optionalRunes/globalBuffs`);
        boss.verified = false;
        identities.add(null);
        continue;
      }
      for (const key of ['runes', 'optionalRunes', 'globalBuffs'] as const) {
        const value = level[key];
        boss.attributeSource.push(`${label}.${key}=${JSON.stringify(value) ?? 'missing'}`);
        if (value === undefined || (value !== null && (!Array.isArray(value) || value.length > 0))) {
          issues.push(`${info.bossId}: ${label}.${key} 未解析，原始内容已保留 attributeSource`);
          boss.verified = false;
        }
      }
      const refs = level.enemyDbRefs.filter(ref => ref.id === enemyId);
      if (refs.length !== 1) {
        issues.push(`${info.bossId}: ${label} 中 enemyDbRefs 匹配 ${enemyId} 得到 ${refs.length} 条，无法唯一确定`);
        boss.verified = false;
        identities.add(null);
        continue;
      }
      const ref = refs[0]!;
      boss.attributeSource.push(`${label}.enemyDbRefs: id=${ref.id}, level=${ref.level}, useDb=${ref.useDb}`);
      const selected = ref.useDb ? entries.filter(entry => entry.level <= ref.level).sort((a, b) => a.level - b.level) : [];
      if (ref.useDb && !selected.some(entry => entry.level === ref.level)) {
        issues.push(`${info.bossId}: ${label} 缺少 enemy_database 等级 ${ref.level}`);
        boss.verified = false;
        identities.add(null);
        continue;
      }
      const attributes: Record<string, string | number | boolean | null> = {};
      let identity: BossData['levelType'] = null;
      const applyIdentity = (data: EnemyData, label: string) => {
        if (!data.levelType?.m_defined) return;
        const value = data.levelType.m_value;
        identity = value === 'NORMAL' || value === 'ELITE' || value === 'BOSS' ? value : null;
        boss.attributeSource.push(`${label}.levelType=${String(value)}`);
      };
      let talent: Entry[] | null = null;
      let skills: Skill[] | null = null;
      for (const entry of selected) {
        // level 0 的未定义字段保留序列化默认值；更高等级和关卡只覆盖显式定义字段。
        const values = entry.level === 0 ? Object.fromEntries(Object.entries(entry.enemyData.attributes ?? {}).map(([key, field]) => [key, field.m_value])) : definedAttributes(entry.enemyData);
        Object.assign(attributes, values);
        applyIdentity(entry.enemyData, `${source}:level=${entry.level}`);
        boss.attributeSource.push(`${source}:level=${entry.level}.attributes=${JSON.stringify(values)}`);
        if (entry.enemyData.talentBlackboard != null) talent = entry.enemyData.talentBlackboard;
        if (entry.enemyData.skills != null) skills = entry.enemyData.skills;
      }
      const overwrite = ref.overwrittenData;
      if (overwrite) {
        applyIdentity(overwrite, `${label}.overwrittenData`);
        Object.assign(attributes, definedAttributes(overwrite));
        boss.attributeSource.push(`${label}.overwrittenData.attributes(m_defined=true)=${JSON.stringify(definedAttributes(overwrite))}`);
        boss.abilities.push(...abilities(overwrite, `${label}.overwrittenData`));
        if (overwrite.talentBlackboard != null) talent = overwrite.talentBlackboard;
        if (overwrite.skills != null) skills = overwrite.skills;
      } else boss.attributeSource.push(`${label}.overwrittenData=null`);
      identities.add(identity);
      const defaults = Object.entries(selected[0]?.enemyData.attributes ?? {}).filter(([key, field]) => !field.m_defined && (key === 'epResistance' || key === 'epDamageResistance' || /Immune$/.test(key))).map(([key]) => key);
      if (defaults.length) {
        defaults.forEach(key => serializedDefaults.add(key));
        boss.attributeSource.push(`${label}: level 0 未定义字段的序列化默认值（语义待核对）=${defaults.join(',')}`);
        boss.verified = false;
      }
      const numericKeys = ['def', 'magicResistance', 'maxHp', 'epResistance', 'epDamageResistance'] as const;
      if (numericKeys.some(key => typeof attributes[key] !== 'number')) {
        issues.push(`${info.bossId}: ${label} 必要属性缺失，不生成面板`);
        boss.verified = false;
        identities.add(null);
        continue;
      }
      variants.push({ label, attributes: {
        def: attributes.def as number, magicResistance: attributes.magicResistance as number,
        maxHp: attributes.maxHp as number, level: ref.level,
        epResistance: attributes.epResistance as number, epDamageResistance: attributes.epDamageResistance as number,
        immunities: Object.fromEntries(Object.entries(attributes).filter(([key, value]) => /Immune$/.test(key) && typeof value === 'boolean')) as Record<string, boolean>,
      }, allAttributes: attributes, mechanisms: JSON.stringify({ talent, skills }),
        effectiveAbilities: [
          ...abilities({ talentBlackboard: talent }, overwrite?.talentBlackboard ? `${path}.overwrittenData` : source),
          ...abilities({ skills }, overwrite?.skills ? `${path}.overwrittenData` : source),
        ],
      });
    }
    if (identities.size === 1) boss.levelType = [...identities][0];
    if (boss.levelType === null) {
      boss.verified = false;
      issues.push(`${info.bossId}: 敌人levelType缺失或跨模式不一致，不推断领袖身份`);
    }
    if (serializedDefaults.size) issues.push(`${info.bossId}: level 0 未定义字段使用序列化默认值，语义待核对：${[...serializedDefaults].join(', ')}`);
    if (variants.length) {
      const first = variants[0]!;
      // Boss 血量来自 bloodDataDict；关卡 maxHp 不参与跨模式属性一致性比较。
      const comparable = (attributes: typeof first.allAttributes) => JSON.stringify(Object.entries(attributes).filter(([key]) => key !== 'maxHp').sort(([a], [b]) => a.localeCompare(b)));
      const different = variants.filter(variant => comparable(variant.allAttributes) !== comparable(first.allAttributes) || variant.attributes.level !== first.attributes.level);
      if (different.length) {
        issues.push(`${info.bossId}: 跨模式关卡属性不一致，不共用面板：${variants.map(variant => `${variant.label}=${JSON.stringify(variant.allAttributes)}`).join('; ')}`);
        boss.verified = false;
      } else boss.attributes = first.attributes;
      if (variants.some(variant => variant.mechanisms !== first.mechanisms)) {
        issues.push(`${info.bossId}: 跨模式 talent/skills 不一致，全部原始配置按来源保留 abilities：${variants.map(variant => variant.label).join('; ')}`);
        boss.verified = false;
      }
      const handbookId = table.autoChessData.bossInfoDict[info.bossId]?.handbookEnemyId;
      if (handbookId) {
        if (!handbook.enemyData[handbookId]?.abilityList?.length) throw new Error(`图鉴缺少 ${handbookId} 的能力说明`);
        const perLevel = variants.map(v => bossMechanics(boss, v.effectiveAbilities, handbookId));
        // 技能冷却可能因模式改变，只有实际对我方输出的机制一致才共用。
        const signature = (mechanics: typeof perLevel[number]) => JSON.stringify(mechanics.map(({ source, ...m }) => m));
        if (perLevel.every(mechanics => signature(mechanics) === signature(perLevel[0]!))) boss.mechanics = perLevel[0]!;
        else {
          boss.verified = false;
          issues.push(`${info.bossId}: 跨关卡受伤机制不一致，未生成共用机制`);
        }
      }
    } else boss.verified = false;
    bosses.push(boss);
  }
  return { bosses, modes, issues };
}
