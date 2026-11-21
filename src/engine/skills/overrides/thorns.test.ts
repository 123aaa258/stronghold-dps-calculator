import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { generic } from '../generic.ts';
import { battleEffects } from '../../effects/common.ts';
import { timeline } from '../../timeline.ts';
import { thornsOverride } from './char_293_thorns.ts';
import { thorn2Override } from './char_1039_thorn2.ts';
function build(name: string, index: number, key: 'a' | 'b' = 'b', initSp = 0) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === name)!;
  const tier = operator.tiers[key];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  const base = generic(operator, tier, skill, level, boss, { ...battleEffects(), initSp });
  const model = (name === '棘刺' ? thornsOverride : thorn2Override)({ operator, tier, skill, level, boss }, base);
  return { model, level };
}
it('棘刺两阶S3首开与二次永久分段，毒不按攻击次数叠加', () => {
  for (const key of ['a', 'b'] as const) {
    // b: A=704.1573，I=1.3/1.05，毒125*.75；模组每击+.1A*.75。
    // 初始0SP，15I秒首开；30秒首轮后再15I回复，第二次起+80%攻击/+32攻速永久。
    const a = key === 'b' ? 704.1573033707865 : 575;
    const speed = key === 'b' ? 105 : 100;
    const atk = key === 'b' ? .4 : .33;
    const aspd = key === 'b' ? 16 : 14;
    const module = key === 'b' ? .1 : 0;
    const rate = (mult: number, s: number) => (Math.max(a * mult - 1000, a * mult * .05) + a * mult * module * .75) * 30 / Math.round(3900 / s) + 125 * .75;
    const normal = rate(1, speed), first = rate(1 + atk, speed + aspd), permanent = rate(1 + 2 * atk, speed + 2 * aspd);
    const wait = 15 * Math.round(3900 / speed) / 30;
    const { model, level } = build('棘刺', 2, key);
    expect(model.skill!.dps).toBeCloseTo(first, 8);
    expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(normal * wait + first * (30 - wait), 8);
    const end = 2 * wait + 30;
    expect(timeline(model, level, end + 10, 1e6).totalDamage).toBeCloseTo(normal * 2 * wait + first * 30 + permanent * 10, 8);
    expect(timeline(model, level, 30, 1e6).cycle!.avgDps).toBeCloseTo(permanent, 8);
  }
});
it('棘刺S2不受击不反击，但开启后保留3秒残毒；S1保留模组逐击法伤', () => {
  const { model, level } = build('棘刺', 1);
  // 29−10=19秒开启，随后毒保留3秒，余下8秒没有伤害。
  const n = (704.1573033707865 * .05 + 704.1573033707865 * .1 * .75) * 30 / 37 + 93.75;
  expect(model.skill!.dps).toBe(0);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(19 * n + 3 * 93.75, 8);
  const s1 = build('棘刺', 0);
  const a = 704.1573033707865 * 1.6;
  expect(s1.model.skill!.dps).toBeCloseTo((a - 1000 + a * .1 * .75) * 30 / 37 + 93.75, 8);
});
it('引星两阶默认S2：炼金单元期间继续普攻和回技力，计天赋延长及模组', () => {
  for (const key of ['a', 'b'] as const) {
    // b: A=518.6404494*1.15；普攻物理保底5%*1.05/1.5；单位DPS=A*1.4*.75。
    // 24−13=11秒首投，存续15+4=19秒恰至30秒；下一投间隔19+(24−19*1.1)=22.1秒。
    // a: A=405*1.1，15秒首投，存续12+3=15秒，下一投间隔27秒。
    const a = key === 'b' ? 518.6404494382023 * 1.15 : 405 * 1.1;
    const n = a * .05 * 30 / 43;
    const d = a * (key === 'b' ? 1.4 : 1.2) * .75;
    const lifetime = key === 'b' ? 19 : 15;
    const period = key === 'b' ? 22.1 : 27;
    const { model, level } = build('引星棘刺', 1, key);
    expect(model.skill!.dps).toBeCloseTo(n + d, 8);
    expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(n * 30 + d * lifetime, 8);
    expect(timeline(model, level, 30, 1e6).cycle!.avgDps).toBeCloseTo(n + d * lifetime / period, 8);
  }
});
it('引星S1只有普攻伤害；S3按每秒提升减防减抗和区域倍率', () => {
  const a = 518.6404494382023 * 1.15;
  const n = a * .05 * 30 / 43;
  const s1 = build('引星棘刺', 0);
  expect(timeline(s1.model, s1.level, 30, 1e6).totalDamage).toBeCloseTo(n * 30, 8);
  const s3 = build('引星棘刺', 2);
  // 64−40=24秒首投，后6秒为k=0..5；物理普攻随区域减防，区域伤害不乘目标数。
  let total = 24 * n;
  for (let k = 0; k < 6; k++) total += Math.max(a - 1000 * (1 - .33 - .008 * k), a * .05) * 30 / 43 + a * (1.5 + .12 * k) * (1 - .25 * (1 - .33 - .008 * k));
  expect(timeline(s3.model, s3.level, 30, 1e6).totalDamage).toBeCloseTo(total, 8);
});
it('两阶全部技能都有明确生命周期与有限30秒结果', () => {
  for (const name of ['棘刺', '引星棘刺']) for (const key of ['a', 'b'] as const) for (const index of [0, 1, 2]) {
    const { model, level } = build(name, index, key);
    expect(model.lifecycle).not.toBe('unknown');
    expect(Number.isFinite(timeline(model, level, 30, 1418400).totalDamage)).toBe(true);
  }
});

it('引星初始充能扣除后保留余数，提前第二个单元且重叠伤害相加', () => {
  // 13+17=30SP，立即投一次消耗24，余6；下一次只需18/1.1秒。
  // 30秒内第一单元19秒，第二单元30−18/1.1秒；普攻持续30秒。
  const { model, level } = build('引星棘刺', 1, 'b', 17);
  const a = 518.6404494382023 * 1.15;
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(a * .05 * 30 / 43 * 30 + a * 1.4 * .75 * (19 + 30 - 18 / 1.1), 8);
});
