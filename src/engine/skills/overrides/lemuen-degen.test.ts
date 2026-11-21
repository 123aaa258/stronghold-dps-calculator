import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { generic } from '../generic.ts';
import { lemuenOverride } from './char_4193_lemuen.ts';
import { degenOverride } from './char_4116_blkkgt.ts';
import { timeline } from '../../timeline.ts';
import { battleEffects } from '../../effects/common.ts';
import { calculate } from '../../calc.ts';
function build(name: string, index: number, tierKey: 'a' | 'b' = 'b', spRecovery = 0) {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === name)!;
  const tier = operator.tiers[tierKey];
  const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[index]!]!;
  const level = skill.levels[tier.skillLevel]!;
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_1')!;
  const context = { operator, tier, skill, level, boss };
  const external = { ...battleEffects(), spRecovery };
  const model = (name === '蕾缪安' ? lemuenOverride : degenOverride)(context, generic(operator, tier, skill, level, boss, external));
  return { model, level };
}
it('蕾缪安S3：首轮五弹快照、通缉与15秒天赋分段，稳态七弹技能DPS', () => {
  // A=1247.8539325842696, DEF=1000；普攻 N0=(A−1000)/2.7。
  // 8秒通缉后 N1=1.15N0；15秒后 N2=(1.18A−1000)*1.15/2.7。
  // 模组每次普攻+1SP，r=1+1/2.7；首次(42−29)/r=9.486486。
  // 首轮开技未满15秒，仅5弹；锁定2.5秒后快照A，每弹(3.9A−1000)*1.15。
  // 轰炸与恢复普攻并行，最后一弹早于15秒；30秒=8N0+(first−8+15−first−2.5)N1+15N2+5弹。
  // 稳态7弹、锁定3.5秒，每弹(3.9*1.18A−1000)*1.15，技能期DPS=7弹/3.5。
  const { model, level } = build('蕾缪安', 2);
  const a = 1247.8539325842696;
  const n0 = (a - 1000) / 2.7;
  const n1 = n0 * 1.15;
  const n2 = (1.18 * a - 1000) * 1.15 / 2.7;
  expect(model.skill!.dps).toBeCloseTo((3.9 * 1.18 * a - 1000) * 1.15 * 2, 8);
  expect(timeline(model, level, 30, 1418400).totalDamage).toBeCloseTo(8*n0 + 4.5*n1 + 15*n2 + 5*(3.9*a-1000)*1.15, 8);
});
it.each([['蕾缪安',1,13.5],['锏',1,6.5],['锏',2,9.1]] as const)('%s S%i：自然回复增益不改变攻击回复的首开、循环及30秒伤害', (name,skillNumber,first) => {
  // 蕾缪安模组保留每攻+1SP：10/(2/2.7)=13.5秒；锏S1=5*1.3，S2=(12-5)*1.3。
  const index = skillNumber-1;
  const baseline = build(name,index);
  const boosted = build(name,index,'b',.25);
  const before = timeline(baseline.model,baseline.level,30,1418400);
  const after = timeline(boosted.model,boosted.level,30,1418400);
  expect(after.cycle).toEqual(before.cycle);
  expect(after.totalDamage).toBeCloseTo(before.totalDamage,8);
  for (const time of [first-1e-6,first+1e-6]) {
    expect(timeline(boosted.model,boosted.level,time,1418400).totalDamage)
      .toBeCloseTo(timeline(baseline.model,baseline.level,time,1418400).totalDamage,8);
  }
});
it('蕾缪安S2：满瞄准三秒加固定1.2秒后摇，8弹，攻速不缩短瞄准', () => {
  // 攻击力加成为天赋18%+技能50%=1.68A；单弹=(1.68A*3.9−1000)*1.15。
  // 满瞄准3秒+PRTS强制后摇1.2秒=4.2秒，六弹+天赋二弹=8弹，共33.6秒。
  const { model } = build('蕾缪安', 1);
  expect(model.skill!.dps).toBeCloseTo((1247.8539325842696*1.68*3.9-1000)*1.15/4.2, 8);
  expect(model.duration).toBeCloseTo(33.6, 8);
});
it('锏S3：十连斩和终结斩，首次18秒开，技能后5秒穿防', () => {
  // A=637.8089887640449。普攻双段：90%保底.05A，10%暴击1.7A−750。
  // N=2*(.9*.05A+.1*(1.7A−750))/1.3。
  // 斩击C=(2*1.7A−750)*1.1，终结F=(3*1.7A−750)*1.1；技能总伤10C+F。
  // 近似连斩3秒(10*.3)，终结放在3秒末；技能DPS=(10C+F)/3。
  // 首次33−15=18秒：0~18普攻；18~21连斩；21~26战栗普攻；26~30普攻。
  // 战栗普攻T=2*(.9*max(.05A,A−750)+.1*(1.7A−750))/1.3（此Boss仍保底，T=N）。
  const { model, level } = build('锏', 2);
  const a = 637.8089887640449;
  const n = 2*(.9*.05*a+.1*(1.7*a-750))/1.3;
  const total = (10*(2*1.7*a-750)+(3*1.7*a-750))*1.1;
  expect(model.skill!.dps).toBeCloseTo(total/3, 8);
  expect(model.duration).toBe(3);
  expect(timeline(model, level, 30, 1418400).totalDamage).toBeCloseTo(27*n+total, 8);
  expect(timeline(model, level, 30, 1418400).cycle!.avgDps).toBeCloseTo((33*n+total)/36, 8);
});
it('锏S2：被阻挡目标三斩全部暴击穿防，攻击回复按攻击而非段数', () => {
  // 单斩=(2.8*1.7A−750)*1.1，三斩；初始5/消耗12，等待7*1.3=9.1秒。
  // 近似三斩压为开技瞬发，检查首次命中前后增量（普通伤害连续）。
  const { model, level } = build('锏', 1);
  const before = timeline(model, level, 9.1-1e-6, 1418400).totalDamage;
  const after = timeline(model, level, 9.1+1e-6, 1418400).totalDamage;
  expect(after-before).toBeCloseTo(3*(2.8*1.7*637.8089887640449-750)*1.1, 2);
});
function kazimierzDegen(skill: number, durationSec: number, activeChars: number, swift = false) {
  const bonds = [{ bondId: 'kazimierzShip', activeChars, stacks: 0 }];
  if (swift) bonds.push({ bondId: 'swiftShip', activeChars: 2, stacks: 40 });
  return calculate({ charId: 'char_4116_blkkgt', skillId: `skchr_blkkgt_${skill}`, tier: 'a', equips: [],
    bossId: 'boss_1', modeId: 'mode_single_10', durationSec, bonds });
}
it('锏六人卡西米尔：普攻双段及S2同次三斩都只附带一次', () => {
  // 普通阶0层面板495×1.5；每次动作附带65%。S2在(15−2)×1.3=16.9秒三斩一次。
  // 17秒共17/1.3次连续普攻、1次瞬发技能；暴击和多段均不增加触发次数。
  const hit = 495 * 1.5 * .65;
  const six = kazimierzDegen(2, 17, 6);
  expect(six.normal.components.find(c => c.source === 'bond:kazimierzShip')?.dps).toBeCloseTo(hit / 1.3, 8);
  expect(six.totalDamage.value - kazimierzDegen(2, 17, 3).totalDamage.value).toBeCloseTo(hit * (17 / 1.3 + 1), 8);
});
it('锏S3每次斩击附带真伤，部署与开技后30秒窗口内的普攻也各附带一次', () => {
  // 第一轮25~28秒共11次斩击，第二轮63秒重开。其余时间每1.3秒一次普攻。
  // 窗口 [0,30) ∪ [25,55) ∪ [63,93)：55~63秒的普攻不附带；第二轮首0.3秒沿专属时间轴的斩击节拍积分：
  // 十连斩每 0.3 秒一斩（终结斩在末端单独结算），0.3 秒内为 1 斩。
  const hit = 495 * 1.5 * .65;
  const extras = kazimierzDegen(3, 30, 6).skill!.components.filter(c => c.source === 'bond:kazimierzShip');
  expect(extras).toHaveLength(1);
  expect(extras[0]!.dps).toBeCloseTo(11 * hit / 3, 8);
  for (const [seconds, actions] of [[55, 11 + 52 / 1.3], [62.5, 11 + 52 / 1.3], [63.3, 11 + 52 / 1.3 + 1]]) {
    const six = kazimierzDegen(3, seconds, 6), three = kazimierzDegen(3, seconds, 3);
    expect(six.totalDamage.value - three.totalDamage.value).toBeCloseTo(hit * actions, 8);
    // 循环平均 = 窗口总伤 ÷ 窗口时长。
    expect(six.cycle!.avgDps - three.cycle!.avgDps).toBeCloseTo(hit * actions / seconds, 8);
  }
});
it('锏S3迅捷分别计入两条施放轨迹的卡西米尔附伤', () => {
  // 40层迅捷的非成员概率.34，28秒第0次判定。成功返15SP：48秒再次开技、51秒结束，
  // 窗口 [0,30)∪[25,55)∪[48,78) 覆盖到60秒，共22斩+54/1.3次普攻。
  // 失败则63秒才开第二轮，窗口 [0,55)，60秒只有11斩+52/1.3次普攻。
  const hit = 495 * 1.5 * .65;
  const six = kazimierzDegen(3, 60, 6, true), three = kazimierzDegen(3, 60, 3, true);
  const actions = .34 * (22 + 54 / 1.3) + .66 * (11 + 52 / 1.3);
  expect(six.totalDamage.value - three.totalDamage.value).toBeCloseTo(hit * actions, 8);
  expect(six.cycle!.avgDps - three.cycle!.avgDps).toBeCloseTo(hit * actions / 60, 8);
});
it('两阶全部技能覆盖且时间过程有限', () => {
  for (const tier of ['a','b'] as const) for (const name of ['蕾缪安','锏']) for (const index of [0,1,2]) {
    const { model, level } = build(name,index,tier);
    expect(model.lifecycle).not.toBe('unknown');
    expect(model.skill!.dps).toBeGreaterThan(0);
    expect(Number.isFinite(timeline(model,level,30,1418400).totalDamage)).toBe(true);
  }
});
