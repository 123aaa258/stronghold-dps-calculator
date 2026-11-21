import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { generic } from '../generic.ts';
import { nymphOverride } from './char_4146_nymph.ts';
import { timeline } from '../../timeline.ts';
import { advanceNecrosis, necrosisProfile } from '../../effects/elemental.ts';
function build(index: number, key: 'a' | 'b' = 'b', external = battleEffects()) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === '妮芙')!;
  const tier = operator.tiers[key];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  return { model: nymphOverride({ operator, tier, skill, level, boss }, generic(operator, tier, skill, level, boss, external)), level };
}
it('妮芙进阶S2：本体与溅射均命中，30秒四段尚未爆条', () => {
  // A=699.6067415730337，N=.75A/1.6；8/8.33与22/22.33秒各两段3A*.75。
  // 四段损伤4*3A*.75*.22=1385.221<2000，D30=30N+4*3A*.75。
  // 瞬时技能展示DPS为两段伤害/1.6秒（不含普攻），不是持续施法伤害率。
  const { model, level } = build(1), a = 699.6067415730337;
  expect(model.skill!.dps).toBeCloseTo(2 * 3 * a * .75 / 1.6, 8);
  expect(timeline(model, level, 30, Infinity).totalDamage).toBeCloseTo(30 * a * .75 / 1.6 + 4 * 3 * a * .75, 8);
  expect(timeline(model, level, 8.2, Infinity).totalDamage).toBeCloseTo(8.2 * a * .75 / 1.6 + 3 * a * .75, 8);
});
it('妮芙S1/S3：S1首轮积累不足爆条，S3单独上场不能自行凋亡', () => {
  const a = 699.6067415730337, n = a * .75 / 1.6;
  const s1 = build(0), s3 = build(2);
  // S1 18秒首开，20秒内损伤1.8*N*.1*20=1180.586<2000。
  expect(s1.model.skill!.dps).toBeCloseTo(1.8 * n, 8);
  expect(timeline(s1.model, s1.level, 30, Infinity).totalDamage).toBeCloseTo(18 * n + 12 * 1.8 * n, 8);
  // S3 28秒首开，攻速145，单目标仅一段：S=2.7*1.45*N。
  expect(s3.model.skill!.dps).toBeCloseTo(2.7 * (48 / 33) * n, 8);
  expect(timeline(s3.model, s3.level, 30, Infinity).totalDamage).toBeCloseTo(28 * n + 2 * 2.7 * (48 / 33) * n, 8);
  expect(s3.model.elemental!.perSec).toBe(0);
});
it('妮芙S2第六段爆条：15秒元素持续伤害，失魂升至85%，获得3%攻击', () => {
  const { model, level } = build(1), a = 699.6067415730337;
  // 第6段36.33秒爆条，随后1秒：普攻.75*1.03A*1.1/1.6，失魂.85*1.03A*1.1，凋亡800。
  const before = timeline(model, level, 36.33, Infinity).totalDamage;
  expect(timeline(model, level, 37.33, Infinity).totalDamage - before)
    .toBeCloseTo(.75 * 1.03 * a * 1.1 / 1.6 + .85 * 1.03 * a * 1.1 + 800, 6);
  const dps = .75 * 1.03 * a * 1.1 / 1.6 + .85 * 1.03 * a * 1.1 + 800;
  expect(timeline(model, level, 30, before + .5 * dps).killTimeSec).toBeCloseTo(36.83, 6);
});
it('凋亡区分损伤抵抗与元素抗性，爆发期间不积累', () => {
  const profile = necrosisProfile({ levelType: 'BOSS', attributes: { epResistance: 50, epDamageResistance: 25 } } as BossData);
  const state = { buildup: 0, remaining: 0 };
  expect(advanceNecrosis(state, profile, 1000, 20)).toEqual({ seconds: 4, triggered: true });
  expect(profile.dps).toBe(600);
  expect(advanceNecrosis(state, profile, 1000, 20)).toEqual({ seconds: 15, triggered: false });
  expect(state.buildup).toBe(0);
});
it('妮芙两阶全部技能输出有限且保留卫戍限制', () => {
  for (const key of ['a', 'b'] as const) for (const i of [0, 1, 2]) {
    const { model, level } = build(i, key);
    expect(Number.isFinite(timeline(model, level, 30, 1e6).totalDamage)).toBe(true);
    expect(model.notes.join('')).toContain('迅捷');
  }
});

it('妮芙S2保留初始技力余数与两次库存，零消耗明确限频', () => {
  const a = 699.6067415730337, n = a * .75 / 1.6, hit = 3 * a * .75;
  // 初始6+22=28可连放两次，本体两段在0秒，溅射两段在.33秒。
  const full = build(1, 'b', { ...battleEffects(), initSp: 22 });
  expect(timeline(full.model, full.level, .5, Infinity).totalDamage).toBeCloseTo(.5 * n + 4 * hit, 8);
  // 初始6+15=21，第一发后余7，7秒后第二发，不能丢余数等14秒。
  const partial = build(1, 'b', { ...battleEffects(), initSp: 15 });
  expect(timeline(partial.model, partial.level, 7.4, Infinity).totalDamage).toBeCloseTo(7.4 * n + 4 * hit, 8);
  const free = build(1, 'b', { ...battleEffects(), spCostMin: 0, spCostScale: 0 });
  expect(Number.isFinite(timeline(free.model, free.level, 30, Infinity).cycle!.avgDps)).toBe(true);
  expect(free.model.notes.join('')).toContain('零技力S2');
});
it('妮芙零技力回复未开技能，窗口末端不凭空增加普攻', () => {
  // S2初始6不足14，回复1−1=0，30秒仅连续普攻30*.75A/1.6。
  const { model, level } = build(1, 'b', { ...battleEffects(), spRecovery: -1 });
  expect(timeline(model, level, 30, Infinity).totalDamage).toBeCloseTo(30 * .75 * 699.6067415730337 / 1.6, 8);
});
