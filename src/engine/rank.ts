import operators from '../data/generated/operators.json' with { type: 'json' };
import bondData from '../data/generated/bonds.json' with { type: 'json' };
import { calculate } from './calc.ts';
import type { OperatorData, RankAll, RankInput, RankRow } from './types.ts';

const skillful = bondData.find(bond => bond.bondId === 'skillfulShip')!;

/** 逐项产出，让排行页在计算下一项前就能释放上一项的伤害推导。 */
export function* iterateRankRows(conditions: RankInput, exclude?: ReadonlySet<string>): Generator<RankRow> {
  const bonds = conditions.bonds.map(setting =>
    setting.bondId === skillful.bondId && setting.activeChars >= skillful.activeCount
      ? { ...setting, inRange: true } : setting);
  for (const { charId, skillIds, uniEquips } of operators as unknown as OperatorData[]) {
    if (exclude?.has(charId)) continue;
    for (const tier of ['a', 'b'] as const) {
      const modules = tier === 'b' && uniEquips?.length ? uniEquips.map(option => option.uniEquipId) : [null];
      for (const skillId of skillIds) for (const uniEquipId of modules) {
        const input = { ...conditions, charId, tier, skillId, uniEquipId, equips: [], bonds };
        try {
          yield { charId, tier, skillId, uniEquipId, input, result: calculate(input) };
        } catch {
          // 单个技能缺少可计算的数据时，其余组合继续进榜。
          continue;
        }
      }
    }
  }
}

export const rankAll: RankAll = conditions => Array.from(iterateRankRows(conditions));
