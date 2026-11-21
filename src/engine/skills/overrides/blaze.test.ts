import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { generic } from '../generic.ts';
import { overrides } from './index.ts';
import { timeline } from '../../timeline.ts';
function build(index: number, tierKey: 'a' | 'b' = 'b') {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === '烛煌')!;
  const tier = operator.tiers[tierKey];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  const fallback = generic(operator, tier, skill, level, boss);
  const model = overrides[operator.charId]?.({ operator, tier, skill, level, boss }, fallback) ?? fallback;
  return { model, level };
}
it('烛煌进阶S3：21发、0.3秒间隔，单独上场无灼燃与补弹', () => {
  // A=708.2696629213483，RES25；普攻N=.75A/1.6；技能S=.75*1.85A/(1.6−1.3)。
  // 初次34−16=18s开，21*.3=6.3s结束，30s伤害=(18+5.7)N+6.3S。
  const { model, level } = build(2);
  const a = 708.2696629213483;
  const n = a * .75 / 1.6, s = a * 1.85 * .75 / .3;
  expect(model.skill!.dps).toBeCloseTo(s, 8);
  expect(model.duration).toBeCloseTo(6.3, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(23.7 * n + 6.3 * s, 8);
  expect(model.elemental?.perSec).toBe(0);
});
it('烛煌S1：火圈与普攻并存；19秒回转刷新20秒火圈、不叠加', () => {
  // 13s首开，32s第二次刷新；30s之前积累=.3*.55*A*.75*17=1490.772<2000。
  // 30秒伤害=30*.75A/1.6 +17*.55A*.75。
  const { model, level } = build(0);
  const a = 708.2696629213483;
  const n = a * .75 / 1.6, ring = a * .55 * .75;
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(30 * n + 17 * ring, 8);
  expect(timeline(model, level, 34, 1e6).totalDamage).toBeCloseTo(34 * n + 21 * ring, 8);
  expect(model.elemental?.perSec).toBeCloseTo(.3 * ring, 8);
});
it('烛煌S2：单Boss地段不叠加，首次爆条7000与熔点伤害单列', () => {
  // 19秒首开，A'=2.2A；攻击间隔2.5，地段每秒.35A'*.75。
  // 30秒尚未爆条：总伤害=19N+11*(.75A'/2.5+.35A'*.75)。
  // 爆条t=19+2000/(.3*.35A'*.75)，瞬时增加7000+4.2A'*1.1。
  const { model, level } = build(1);
  const a = 708.2696629213483, n = a * .75 / 1.6;
  const s = 2.2 * a * .75 / 2.5 + .35 * 2.2 * a * .75;
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(19 * n + 11 * s, 8);
  const t = 19 + 2000 / (.3 * .35 * 2.2 * a * .75);
  expect(timeline(model, level, t + 1e-7, 1e6).totalDamage - timeline(model, level, t - 1e-7, 1e6).totalDamage)
    .toBeCloseTo(7000 + 4.2 * 2.2 * a * 1.1, 2);
  expect(model.skill!.components.some(c => c.source === 'elemental:burning')).toBe(true);
});
it('烛煌S3长战斗自损触发倒地，不能永远按满血重复射击', () => {
  // 3%/秒：前5轮各6.3秒，第6轮只能打(1/.03−31.5)=1.833333秒。
  // 第6轮开始18+5*(34+6.3)=219.5；221.3333倒地，33.3333秒内零输出。
  const { model, level } = build(2);
  const at = 18 + 5 * 40.3 + (1 / .03 - 5 * 6.3);
  expect(timeline(model, level, at + 10, Infinity).totalDamage).toBeCloseTo(timeline(model, level, at, Infinity).totalDamage, 6);
});
it('烛煌两阶全部技能时间过程有限', () => {
  for (const tier of ['a', 'b'] as const) for (const index of [0, 1, 2]) {
    const { model, level } = build(index, tier);
    expect(Number.isFinite(timeline(model, level, 30, 1e6).totalDamage)).toBe(true);
    expect(model.skill!.dps).toBeGreaterThan(0);
  }
});
