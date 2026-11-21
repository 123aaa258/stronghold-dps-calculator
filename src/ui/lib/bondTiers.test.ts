import { expect, it } from 'vitest';
import type { BondData } from '../../engine/types';
import bonds from '../../data/generated/bonds.json';
import { bondTiers, currentTier, teamTiers } from './bondTiers';

const byId = new Map((bonds as BondData[]).map((b) => [b.bondId, b]));

it.each(['arcaneShip', 'preciShip'])('%s 全场档位只有不激活与 3 人', (id) => {
  const b = byId.get(id)!;
  expect(bondTiers(b).map((t) => t.value)).toEqual([0, 2, 3]);
  const team = teamTiers(b);
  expect(team.map((t) => t.label)).toEqual(['不激活', '3 人']);
  // 成员区留下的 2 人设置，在全场区显示为不激活
  expect(currentTier(team, 2)).toBe(0);
  expect(currentTier(team, 3)).toBe(3);
});

it('其他全场盟约档位不变', () => {
  for (const id of ['steadShip', 'swiftShip', 'skillfulShip', 'raidShip', 'suntShip']) {
    const b = byId.get(id)!;
    expect(teamTiers(b)).toEqual(bondTiers(b));
  }
});
