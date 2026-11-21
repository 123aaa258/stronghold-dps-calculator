/**
 * 界面唯一的数据入口：真实生成数据 + 真实引擎。
 */
import type { BondData, BossData, CalcInput, CalcResult, EquipData, GameDataMeta, ModeData, OperatorData, SkillData } from '../engine/types';
import { calculate as engineCalculate } from '../engine/index';
import operatorsJson from '../data/generated/operators.json';
import skillsJson from '../data/generated/skills.json';
import bondsJson from '../data/generated/bonds.json';
import equipsJson from '../data/generated/equips.json';
import bossesJson from '../data/generated/bosses.json';
import modesJson from '../data/generated/modes.json';
import metaJson from '../data/generated/meta.json';

export const operators = operatorsJson as unknown as OperatorData[];
export const skills = skillsJson as unknown as Record<string, SkillData>;
export const bonds = bondsJson as unknown as BondData[];
export const equips = equipsJson as unknown as EquipData[];
export const bosses = bossesJson as unknown as BossData[];
/** 界面提供：个人模拟规程等级 1–20（在前，下标 0–19），联合模拟 标准/险境/绝境/终极（在后）。不含极速模拟。 */
const allModes = modesJson as unknown as ModeData[];
const MULTI_ORDER = ['mode_multi_funny', 'mode_multi_normal', 'mode_multi_hard', 'mode_multi_abyss'];
export const modes = [
  ...allModes
    .filter((m) => /^mode_single_\d+$/.test(m.modeId))
    .sort((a, b) => Number(a.modeId.split('_').pop()) - Number(b.modeId.split('_').pop())),
  ...MULTI_ORDER.map((id) => allModes.find((m) => m.modeId === id)).filter((m): m is ModeData => !!m),
];
const meta = metaJson as unknown as GameDataMeta;
export const dataLabel = `数据 ${meta.dataVersion}`;

export const bondById = new Map(bonds.map((b) => [b.bondId, b]));
export const opById = new Map(operators.map((o) => [o.charId, o]));

export function calculate(input: CalcInput): CalcResult | null {
  try { return engineCalculate(input); } catch { return null; }
}
