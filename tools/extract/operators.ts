import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { renderTemplate } from '../../src/ui/lib/template.ts';
import type {
  AttributeSet, Blackboard, ChessTier, OperatorData, OperatorTierData, Profession,
  PotentialStep, RangeData, SkillData, SpType, TalentData, TokenData, TokenTierData, UniEquipOption,
} from '../../src/engine/types.ts';

interface RawBoard { key: string; value: number; valueStr: string | null }
interface Condition { phase: string; level: number }
interface Candidate {
  unlockCondition: Condition;
  requiredPotentialRank: number;
  name?: string | null;
  description?: string | null;
  overrideDescripton?: string | null;
  additionalDescription?: string | null;
  upgradeDescription?: string | null;
  prefabKey?: string | null;
  rangeId?: string | null;
  tokenKey?: string | null;
  talentIndex?: number;
  isHideTalent?: boolean;
  blackboard: RawBoard[];
}
interface Bundle { candidates: Candidate[] | null }
interface Frame { level: number; data: Record<string, number> }
interface Character {
  name: string; appellation: string; rarity: string; profession: Profession;
  subProfessionId: string; description: string; position: OperatorData['position'];
  phases: { rangeId: string | null; maxLevel: number; attributesKeyFrames: Frame[] }[];
  favorKeyFrames: Frame[];
  trait: Bundle | null;
  talents: Bundle[] | null;
  displayTokenDict: Record<string, boolean> | null;
  skills: { skillId: string | null; unlockCond: Condition; overrideTokenKey: string | null }[] | null;
  potentialRanks: { buff: { attributes: { attributeModifiers: { attributeType: string; formulaItem: string; value: number }[] } } | null }[];
}
interface Shop {
  chessId: string; goldenChessId: string; chessType: string; charId: string | null; tmplId: string | null;
  chessLevel: number; defaultSkillIndex: number; defaultUniEquipId: string | null;
  backupCharPotRank: number;
}
interface Chess {
  chessId: string; status: { evolvePhase: string; charLevel: number; skillLevel: number; favorPoint: number; equipLevel: number };
  bondIds: string[]; garrisonIds: string[] | null; equipSlotNum: number; desc: string | null;
}
interface Part {
  target: string; isToken: boolean; resKey: string | null;
  validInGameTag: string | null; validInMapTag: string | null;
  addOrOverrideTalentDataBundle: Bundle;
  overrideTraitDataBundle: Bundle;
}
interface EquipPhase {
  equipLevel: number; parts: Part[]; attributeBlackboard: RawBoard[];
  tokenAttributeBlackboard: Record<string, RawBoard[]>;
}
interface RawSkill {
  skillId: string; iconId: string | null;
  levels: { name: string; description: string; skillType: string; durationType: string;
    spData: { spType: string | number; spCost: number; initSp: number; maxChargeTime: number; increment: number };
    duration: number; rangeId: string | null; prefabId: string | null; blackboard: RawBoard[] }[];
}

export function board(raw: RawBoard[] | null | undefined): Blackboard {
  const nums: Record<string, number> = {}, strs: Record<string, string> = {};
  for (const item of raw ?? []) {
    if (item.valueStr !== null && item.valueStr !== undefined && item.valueStr !== '') strs[item.key] = item.valueStr;
    else {
      if (!Number.isFinite(item.value)) throw new Error(`无效 blackboard: ${item.key}`);
      nums[item.key] = item.value;
    }
  }
  return Object.keys(strs).length ? { nums, strs } : { nums };
}
const fields: (keyof AttributeSet)[] = ['maxHp', 'atk', 'def', 'magicResistance', 'attackSpeed', 'baseAttackTime', 'cost', 'blockCnt', 'respawnTime'];
const attributeNames: Record<string, keyof AttributeSet> = {
  max_hp: 'maxHp', atk: 'atk', def: 'def', magic_resistance: 'magicResistance',
  attack_speed: 'attackSpeed', base_attack_time: 'baseAttackTime', cost: 'cost', block_cnt: 'blockCnt', respawn_time: 'respawnTime',
};
const phaseNumber = (phase: string) => {
  if (!/^PHASE_[0-2]$/.test(phase)) throw new Error(`未知精英化: ${phase}`);
  return Number(phase.slice(-1));
};

export function interpolate(frames: Frame[], level: number, key: string): number {
  if (!frames.length) throw new Error('缺少属性曲线');
  const lower = [...frames].reverse().find(f => f.level <= level) ?? frames[0]!;
  const upper = frames.find(f => f.level >= level) ?? frames.at(-1)!;
  const start = lower.data[key];
  const end = upper.data[key];
  if (!Number.isFinite(start) || !Number.isFinite(end)) throw new Error(`曲线缺属性 ${key}`);
  if (lower.level === upper.level) return start!;
  return start! + (end! - start!) * (level - lower.level) / (upper.level - lower.level);
}

function eligible(condition: Condition, phase: number, level: number): boolean {
  const required = phaseNumber(condition.phase);
  return phase > required || (phase === required && level >= condition.level);
}
function select(bundle: Bundle | null, phase: number, level: number, potential: number): Candidate | undefined {
  return bundle?.candidates?.filter(c => eligible(c.unlockCondition, phase, level) && c.requiredPotentialRank <= potential)
    .sort((a, b) => phaseNumber(a.unlockCondition.phase) - phaseNumber(b.unlockCondition.phase)
      || a.unlockCondition.level - b.unlockCondition.level || a.requiredPotentialRank - b.requiredPotentialRank).at(-1);
}
function talent(candidate: Candidate, index: number, description = ''): TalentData {
  return {
    index, name: candidate.name ?? '', desc: candidate.description ?? candidate.overrideDescripton ?? description,
    prefabKey: candidate.prefabKey ?? null, rangeId: candidate.rangeId ?? null,
    tokenKey: candidate.tokenKey ?? null, blackboard: board(candidate.blackboard), equipMods: [],
  };
}
type TierTalents = Pick<OperatorTierData, 'trait' | 'talents'>;
export function baseTalents(char: Character, state: OperatorTierData): TierTalents {
  const chosen = select(char.trait, state.evolvePhase, state.level, state.potentialRank);
  return {
    // description 是无动态 trait candidate 时的原始职业特性，不能丢掉。
    trait: chosen ? talent(chosen, -1, char.description) : char.description ? talent({ blackboard: [], unlockCondition: { phase: 'PHASE_0', level: 1 }, requiredPotentialRank: 0 }, -1, char.description) : null,
    talents: (char.talents ?? []).flatMap((bundle, index) => {
      const chosen = select(bundle, state.evolvePhase, state.level, state.potentialRank);
      return chosen ? [talent(chosen, index)] : [];
    }),
  };
}

export function applyPart(data: TierTalents, part: Part, state: OperatorTierData, issues: Set<string>): void {
  const candidate = select(part.target.includes('TRAIT') || part.target === 'DISPLAY' ? part.overrideTraitDataBundle : part.addOrOverrideTalentDataBundle,
    state.evolvePhase, state.level, state.potentialRank);
  if (!candidate) return;
  const traitTarget = part.target.includes('TRAIT') || part.target === 'DISPLAY';
  const known = ['TRAIT', 'TRAIT_DATA_ONLY', 'TALENT', 'TALENT_DATA_ONLY', 'DISPLAY'];
  if (!known.includes(part.target)) { issues.add(`未知模组 target ${part.target}`); return; }
  const index = candidate.talentIndex ?? -1;
  // 隐藏模组部件可与可见天赋共用下标，但 prefab 不同，例如水月的击杀回血与原有法术附伤。
  const existing = traitTarget ? data.trait : index >= 0 ? data.talents.find(t => t.index === index
    && (!candidate.isHideTalent || !candidate.prefabKey || t.prefabKey === candidate.prefabKey)) : undefined;
  const mode = part.target.endsWith('DATA_ONLY') ? 'data_only' : existing ? 'override' : 'add';
  // 例如棘刺 LOR-D 的隐藏部件（index=-1、prefabKey=10）提供独立黑板。
  if (mode === 'data_only' && !existing && !(index < 0 && candidate.prefabKey && !traitTarget)) {
    issues.add(`${state.chessId} ${state.uniEquipId} ${part.target} 缺少原始天赋 index=${index}`);
    return;
  }
  const result = existing ? structuredClone(existing) : talent(candidate, index);
  // DATA_ONLY 按键替换数值；其余运行时替换完整 blackboard，绝不能把倍率相加。
  const patch = board(candidate.blackboard);
  if (mode === 'data_only') {
    Object.assign(result.blackboard.nums, patch.nums);
    for (const key of Object.keys(patch.nums)) if (!patch.strs?.[key]) delete result.blackboard.strs?.[key];
    for (const key of Object.keys(patch.strs ?? {})) delete result.blackboard.nums[key];
    if (patch.strs) result.blackboard.strs = { ...result.blackboard.strs, ...patch.strs };
  } else if (part.target !== 'DISPLAY') result.blackboard = patch;
  result.name = candidate.name ?? result.name;
  result.desc = candidate.upgradeDescription || candidate.overrideDescripton || candidate.description || result.desc;
  if (candidate.additionalDescription) result.desc += `\n${candidate.additionalDescription}`;
  // DISPLAY 的数值只用于描述，不能混入战斗 blackboard。
  if (part.target === 'DISPLAY') result.desc = renderTemplate(result.desc, patch);
  result.prefabKey = candidate.prefabKey ?? result.prefabKey;
  result.tokenKey = candidate.tokenKey ?? result.tokenKey;
  result.rangeId = candidate.rangeId ?? result.rangeId;
  result.equipMods.push({ equipId: state.uniEquipId!, mode, target: part.target });
  if (traitTarget) data.trait = result;
  else if (existing) data.talents[data.talents.indexOf(existing)] = result;
  else data.talents.push(result);
}

function potentialAttributes(char: Character, rank: number): Partial<AttributeSet> {
  const result: Partial<AttributeSet> = {};
  for (const entry of char.potentialRanks.slice(0, rank)) {
    for (const modifier of entry.buff?.attributes.attributeModifiers ?? []) {
      const key = attributeNames[modifier.attributeType.toLowerCase()];
      if (!key || modifier.formulaItem !== 'ADDITION') throw new Error(`未支持潜能属性 ${modifier.attributeType}/${modifier.formulaItem}`);
      result[key] = (result[key] ?? 0) + modifier.value;
    }
  }
  return result;
}

function talentDiff(before?: TalentData | null, after?: TalentData | null): Partial<TalentData> | null | undefined {
  if (!after || !before) return before === after ? undefined : after ?? null;
  const changed = Object.entries(after).filter(([key, value]) => !isDeepStrictEqual(value, before[key as keyof TalentData]));
  return changed.length ? Object.fromEntries(changed) : undefined;
}

function potentialSteps(char: Character, defaultRank: number, talents: TierTalents[]): Pick<OperatorTierData, 'potentialSteps'> {
  const steps: PotentialStep[] = [];
  let before = talents[defaultRank]!;
  let previousAttrs = potentialAttributes(char, defaultRank);
  for (const [rank, after] of talents.entries()) {
    const step: PotentialStep = { rank };
    const attrs = potentialAttributes(char, rank);
    for (const key of fields) {
      if (key === 'cost' || key === 'respawnTime') continue;
      const delta = (attrs[key] ?? 0) - (previousAttrs[key] ?? 0);
      if (delta) (step.attributes ??= {})[key] = delta;
    }
    const trait = talentDiff(before.trait, after.trait);
    if (trait !== undefined) step.trait = trait;
    for (let i = 0; i < Math.max(before.talents.length, after.talents.length); i++) {
      const diff = talentDiff(before.talents[i], after.talents[i]);
      if (diff !== undefined) (step.talents ??= {})[i] = diff;
    }
    if (step.attributes || step.talents || step.trait !== undefined) steps.push(step);
    previousAttrs = attrs;
    before = after;
  }
  return steps.length ? { potentialSteps: steps } : {};
}

function storeEquipVariant(base: OperatorTierData | TokenTierData, alternate: OperatorTierData | TokenTierData, equipId: string) {
  const patch: NonNullable<typeof base.uniEquipVariants>[string] = {};
  for (const key of fields) {
    if (base.attributes[key] !== alternate.attributes[key]) (patch.attributes ??= {})[key] = alternate.attributes[key];
  }
  const trait = talentDiff(base.trait, alternate.trait);
  if (trait !== undefined) patch.trait = trait;
  for (let i = 0; i < Math.max(base.talents?.length ?? 0, alternate.talents?.length ?? 0); i++) {
    const diff = talentDiff(base.talents?.[i], alternate.talents?.[i]);
    if (diff !== undefined) (patch.talents ??= {})[i] = diff;
  }
  if (!('chessId' in base) && !('chessId' in alternate)) {
    for (const key of ['maxDeckStackCnt', 'maxDeployCount'] as const) {
      if (base[key] !== alternate[key]) patch[key] = alternate[key];
    }
  }
  if (!isDeepStrictEqual(base.potentialSteps, alternate.potentialSteps)) patch.potentialSteps = alternate.potentialSteps ?? [];
  if (Object.keys(patch).length) (base.uniEquipVariants ??= {})[equipId] = patch;
}

// GameData SkillSpType 是位标记：1=自动回复、2=攻击回复、4=受击回复、8=被动。
// 同仓 skill_table 的前三项反序列化成 INCREASE_*，8 仍为数字；保留原值供核对。
const spTypes: Record<string, SpType> = {
  '1': 'INCREASE_WITH_TIME', '2': 'ON_ATTACK', '4': 'ON_DEFEND', '8': 'PASSIVE',
  INCREASE_WITH_TIME: 'INCREASE_WITH_TIME', INCREASE_WHEN_ATTACK: 'ON_ATTACK',
  INCREASE_WHEN_TAKEN_DAMAGE: 'ON_DEFEND', PASSIVE: 'PASSIVE',
};

export async function extractOperators(cache: string) {
  const read = async <T>(name: string): Promise<T> => JSON.parse(await readFile(resolve(cache, 'excel', `${name}.json`), 'utf8')) as T;
  const [activity, chars, patches, equips, rawSkills, rawRanges, favor, catalog] = await Promise.all([
    read<{ activity: { AUTOCHESS: { act3autochess: { V3_1: { charShopChessDatas: Record<string, Shop>; charChessDataDict: Record<string, Chess>; constData: { fallbackBondId: string } } } } } }>('activity_table'),
    read<Record<string, Character>>('character_table'), read<{ patchChars: Record<string, Character> }>('char_patch_table'),
    read<Record<string, { phases: EquipPhase[] }>>('battle_equip_table'),
    read<Record<string, RawSkill>>('skill_table'), read<Record<string, { grids: { row: number; col: number }[] }>>('range_table'),
    read<{ favorFrames: { level: number; data: { battlePhase: number } }[] }>('favor_table'),
    read<{ charEquip: Record<string, string[]>; equipDict: Record<string, { type: string; typeIcon: string; uniEquipName: string }> }>('uniequip_table'),
  ]);
  const season = activity.activity.AUTOCHESS.act3autochess.V3_1;
  const issues = new Set<string>(), targets = new Set<string>(), spTypeRaw = new Set<string>();
  const operators: OperatorData[] = [], tokens: Record<string, TokenData> = {}, skills: Record<string, SkillData> = {}, ranges: Record<string, RangeData> = {};
  const skillLevels = new Map<string, Set<number>>();
  const rangeIds = new Set<string>();
  const rememberRange = (id: string | null) => { if (id) rangeIds.add(id); };
  function rememberTalents(data: TierTalents) {
    for (const entry of [data.trait, ...data.talents]) if (entry) rememberRange(entry.rangeId);
  }
  function talentsByRank(char: Character, states: OperatorTierData[], parts: Part[], token?: { id: string; ids: Set<string>; owner: string }): TierTalents[] {
    const relevant = parts.filter(part => part.isToken === Boolean(token));
    return states.map(state => {
      const data = baseTalents(char, state);
      for (const part of relevant) {
        if (token) {
          const c = select(part.addOrOverrideTalentDataBundle, state.evolvePhase, state.level, state.potentialRank);
          if (c?.tokenKey && c.tokenKey !== token.id) continue;
          if (!c?.tokenKey && token.ids.size > 1) issues.add(`${token.owner} 模组 ${part.target}/${part.resKey ?? 'data_only'} isToken 无 tokenKey，应用到所有实际引用召唤物：${[...token.ids].join(', ')}`);
        }
        applyPart(data, part, state, issues);
      }
      rememberTalents(data);
      return data;
    });
  }
  function addSkills(char: Character, state: OperatorTierData, tokenLevels?: Record<string, number>): string[] {
    return (char.skills ?? []).filter(s => s.skillId && eligible(s.unlockCond, state.evolvePhase, state.level)).map(s => {
      const id = s.skillId!;
      // 固定单级 token 技能按真实 level 1 保留；多级技能仍跟随主人。
      const level = tokenLevels && rawSkills[id]?.levels.length === 1 ? 1 : state.skillLevel;
      if (tokenLevels) tokenLevels[id] = level;
      if (!skillLevels.has(id)) skillLevels.set(id, new Set());
      skillLevels.get(id)!.add(level);
      return id;
    });
  }
  function attributes(char: Character, state: OperatorTierData, extra: RawBoard[], isToken = false): AttributeSet {
    const phaseIndex = Math.min(state.evolvePhase, char.phases.length - 1);
    const phase = char.phases[phaseIndex]!;
    if (!phase) throw new Error(`缺少属性阶段 ${state.chessId}`);
    const level = Math.min(state.level, phase.maxLevel);
    if (phaseIndex !== state.evolvePhase || level !== state.level) issues.add(`${state.chessId} 召唤物 ${char.name} 曲线按现有阶段 ${phaseIndex}/等级 ${level} 截断（主人 ${state.evolvePhase}/${state.level}）`);
    const battlePhase = [...favor.favorFrames].reverse().find(f => f.level <= state.favorPoint)?.data.battlePhase ?? 0;
    const result = Object.fromEntries(fields.map(key => [key, interpolate(phase.attributesKeyFrames, level, key)
      + (!isToken && char.favorKeyFrames.length ? interpolate(char.favorKeyFrames, battlePhase, key) : 0)])) as unknown as AttributeSet;
    for (const [key, bonus] of Object.entries(potentialAttributes(char, state.potentialRank))) result[key as keyof AttributeSet] += bonus;
    for (const item of extra) {
      const key = attributeNames[item.key];
      if (key) result[key] += item.value;
      else if (!(isToken && ['max_deck_stack_cnt', 'max_deploy_count'].includes(item.key))) issues.add(`${state.chessId} ${char.name} 模组属性 ${item.key}=${item.value} 不属于 AttributeSet，未纳入面板`);
    }
    return result;
  }
  const shops = Object.values(season.charShopChessDatas);
  const diy = shops.filter(s => s.chessType === 'DIY' || !s.charId).map(s => s.chessId);
  // 所列自选干员及其盟约来自计算器的配置；棋子状态取游戏数据中对应费用的通用自选棋子。
  const template = season.charShopChessDatas.chess_char_6_diy1_a;
  const five = season.charShopChessDatas.chess_char_5_diy1_a;
  if (template?.chessType !== 'DIY' || five?.chessType !== 'DIY') throw new Error('缺少六费或五费自选棋子');
  const fallback = season.constData.fallbackBondId;
  const selected = [
    ['char_1050_chen3', 'yanShip', 'uniequip_002_chen3'],
    ['char_2027_wang', 'yanShip', 'uniequip_002_wang'],
    ['char_4182_oblvns', fallback, 'uniequip_002_oblvns'],
    ['char_1035_wisdel', fallback, 'uniequip_002_wisdel'],
  ] as const;
  const entries: (Shop & { diyBond?: string })[] = [
    ...shops.filter(s => s.chessType !== 'DIY'),
    ...selected.map(([charId, diyBond, defaultUniEquipId]) => ({ ...template, charId, diyBond, defaultUniEquipId, defaultSkillIndex: 2 })),
  ];
  for (const shop of entries) {
    if (!shop.charId) continue;
    const charId = shop.tmplId ?? shop.charId;
    const char = patches.patchChars[charId] ?? chars[charId];
    if (!char) throw new Error(`棋子缺干员 ${charId}`);
    const op: OperatorData = {
      charId, name: char.name, appellation: char.appellation, rarity: Number(char.rarity.replace('TIER_', '')),
      profession: char.profession, subProfessionId: char.subProfessionId,
      position: char.position === 'MELEE' && char.description.includes('可以放置于远程位') ? 'ALL' : char.position,
      shopLevel: shop.chessLevel, bondIds: shop.diyBond ? [shop.diyBond] : [], ...(shop.diyBond ? { diy: true } : {}),
      defaultSkillIndex: shop.defaultSkillIndex, skillIds: [], tokenIds: [], tiers: {} as Record<ChessTier, OperatorTierData>, images: { avatar: null, portrait: null },
    };
    const options: UniEquipOption[] = (catalog.charEquip[charId] ?? []).flatMap(uniEquipId => {
      const entry = catalog.equipDict[uniEquipId]!;
      if (entry.type === 'INITIAL') return [];
      const typeIcon = entry.typeIcon.toUpperCase();
      return [{ uniEquipId, typeIcon, name: entry.uniEquipName,
        ...(['ISW-A', 'RA-A'].includes(typeIcon) ? { attrOnly: true } : {}) }];
    });
    if (options.length) op.uniEquips = options;
    for (const chessShop of shop.diyBond ? [shop, five] : [shop]) {
      const isDefault = chessShop === shop;
      const tiers = isDefault ? op.tiers : ((op.diyVariants ??= {})[chessShop.chessLevel] = {} as typeof op.tiers);
      for (const tier of ['a', 'b'] as const) {
        const chess = season.charChessDataDict[tier === 'a' ? chessShop.chessId : chessShop.goldenChessId];
        if (!chess) throw new Error(`干员缺少 ${tier} 阶 ${shop.charId}`);
        const status = chess.status;
        const tokenStates = new Map<string, TokenTierData>();
        // 默认状态先生成，备选模组的差异以同一棋子（含 DIY 费用阶）为基准。
        const equipIds = [shop.defaultUniEquipId, ...(tier === 'b' && status.equipLevel > 0
          ? options.map(option => option.uniEquipId).filter(id => id !== shop.defaultUniEquipId) : [])];
        const phases = equipIds.map(id => equips[id ?? '']?.phases.find(p => p.equipLevel === status.equipLevel));
        for (const [index, equipId] of equipIds.entries()) {
          const alternate = equipId !== shop.defaultUniEquipId;
          const attrOnly = options.find(option => option.uniEquipId === equipId)?.attrOnly;
          const equip = phases[index];
          if (status.equipLevel && equipId && !equip) throw new Error(`模组缺等级 ${shop.charId}/${equipId}/${status.equipLevel}`);
          if (status.equipLevel && !equipId) issues.add(`${shop.charId} ${tier} 阶 equipLevel=${status.equipLevel} 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级`);
          const parts = (attrOnly ? [] : equip?.parts ?? []).filter(part => {
            if (!part.validInGameTag && !part.validInMapTag) return true;
            // 当前实际条件只有 rogue_6，卫戍协议不满足；未知限定也不擅自视为启用。
            issues.add(`${shop.charId} ${tier} 阶跳过限定模组部件 ${part.target}/${part.resKey ?? 'data_only'}：validInGameTag=${part.validInGameTag}，validInMapTag=${part.validInMapTag}，当前 act3autochess 不确认满足`);
            return false;
          });
          const state: OperatorTierData = {
            chessId: chess.chessId, evolvePhase: phaseNumber(status.evolvePhase), level: status.charLevel, skillLevel: status.skillLevel,
            // 玩家自带干员的潜能和信赖未知，按棋子数据计（两阶均为 0）。
            potentialRank: chessShop.backupCharPotRank, favorPoint: status.favorPoint,
            uniEquipId: shop.diyBond && !equip ? null : equipId, uniEquipLevel: status.equipLevel, attributes: {} as AttributeSet,
            rangeId: char.phases[phaseNumber(status.evolvePhase)]!.rangeId, trait: null, talents: [],
            chessDesc: shop.diyBond ? null : chess.desc, garrisonIds: chess.garrisonIds ?? [], equipSlotNum: chess.equipSlotNum,
          };
          state.attributes = attributes(char, state, equip?.attributeBlackboard ?? []);
          for (const part of parts) targets.add(part.target);
          const states = Array.from({ length: 6 }, (_, potentialRank) => ({ ...state, potentialRank }));
          const talents = talentsByRank(char, states, parts);
          Object.assign(state, talents[state.potentialRank], potentialSteps(char, state.potentialRank, talents));
          if (alternate) storeEquipVariant(tiers[tier], state, equipId!);
          else tiers[tier] = state;
          op.bondIds = [...new Set([...op.bondIds, ...chess.bondIds])];
          op.skillIds = [...new Set([...op.skillIds, ...addSkills(char, state)])];
          rememberRange(state.rangeId);
          const tokenIds = new Set([...Object.keys(char.displayTokenDict ?? {}), ...Object.keys(equip?.tokenAttributeBlackboard ?? {})]);
          for (const data of talents) for (const t of [data.trait, ...data.talents]) if (t?.tokenKey) tokenIds.add(t.tokenKey);
          for (const s of char.skills ?? []) if (s.overrideTokenKey && eligible(s.unlockCond, state.evolvePhase, state.level)) tokenIds.add(s.overrideTokenKey);
          for (const part of parts) {
            for (const { potentialRank } of states) {
              const c = select(part.addOrOverrideTalentDataBundle, state.evolvePhase, state.level, potentialRank);
              if (c?.tokenKey) tokenIds.add(c.tokenKey);
            }
          }
          for (const tokenId of tokenIds) {
            const tokenChar = chars[tokenId];
            if (!tokenChar) { issues.add(`缺召唤物 ${shop.charId} -> ${tokenId}`); continue; }
            const tokenTalents = talentsByRank(tokenChar, states, parts, { id: tokenId, ids: tokenIds, owner: charId });
            const tokenData = tokenTalents[state.potentialRank]!;
            const tokenPhase = tokenChar.phases[Math.min(state.evolvePhase, tokenChar.phases.length - 1)]!;
            const tokenSkillLevels: Record<string, number> = {};
            const tokenSkills = addSkills(tokenChar, state, tokenSkillLevels);
            const bonuses = equip?.tokenAttributeBlackboard[tokenId] ?? [];
            const limits: Pick<TokenTierData, 'maxDeckStackCnt' | 'maxDeployCount'> = {};
            for (const [rawKey, key] of [['max_deck_stack_cnt', 'maxDeckStackCnt'], ['max_deploy_count', 'maxDeployCount']] as const) {
              const diyTrapStock = key === 'maxDeckStackCnt' && shop.diyBond && char.subProfessionId === 'traper';
              if (diyTrapStock || phases.some(p => p?.tokenAttributeBlackboard[tokenId]?.some(item => item.key === rawKey))) {
                limits[key] = interpolate(tokenPhase.attributesKeyFrames, state.level, key) + (bonuses.find(item => item.key === rawKey)?.value ?? 0);
              }
            }
            const tokenState = { attributes: attributes(tokenChar, state, bonuses, true), ...limits,
              skillLevel: state.skillLevel, skillLevels: tokenSkillLevels, ...tokenData, rangeId: tokenPhase.rangeId,
              ...potentialSteps(tokenChar, state.potentialRank, tokenTalents) };
            const record: TokenData = tokens[tokenId] ??= { tokenId, name: tokenChar.name, ownerCharIds: [], tiers: {}, skillIds: [], talents: [], rangeId: tokenPhase.rangeId };
            if (alternate) {
              const base = tokenStates.get(tokenId);
              if (!base) throw new Error(`备选模组新增召唤物，缺默认面板 ${charId}/${equipId}/${tokenId}`);
              storeEquipVariant(base, tokenState, equipId!);
            } else tokenStates.set(tokenId, tokenState);
            record.ownerCharIds = [...new Set([...record.ownerCharIds, charId])];
            record.skillIds = [...new Set([...record.skillIds, ...tokenSkills])];
            op.tokenIds = [...new Set([...op.tokenIds, tokenId])];
            rememberRange(tokenPhase.rangeId);
          }
        }
        for (const [tokenId, tokenState] of tokenStates) {
          const record = tokens[tokenId]!;
          if (isDefault) {
            if (record.tiers[tier] && !isDeepStrictEqual(record.tiers[tier], tokenState)) throw new Error(`多主人召唤物阶级冲突 ${tokenId}/${tier}`);
            record.tiers[tier] = tokenState;
            record.talents = tokenState.talents ?? [];
            record.rangeId = tokenState.rangeId ?? null;
          } else if (!isDeepStrictEqual(record.tiers[tier], tokenState)) {
            const variants = record.diyVariants ??= {};
            (variants[chessShop.chessLevel] ??= {})[tier] = tokenState;
          }
        }
      }
    }
    operators.push(op);
  }
  for (const [id, levels] of skillLevels) {
    const raw = rawSkills[id];
    if (!raw) { issues.add(`缺技能 ${id}`); continue; }
    const first = raw.levels[0]!;
    const record: SkillData = { skillId: id, name: first.name, skillType: first.skillType, durationType: first.durationType, iconId: raw.iconId, levels: {} };
    for (const level of [...levels].sort((a, b) => a - b)) {
      const rawLevel = raw.levels[level - 1];
      if (!rawLevel) { issues.add(`缺技能等级 ${id}/${level}`); continue; }
      const spRaw = rawLevel.spData.spType;
      spTypeRaw.add(`${typeof spRaw}:${spRaw}`);
      const spType = spTypes[String(spRaw)] ?? 'UNKNOWN';
      if (spType === 'UNKNOWN') issues.add(`未知 spType ${id}/${level}: ${spRaw}`);
      record.levels[String(level)] = {
        description: rawLevel.description, spType, spTypeRaw: spRaw, spCost: rawLevel.spData.spCost,
        initSp: rawLevel.spData.initSp, maxChargeTime: rawLevel.spData.maxChargeTime, increment: rawLevel.spData.increment,
        duration: rawLevel.duration, rangeId: rawLevel.rangeId, prefabId: rawLevel.prefabId, blackboard: board(rawLevel.blackboard),
      };
      rememberRange(rawLevel.rangeId);
    }
    skills[id] = record;
  }
  for (const id of [...rangeIds].sort()) {
    if (!rawRanges[id]) issues.add(`缺攻击范围 ${id}`);
    else ranges[id] = { rangeId: id, grids: rawRanges[id]!.grids };
  }
  operators.sort((a, b) => a.shopLevel - b.shopLevel || a.name.localeCompare(b.name, 'zh-CN'));
  return { operators, tokens, skills, ranges, issues: [...issues].sort(), diy, targets: [...targets].sort(), spTypeRaw: [...spTypeRaw].sort() };
}
