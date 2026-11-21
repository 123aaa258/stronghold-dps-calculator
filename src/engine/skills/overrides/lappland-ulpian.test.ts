import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { battleEffects } from '../../effects/common.ts';
import { generic } from '../generic.ts';
import { timeline } from '../../timeline.ts';
import { whitw2Override } from './char_1038_whitw2.ts';
import { ulpiaOverride } from './char_4145_ulpia.ts';
function build(name: string, index: number, key: 'a' | 'b' = 'b', external = battleEffects()) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === name)!;
  const tier = operator.tiers[key];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  const base = generic(operator, tier, skill, level, boss, external);
  const model = (name === '乌尔比安' ? ulpiaOverride : whitw2Override)({ operator, tier, skill, level, boss }, base);
  return { model, level };
}
it('乌尔比安进阶S3：增攻后的船锚只命中一次，返回标志物不攻击', () => {
  // A=1568.056179775281，DEF1000；N=(A−1000)/2.5，S=(3.3A−1000)/2.5。
  // 28−15=13秒开；船锚=3.3A*1.4−1000，30秒=13N+17S+船锚。
  const { model, level } = build('乌尔比安', 2);
  const a = 1568.056179775281, n = (a - 1000) / 2.5, s = (a * 3.3 - 1000) / 2.5;
  const anchor = a * 3.3 * 1.4 - 1000;
  expect(model.skill!.dps).toBeCloseTo(s + anchor / 25, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(13 * n + 17 * s + anchor, 8);
  expect(model.skill!.components.some(c => c.source.startsWith('token:'))).toBe(false);
});
it('乌尔比安S2等待78秒后永久开启，S1单目标只一锚', () => {
  const a = 1568.056179775281, n = (a - 1000) / 2.5;
  const s2 = build('乌尔比安', 1);
  expect(s2.model.skill!.dps).toBeCloseTo((a * 2.3 - 1000) / 2.5, 8);
  expect(timeline(s2.model, s2.level, 80, 1e6).totalDamage).toBeCloseTo(78 * n + 2 * (a * 2.3 - 1000) / 2.5, 8);
  expect(build('乌尔比安', 0).model.skill!.components[0]!.perHit).toBeCloseTo(a * 2.1 - 1000, 8);
});
it('荒芜拉普兰德进阶S3：逐次浮游爬升、散开、非叠加光环', () => {
  // A=356.4606741573034，RES25。前5个1.3秒浮游倍率 .35,.5,.65,.8,.95，之后1.1。
  // 初始38+5 SP，20秒开S3并触发110攻速；本体S=1.6A*.75/(1.3/1.1)。
  // 1.3秒散开后：原单元已满，新2单元从.35逐击+ .15；每间隔1.3/1.1。
  // 20秒后上限1.21，原单元首个攻击间隔1.1后补满；光环1.6A*.75每秒仅一次。
  const { model, level } = build('荒芜拉普兰德', 2);
  const a = 356.4606741573034, k = a * .75, dt = (35 / 30);
  const normal = k * (5 + .35 + .5 + .65 + .8 + .95) + (20 - 6.5) * k * 2.1 / 1.3;
  const body = k * 1.6 / dt;
  const drone = k * 1.6 * ((1.1 + 2 * .35) + (1.21 + 2 * .5) + (1.21 + 2 * .65) + (1.21 + 2 * .8) + (1.21 + 2 * .95) + (1.21 + 2 * 1.1));
  const tail = (8.7 - 6 * dt) * body * 3 * 1.21;
  // 技能期面板取第一次开技（20秒开、1.3秒散开后锁定）时：原单元已爬到1.1，新2单元仍为初始.35。
  expect(model.skill!.dps).toBeCloseTo(body * (1 + 1.1 + 2 * .35) + k * 1.6, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(normal + 10 * body + drone + tail + 8.7 * k * 1.6, 8);
});
it('荒芜拉普兰德S1常驻含两浮游，S2技能四浮游单目标各命中（第一次开技时的面板）', () => {
  // S1：12−0−5=7秒开，开技前以1.3秒间隔攻击5次，两单元 .35+5×.15 封顶1.1；攻击力+23%。
  // S2：28−12−5=11秒开，原单元已到1.1，技能新增3单元为初始.35；攻击力+80%。两者开技后均+10攻速（间隔35帧）。
  const k = 356.4606741573034 * .75 / ((35 / 30));
  expect(build('荒芜拉普兰德', 0).model.skill!.dps).toBeCloseTo(k * 1.23 * (1 + 2 * 1.1), 8);
  expect(build('荒芜拉普兰德', 1).model.skill!.dps).toBeCloseTo(k * 1.8 * (1 + 1.1 + 3 * .35), 8);
});
it('两阶全部技能均提供有限时间过程且不会漏掉首次初始技力', () => {
  for (const key of ['a', 'b'] as const) for (const name of ['乌尔比安', '荒芜拉普兰德']) for (const index of [0, 1, 2]) {
    const { model, level } = build(name, index, key);
    expect(model.skill!.dps).toBeGreaterThan(0);
    expect(Number.isFinite(timeline(model, level, 30, 1e6).totalDamage)).toBe(true);
  }
});

it('S3光环不吃普攻倍率、攻速或逐击附加伤害', () => {
  const e = battleEffects();
  e.attackScale = 2;
  e.extraHits.push({ type: 'arts', scale: 1, hits: 1, source: 'test' });
  const { model } = build('荒芜拉普兰德', 2, 'b', e);
  const aura = model.skill!.components.find(c => c.label.includes('不叠加'))!;
  expect(aura.dps).toBeCloseTo(356.4606741573034 * 1.6 * .75, 8);
  expect(aura.hitsPerSec).toBe(1);
  expect(model.skill!.components.filter(c => c.source === 'test')).toHaveLength(1);
});
