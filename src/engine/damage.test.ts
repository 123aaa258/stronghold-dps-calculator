import { burningProfile, necrosisProfile } from './effects/elemental.ts';
import { expect, it } from 'vitest';
import bosses from '../data/generated/bosses.json' with { type: 'json' };
import type { BossData } from './types.ts';
import { combatTarget, damage } from './damage.ts';
const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1, Math.abs(expected)) * 1e-6);
it('物理穿透与逐段保底', () => {
  // A=1000, D=500, 固穿=100 → D有效=400 → max(50,1000−400)=600；两段=1200。
  close(damage({ attack: 1000, type: 'physical', defense: 500, penetrationFixed: 100 }).perHit, 600);
  // A=1000,D=2000 → max(50,−1000)=50；两段逐段保底=100，不是 max(100,2000−2000)。
  close(damage({ attack: 1000, type: 'physical', defense: 2000, hits: 2 }).total, 100);
});
it('法术保底及先固定后百分比穿透', () => {
  // A=1000,R=100 → max(50,0)=50。
  close(damage({ attack: 1000, type: 'arts', resistance: 100 }).perHit, 50);
  // R有效=(1−0.2)×max(0,50−10)=32 → max(50,1000×0.68)=680。
  close(damage({ attack: 1000, type: 'arts', resistance: 50, penetrationPct: 0.2, penetrationFixed: 10 }).perHit, 680);
});
it('同名脆弱取最高，并区分伤害类型与条件', () => {
  // 真实伤害1000无视防抗；脆弱max(20%,30%)=30%，法脆弱和未满足条件不生效 → 1300。
  close(damage({ attack: 1000, type: 'true', modifiers: [
    { group: '脆弱', value: 0.2, kind: 'fragile' }, { group: '脆弱', value: 0.3, kind: 'fragile' },
    { group: '法术脆弱', value: 1, kind: 'fragile', types: ['arts'] },
    { group: '条件增伤', value: 2, kind: 'increase', active: false },
  ] }).perHit, 1300);
});
it('减防与穿透分开：先固定减防再百分比减防', () => {
  // D=(1000−200)×(1−0.25)=600；有效防御=(600−100)×(1−0.2)=400 → 伤害600。
  close(damage({ attack: 1000, type: 'physical', defense: 1000, reductionFixed: 200, reductionPct: 0.25, penetrationFixed: 100, penetrationPct: 0.2 }).perHit, 600);
});

it('Boss 面板加值与倍率先于我方减防穿透，类型专属减伤最后相乘', () => {
  const base = (bosses as BossData[])[0]!;
  const target = combatTarget({ ...base, bossId: 'test', attributes: { ...base.attributes!, def: 100, magicResistance: 20 },
    mechanics: [{ id: 'armor', name: '护甲', desc: '', source: 'test', defaultOn: true, effect: { defScale: 2, resAdd: 20 } },
      { id: 'field', name: '力场', desc: '', source: 'test', defaultOn: true,
        effect: { defAdd: 50, damageTakenScale: .5, damageTypes: ['physical'] } }],
  }, {});
  // A=500，物理[(100+50)×2−80]×.5−10=100防，最终(500−100)×.5=200。
  const physical = damage({ attack: 500, type: 'physical', target, reductionFixed: 80, reductionPct: .5, penetrationFixed: 10 });
  close(physical.perHit, 200);
  expect(physical.derivation.filter(step => step.source.startsWith('boss:')).map(step => step.value)).toEqual([50, 2, .5]);
  // 法术(20+20−10)×.5=15抗；力场只减物理，不影响法术和元素。
  close(damage({ attack: 500, type: 'arts', target, reductionFixed: 10, reductionPct: .5 }).perHit, 425);
  close(damage({ attack: 500, type: 'elemental', target }).perHit, 500);
});

it('械的方向护甲减少灼燃和凋亡扣血，元素损伤积累仍沿用元素抗性', () => {
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_11')!;
  const target = combatTarget(boss, { directional_armor: true });
  expect(burningProfile(target).burstDamage).toBe(burningProfile(boss).burstDamage / 2);
  expect(necrosisProfile(target).dps).toBe(necrosisProfile(boss).dps / 2);
  expect(burningProfile(target).buildupMultiplier).toBe(burningProfile(boss).buildupMultiplier);
  expect(necrosisProfile(target).derivation.some(s => s.source === 'boss:boss_11:directional_armor')).toBe(true);
});
