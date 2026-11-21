import { swiftSucceeds } from '../../swift.ts';
import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { generic } from '../generic.ts';
import { logosOverride } from './char_4133_logos.ts';
import { eyjaOverride } from './char_180_amgoat.ts';
import { timeline } from '../../timeline.ts';
import { battleEffects } from '../../effects/common.ts';
function build(name: string, index: number, tierKey: 'a' | 'b' = 'b', effects = battleEffects(), resistance = 25) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === name)!;
  const tier = operator.tiers[tierKey];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = { ...(bosses as BossData[]).find(b => b.bossId === 'boss_1')!, levelType: 'BOSS' as const };
  boss.attributes = { ...boss.attributes!, magicResistance: resistance };
  const context = { operator, tier, skill, level, boss };
  const model = (name === '逻各斯' ? logosOverride : eyjaOverride)(context, generic(operator, tier, skill, level, boss, effects));
  return { model, level, boss };
}
it('逻各斯进阶S3：双次天赋、逐击150、模组回技力与30秒分段手算', () => {
  // A=692.2359550561798；RES25−10=15；间隔1.6。
  // 普攻DPS=[(A+150)+0.8*(0.65A+150)]*0.85/1.6。
  // 技能A'=3.2A，代入同式；回技力=1+(1+0.8)/1.6=2.125。
  // 首次开启=(45−18)/2.125=12.7058823529；30秒=普攻*首次+技能*(30−首次)。
  const { model, level } = build('逻各斯', 2);
  const a = 692.2359550561798;
  const normal = ((a + 150) + 0.8 * (0.65 * a + 150)) * 0.85 / 1.6;
  const active = ((3.2 * a + 150) + 0.8 * (0.65 * 3.2 * a + 150)) * 0.85 / 1.6;
  expect(model.normal.dps).toBeCloseTo(normal, 8);
  expect(model.skill!.dps).toBeCloseTo(active, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(normal * (27 / 2.125) + active * (30 - 27 / 2.125), 8);
});
it('999层强化奥术：首击、附伤、30秒与满层火山共用同一伤害过程', () => {
  const effects = battleEffects();
  const source = 'bond:arcaneShip', scale = .2 + .004 * 999, cap = 30 + .05 * 999;
  effects.extraHits.push({type: 'arts', scale, hits: 1, source});
  effects.resReductionFixed = cap;
  const {model, level} = build('艾雅法拉', 2, 'b', effects, 100);
  // 法抗100扣79.95再扣10法穿，原击与附伤均乘0.8995。首次29秒开启火山。
  const hit = (attack: number) => attack * (1 + scale) * .8995;
  const normal = hit(647.9213483146068 * 1.14) / 1.6;
  const active = hit(647.9213483146068 * 1.99) / .5;
  const result = timeline(model, level, 30, Infinity);
  expect(model.normal.dps).toBeCloseTo(normal, 7);
  expect(model.skill!.dps).toBeCloseTo(active, 7);
  expect(result.totalDamage).toBeCloseTo(29 * normal + active, 7);
  expect(result.cycle!.avgDps).toBeCloseTo((80 * normal + 15 * active) / 95, 7);
});
it('逻各斯双次语汇各自触发奥术，但不重复触发装备或奥术本身', () => {
  const effects = battleEffects();
  effects.extraHits.push({type:'arts',scale:.2,hits:1,source:'bond:arcaneShip'}, {type:'true',scale:.25,hits:1,source:'equip:test'});
  const {model} = build('逻各斯', 2, 'b', effects);
  const parts = model.normal.components.filter(hit => hit.source === 'bond:arcaneShip');
  expect(parts.map(hit => hit.hitsPerAttack)).toEqual([1, .8]);
  expect(parts[1]!.dps).toBeCloseTo(.8 * (.2 * 692.2359550561798 + 150) * .85 / 1.6, 8);
  expect(model.normal.components.filter(hit => hit.source === 'equip:test')).toHaveLength(1);
});
it('固定减抗下迅捷成功和失败各自计算技能窗口', () => {
  const windowDamage = (probability: number) => {
    const effects = battleEffects();
    effects.resReductionFixed = 30;
    effects.skillEndProbability = probability;
    effects.skillEndSp = 80;
    const {model, level} = build('艾雅法拉', 2, 'b', effects, 100);
    return timeline(model, level, 50, Infinity).totalDamage;
  };
  // 44秒首次技能结束。之后6秒只有一次回技判定（固定判定序列第0次）：成功继续火山，失败回复期间普攻。
  expect(windowDamage(.34)).toBeCloseTo(swiftSucceeds(0, .34) ? windowDamage(1) : windowDamage(0), 7);
});
it('逻各斯S1：斩杀门槛缩短击杀用时', () => {
  // 等待68/2.125=32秒；开启攻击1.7A，斩杀线=1.2*1.7A。
  // 构造HP=等待期间伤害+斩杀线+技能10秒伤害，则击杀时间32+10=42秒。
  const { model, level } = build('逻各斯', 0);
  const threshold = 692.2359550561798 * 1.7 * 1.2;
  const hp = model.normal.dps * 32 + threshold + model.skill!.dps * 10;
  expect(timeline(model, level, 30, hp).killTimeSec).toBeCloseTo(42, 8);
});
it('艾雅法拉进阶S3：14%天赋、0.5秒间隔与部署11技力手算', () => {
  // A=647.9213483146068；正常1.14A，技能(1+.14+.85)A=1.99A。
  // RES25−10=15；普攻DPS=1.14A*.85/1.6，技能DPS=1.99A*.85/.5。
  // 乱火均值11，开启=80−40−11=29秒；30秒伤害=29秒普攻+1秒火山。
  const { model, level } = build('艾雅法拉', 2);
  const a = 647.9213483146068;
  const normal = a * 1.14 * 0.85 / 1.6;
  const active = a * 1.99 * 0.85 / 0.5;
  expect(model.skill!.stats.attackInterval).toBeCloseTo(0.5, 8);
  expect(model.skill!.dps).toBeCloseTo(active, 8);
  expect(timeline(model, level, 30, 1e6).totalDamage).toBeCloseTo(29 * normal + active, 8);
});
it('艾雅法拉S1：首次只有攻速，第二次追加45%攻击', () => {
  // 初次39−20−11=8秒；首次持续25秒，之后回技力39秒，第二次72秒开。
  // 73秒总伤害=(8+39)*普攻 +25*(1.14A*.85*1.45/1.6) +1*(1.59A*.85*1.45/1.6)。
  const { model, level } = build('艾雅法拉', 0);
  const a = 647.9213483146068;
  const normal = a * 1.14 * .85 / 1.6;
  const first = a * 1.14 * .85 / (33 / 30);
  const later = a * 1.59 * .85 / (33 / 30);
  expect(model.skill!.dps).toBeCloseTo(later, 8);
  expect(timeline(model, level, 73, 1e6).totalDamage).toBeCloseTo(47 * normal + 25 * first + later, 8);
});
it('两阶全部技能均提供有限伤害与时间过程，S2减抗两段按主目标结算', () => {
  for (const tier of ['a', 'b'] as const) for (const name of ['逻各斯', '艾雅法拉']) for (const skill of [0, 1, 2]) {
    const { model, level } = build(name, skill, tier);
    expect(Number.isFinite(timeline(model, level, 30, 1e6).totalDamage)).toBe(true);
    expect(model.skill!.dps).toBeGreaterThan(0);
  }
  const { model } = build('艾雅法拉', 1);
  // 两段各1.55*1.14A；先RES25*.8−10=10；每击伤害=1.55*1.14A*.9。
  expect(model.skill!.components[0]!.perHit).toBeCloseTo(647.9213483146068 * 1.14 * 1.55 * .9, 8);
  expect(model.skill!.components[0]!.hitsPerAttack).toBe(2);
});
