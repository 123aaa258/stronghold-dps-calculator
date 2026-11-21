import { expect, it } from 'vitest';
import type { BondData } from '../../engine/types';
import bonds from '../../data/generated/bonds.json';
import { assumedNotes } from './assumed';

const byId = new Map((bonds as BondData[]).map((b) => [b.bondId, b]));
const s = (bondId: string, activeChars: number, bandId?: string) => ({ bondId, stacks: 0, activeChars, ...(bandId ? { bandId } : {}) });

it('按档位列出生效的假设', () => {
  expect(assumedNotes([s('kjeragShip', 3), s('arcaneShip', 2), s('raidShip', 0), s('yanShip', 3)], byId)).toEqual(['【谢拉格】默认敌人始终处于寒冷或冻结']);
  expect(assumedNotes([s('arcaneShip', 3)], byId)).toEqual(['【奥术】默认敌人已叠满法术抗性降低']);
  expect(assumedNotes([s('kjeragShip', 6)], byId)).toEqual(['【谢拉格】默认敌人始终处于寒冷或冻结', '【谢拉格】雪人伤害忽略']);
});

it('叙拉古只在默认策略的 6 人档说明异常状态；可按干员过滤', () => {
  expect(assumedNotes([s('siracusaShip', 6)], byId)).toEqual(['【叙拉古】默认敌人始终处于 2 种以上异常状态']);
  expect(assumedNotes([s('siracusaShip', 6, 'band_siracusa')], byId)).toEqual([]);
  expect(assumedNotes([s('kjeragShip', 3)], byId, () => false)).toEqual([]);
});
