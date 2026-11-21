import { swiftSucceeds } from '../../swift.ts';
import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { generic } from '../generic.ts';
import { overrides } from './index.ts';
import { timeline } from '../../timeline.ts';
function build(name: string, index: number, key: 'a' | 'b' = 'b', effects = battleEffects()) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === name)!;
  const tier = operator.tiers[key];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  const base = generic(operator, tier, skill, level, boss, effects);
  const model = overrides[operator.charId]?.({ operator, tier, skill, level, boss }, base) ?? base;
  return { model, level };
}
it('史尔特尔进阶S3：20穿透、阻挡脆弱与30秒伤害', () => {
  // A=688.8539325842696，RES25−20=5，阻挡法术脆弱1.1；N=A*.95*1.1/1.25。
  // S3攻击3.4A，S=3.4N；8秒回技力后开启。自损累计0.2*t²/(2*60)，22秒内不致命。
  // 30秒=8N+22S；不把S3永久标记当作无限存活。
  const { model, level } = build('史尔特尔', 2);
  const n = 688.8539325842696 * .95 * 1.1 / (38 / 30);
  expect(model.skill!.dps).toBeCloseTo(n * 3.4, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(n * 8 + n * 3.4 * 22, 8);
  // 自损至致命为sqrt(600)秒，余烬9秒且攻速130%；之后伤害停止。
  expect(timeline(model, level, 100, 1e6).totalDamage).toBeCloseTo(n * 8 + n * 3.4 * (Math.sqrt(600) + 9 * 38 / 29), 8);
  expect(timeline(model, level, 1000, 1e6).killTimeSec).toBe(Infinity);
  expect(timeline(model, level, 1000, 1e6).totalDamage).toBeCloseTo(timeline(model, level, 100, 1e6).totalDamage, 8);
});
it('史尔特尔S2单目标倍率及S1攻击回复循环', () => {
  // S2=(1+.8)*1.5*N=2.7N，13秒等待+17秒技能。
  // S1三次普通攻击蓄3SP，随后一次2.4倍攻击，周期DPS=(3+2.4)/4*N。
  const n = 688.8539325842696 * .95 * 1.1 / (38 / 30);
  const s2 = build('史尔特尔', 1);
  expect(s2.model.skill!.dps).toBeCloseTo(n * 2.7, 8);
  expect(timeline(s2.model, s2.level, 30, 1e6).totalDamage).toBeCloseTo(n * 13 + n * 2.7 * 17, 8);
  const s1 = build('史尔特尔', 0);
  expect(timeline(s1.model, s1.level, 30, 1e6).cycle!.avgDps).toBeCloseTo(n * 5.4 / 4, 8);
});
it('夕进阶默认S2：首次25秒小自在与30秒伤害', () => {
  // N=948.4494382022472*.75/2.9；S=1.4攻击*1.4攻速*N=1.96N。
  // 小自在398攻击、1.9秒、RES25，T=398*.75/1.9；首击近似在t=2.9生成，存活至27.9。
  // 44−15=29秒开启，30秒=29N+S+25T（Boss此时未到半血）。
  const { model, level } = build('夕', 1);
  const n = 948.4494382022472 * .75 / 2.9;
  const token = 398 * .75 / 1.9;
  expect(model.skill!.dps).toBeCloseTo(n * (1.4 * 87 / 62), 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(n * 29 + n * (1.4 * 87 / 62) + token * 25, 8);
});
it('夕S3只刷新一只小自在，攻击间隔乘1.4', () => {
  // 49秒等待，S3间隔=2.9*1.4=(122 / 30)；技能DPS=2A*.75/(122 / 30)+398*.75/1.9。
  // 不把每击召唤当作叠加新召唤物，也不把夕的100%攻击加给小自在。
  const { model } = build('夕', 2);
  expect(model.skill!.stats.attackInterval).toBeCloseTo((122 / 30), 8);
  expect(model.skill!.dps).toBeCloseTo(948.4494382022472 * 2 * .75 / (122 / 30) + 398 * .75 / 1.9, 8);
  expect(model.skill!.components.filter(c => c.source.includes('token')).length).toBe(1);
});
it('夕S2半血后才加25%法伤，召唤物不继承此倍率', () => {
  // HP取到29秒的伤害两倍：半血恰在技能开启，18秒技能结束后用普通攻击补足余下HP。
  const { model, level } = build('夕', 1);
  const n = 948.4494382022472 * .75 / 2.9;
  const half = n * 29 + 398 * .75 / 1.9 * 25;
  const result = timeline(model, level, 30, half * 2);
  expect(result.totalDamage).toBeCloseTo(half + n * (1.4 * 87 / 62) * 1.25, 8);
  expect(result.killTimeSec).toBeCloseTo(47 + (half - 18 * n * (1.4 * 87 / 62) * 1.25) / n, 8);
});
it('两阶全技能提供有限伤害且召唤物窗口不永久保留', () => {
  for (const tier of ['a', 'b'] as const) for (const name of ['史尔特尔', '夕']) for (const index of [0, 1, 2]) {
    const { model, level } = build(name, index, tier);
    expect(Number.isFinite(timeline(model, level, 30, 1e6).totalDamage)).toBe(true);
    expect(model.skill!.dps).toBeGreaterThan(0);
  }
});

it('夕S2迅捷成功和失败分支各按本分支血量切换半血增伤', () => {
  const effects = { ...battleEffects(), skillEndSp: 15, skillEndProbability: .34 };
  const { model, level } = build('夕', 1, 'b', effects);
  const n = 948.4494382022472 * .75 / 2.9, s = n * (1.4 * 87 / 62);
  const firstEnd = 29 * n + 25 * 398 * .75 / 1.9 + 18 * s;
  // t=47结束首轮，第0次判定（固定判定序列，概率.34）：成功则76秒再开，78秒压至半血；失败则到90秒都在普攻。
  const half = firstEnd + 29 * n + 2 * s;
  const result = timeline(model, level, 90, 2 * half);
  expect(result.totalDamage).toBeCloseTo(swiftSucceeds(0, .34) ? half + 12 * s * 1.25 : firstEnd + 43 * n, 8);
  // 各轮回复为 29（成功）或 44（失败）秒，平均落在两者之间。
  expect(result.cycle!.spRecoverSec).toBeGreaterThanOrEqual(29);
  expect(result.cycle!.spRecoverSec).toBeLessThanOrEqual(44);
});
