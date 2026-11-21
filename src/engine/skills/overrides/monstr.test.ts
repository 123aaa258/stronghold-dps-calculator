import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';

const base = { charId: 'char_4179_monstr', skillId: 'skchr_monstr_3', bossId: 'boss_1',
  modeId: 'mode_single_10', durationSec: 180, equips: [], bonds: [] };

it.each(['a', 'b'] as const)('Mon3tr %s：用治疗回技，熔毁对单目标造成真实伤害', tier => {
  const result = calculate({ ...base, tier });
  const normal = result.normal;
  const skill = result.skill!;
  expect(normal.components[0]!.damageType).toBe('heal');
  expect(normal.dps).toBe(0);
  expect(skill.components[0]!.damageType).toBe('true');
  expect(skill.stats.atk).toBeCloseTo(normal.stats.atk * (tier === 'a' ? 3.5 : 3.8), 8);
  expect(skill.components[0]!.perHit).toBeCloseTo(skill.stats.atk, 8);
  // 默认潜能第一档，战术协同 +20 攻速；熔毁将 2.85 秒减少 1.5 秒，再取整帧。
  expect(skill.stats.attackInterval).toBe(34 / 30);
  expect(skill.dps).toBeCloseTo(skill.stats.atk / (34 / 30), 7);
  expect(result.cycle!.skillDurationSec).toBe(25);
  expect(result.cycle!.spRecoverSec).toBeCloseTo(15 * normal.stats.attackInterval, 8);
  const first = (15 - (tier === 'a' ? 5 : 7)) * normal.stats.attackInterval;
  expect(calculate({ ...base, tier, durationSec: first }).totalDamage.value).toBeCloseTo(0, 7);
  expect(calculate({ ...base, tier, durationSec: first + 25 }).totalDamage.value).toBeCloseTo(skill.dps * 25, 6);
  for (const slot of [1, 2]) {
    expect(calculate({ ...base, tier, skillId: 'skchr_monstr_' + slot }).totalDamage.value).toBe(0);
  }
});
