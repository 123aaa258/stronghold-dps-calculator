import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Blackboard, BondData, EquipData, GameDataMeta, GarrisonData } from '../../src/engine/types.ts';

interface RawBlackboard { key: string; value: number; valueStr: string | null }
interface RawBuff { key: string; blackboard: RawBlackboard[] }
interface RawActivity {
  bandDataListDict: Record<string, { bandId: string; effectId: string }>;
  bondInfoDict: Record<string, {
    bondId: string; name: string; desc: string; iconId: string;
    activeCount: number; effectId: string; chessIdList: string[];
  }>;
  effectInfoDataDict: Record<string, { effectName: string; effectDesc: string; effectType: string }>;
  effectBuffInfoDataDict: Record<string, RawBuff[]>;
  trapChessDataDict: Record<string, {
    chessId: string; charId: string; isGolden: boolean; itemType: string;
    effectId: string; giveBondId: string | null;
  }>;
  trapShopChessDatas: Record<string, {
    itemId: string; goldenItemId: string | null; itemLevel: number;
  }>;
  garrisonDataDict: Record<string, {
    garrisonDesc: string; eventType: string; effectType: string;
    battleRuneKey: string | null; blackboard: RawBlackboard[];
  }>;
}

function flatten(entries: RawBlackboard[]): Blackboard {
  const nums: Record<string, number> = {};
  const strs: Record<string, string> = {};
  for (const entry of entries) {
    if (entry.valueStr !== null && entry.valueStr !== '') strs[entry.key] = entry.valueStr;
    else nums[entry.key] = entry.value;
  }
  return Object.keys(strs).length ? { nums, strs } : { nums };
}

export async function extractEffects(cache: string, garrisonIds: string[]): Promise<{
  cultivation: GameDataMeta['cultivation'];
  bonds: BondData[];
  equips: EquipData[];
  garrisons: Record<string, GarrisonData>;
  issues: string[];
  keys: Record<string, string[]>;
}> {
  const readTable = async (name: string) => JSON.parse(await readFile(join(cache, 'excel', name), 'utf8'));
  const [table, characters] = await Promise.all([
    readTable('activity_table.json'),
    readTable('character_table.json') as Promise<Record<string, { name: string }>>,
  ]);
  const activity: RawActivity = table.activity.AUTOCHESS.act3autochess.V3_1;
  const cultivation: GameDataMeta['cultivation'] = {};
  for (const { cultivateNum, effectId } of table.autoChessData.cultivateEffectList) {
    const buff = activity.effectBuffInfoDataDict[effectId]?.find(b => b.key === 'char_attribute_mul');
    if (!buff || activity.effectInfoDataDict[effectId]?.effectType !== 'CHAR_MAP') throw new Error(`缺少练度映射 ${effectId}`);
    const { atk, def, max_hp } = flatten(buff.blackboard).nums;
    cultivation[cultivateNum] = { atk: atk ?? 1, def: def ?? 1, maxHp: max_hp ?? 1 };
  }
  const issues: string[] = [];
  const keySets = { bonds: new Set<string>(), equips: new Set<string>() };
  const buffsFor = (effectId: string, group: keyof typeof keySets) => {
    const raw = activity.effectBuffInfoDataDict[effectId];
    if (!raw) issues.push(`效果 ${effectId} 缺少 effectBuffInfoDataDict 数据`);
    return (raw ?? []).map((buff) => {
      for (const entry of buff.blackboard) keySets[group].add(entry.key);
      return { key: buff.key, blackboard: flatten(buff.blackboard) };
    });
  };
  const bonds: BondData[] = Object.values(activity.bondInfoDict).map((bond) => {
    const buffs = buffsFor(bond.effectId, 'bonds');
    const powerCounts = [...new Set(buffs.flatMap((buff) => {
      const count = buff.blackboard.nums.power_bond_char_cnt;
      return count === undefined ? [] : [count];
    }))];
    if (powerCounts.length > 1) issues.push(`盟约 ${bond.bondId} 存在不同强化门槛：${powerCounts.join(', ')}`);
    return {
      bondId: bond.bondId, name: bond.name, desc: bond.desc, iconId: bond.iconId,
      activeCount: bond.activeCount, powerCount: powerCounts[0] ?? null,
      effectId: bond.effectId, buffs, chessIds: bond.chessIdList, image: null,
    };
  });
  for (const band of Object.values(activity.bandDataListDict)) {
    if (!band.effectId?.startsWith('aceffect_band_')) continue;
    for (const buff of activity.effectBuffInfoDataDict[band.effectId] ?? []) {
      if (buff.key !== 'auto_chess_effect_replace') continue;
      for (const replacement of buff.blackboard) {
        const bond = bonds.find(b => b.effectId === replacement.key);
        if (bond?.bondId !== 'siracusaShip' || band.bandId !== 'band_siracusa') continue;
        const effectId = replacement.valueStr!;
        const buffs = buffsFor(effectId, 'bonds');
        const n = buffs[0].blackboard.nums;
        bond.variants = [{ bandId: band.bandId, bandName: table.autoChessData.bandDataDict[band.bandId].bandName,
          effectId, buffs, desc: `部署后进入隐匿（时长同攻速加成），隐匿期间及脱离后 <@ba.vup>${n.end_duration}</> 秒内，每次攻击有 <@ba.vup>${n.prob * 100}%</> 概率造成 <@ba.vup>${n.base_damage}+${n.damage_per_stack}×层</> 点真实伤害并恐惧目标 <@ba.vup>${n.fear}</> 秒` }];
      }
    }
  }
  const shopLevels = new Map<string, number>();
  for (const shop of Object.values(activity.trapShopChessDatas)) {
    shopLevels.set(shop.itemId, shop.itemLevel);
    if (shop.goldenItemId) shopLevels.set(shop.goldenItemId, shop.itemLevel);
  }
  const nameSources = { character_table: 0, effectInfoDataDict: 0 };
  const equips: EquipData[] = Object.values(activity.trapChessDataDict)
    .filter((trap) => trap.itemType === 'EQUIP').map((trap): EquipData => {
      const effect = activity.effectInfoDataDict[trap.effectId];
      const characterName = characters[trap.charId]?.name;
      // character_table 同时含 TRAP 条目，以 trapId 对应的实际名称为准。
      const name = characterName ?? effect?.effectName;
      const source = characterName ? 'character_table' : 'effectInfoDataDict';
      nameSources[source]++;
      const shopLevel = shopLevels.get(trap.chessId);
      if (!name || shopLevel === undefined || !effect) {
        throw new Error(`装备 ${trap.chessId} 缺少名称、商店等阶或效果说明`);
      }
      if (!characterName) issues.push(`装备 ${trap.chessId} 缺少 character_table 名称，使用 effectInfoDataDict.effectName：${name}`);
      // ChessTier 按 ID 的 _a/_b 定义；部分无进阶的六阶装备 _a 也有 isGolden=true。
      const tier = trap.chessId.endsWith('_b') ? 'b' : 'a';
      if (trap.isGolden !== (tier === 'b')) {
        issues.push(`装备 ${trap.chessId}（${name}）后缀为 ${tier}，但 isGolden=${trap.isGolden}；tier 按 ID 后缀提取`);
      }
      return {
        chessId: trap.chessId, tier, name,
        desc: effect.effectDesc, trapId: trap.charId, effectId: trap.effectId,
        shopLevel, giveBondId: trap.giveBondId, buffs: buffsFor(trap.effectId, 'equips'), image: null,
      };
    });
  issues.push(`装备名称来源：character_table[trapId].name ${nameSources.character_table} 条，effectInfoDataDict[effectId].effectName ${nameSources.effectInfoDataDict} 条`);
  const garrisons: Record<string, GarrisonData> = {};
  for (const garrisonId of new Set(garrisonIds)) {
    const raw = activity.garrisonDataDict[garrisonId];
    if (!raw) {
      issues.push(`缺少被引用的卫戍特质 ${garrisonId}`);
      continue;
    }
    garrisons[garrisonId] = {
      garrisonId, desc: raw.garrisonDesc, eventType: raw.eventType,
      effectType: raw.effectType, battleRuneKey: raw.battleRuneKey,
      blackboard: flatten(raw.blackboard),
    };
  }
  const keys = Object.fromEntries(Object.entries(keySets).map(([group, values]) => [group, [...values].sort()]));
  return { bonds, equips, garrisons, cultivation, issues, keys };
}
