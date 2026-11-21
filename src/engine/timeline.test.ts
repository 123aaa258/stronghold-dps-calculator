import { expect, it } from 'vitest';
import skills from '../data/generated/skills.json' with { type: 'json' };
import { calculate } from './calc.ts';
import { timeline } from './timeline.ts';
import { lifecycle } from './skills/generic.ts';
import type { GenericModel } from './skills/generic.ts';
import type { PhaseResult, SkillData, SkillLevelData } from './types.ts';
const phase = (dps: number): PhaseResult => ({ stats: { atk: dps, attackSpeed: 100, attackInterval: 1, derivation: { atk: [], attackSpeed: [], attackInterval: [] } }, dps,
  components: [{ label: '测试', source: 'test', damageType: 'true', perHit: dps, hitsPerAttack: 1, hitsPerSec: 1, dps, countsTowardDps: true, derivation: [] }] });
const model: GenericModel = { normal: phase(10), skill: phase(30), lifecycle: 'timed', duration: 5, burst: false, passive: false, notes: [], caveats: [], ignoredKeys: [], unconsumed: [] };
const level: SkillLevelData = { description: '', spType: 'INCREASE_WITH_TIME', spTypeRaw: 1, spCost: 10, initSp: 6, increment: 1, duration: 5, maxChargeTime: 1, rangeId: null, prefabId: null, blackboard: { nums: {} } };
it('首轮、循环尾段与击杀均逐段积分', () => {
  // 首轮等4s=40伤害，技能5s=150；循环等10s=100，技能5s=150；最后6s=60。
  // 30秒总和=500；平均(10×10+30×5)/15=50/3，恰巧500，另取28s→480≠466.6667。
  // HP100：前4秒扣40，剩60在技能中需2s→6s；HP440→首轮190+循环250，到24s击杀。
  expect(timeline(model, level, 28, 100).totalDamage).toBe(480);
  expect(timeline(model, level, 28, 100).killTimeSec).toBe(6);
  expect(timeline(model, level, 30, 440).killTimeSec).toBe(24);
});
it('充能初始库存按maxChargeTime封顶，每次只消耗一份', () => {
  // initSp=99，cost10、上限2次→20SP，t=0连续两次瞬发各30=60。
  // 普攻10秒=100，t=10又瞬发30，总190；HP50在t=0第二次命中击杀。
  const result = timeline({ ...model, lifecycle: 'charge', duration: 0, burst: true }, { ...level, initSp: 99, maxChargeTime: 2 }, 10, 50);
  expect(result.totalDamage).toBe(190);
  expect(result.killTimeSec).toBe(0);
  expect(result.cycle!.spRecoverSec).toBe(10);
});
it('受击回复0、永久、零伤害的时间过程', () => {
  // ON_DEFEND且初始6<10，不假设Boss攻击→永远普攻：30秒300，HP100需10秒。
  expect(timeline(model, { ...level, spType: 'ON_DEFEND' }, 30, 100).totalDamage).toBe(300);
  // 永久：等4秒40伤，之后26秒×30=780，总820；无循环。
  const permanent = timeline({ ...model, lifecycle: 'permanent', duration: Infinity }, level, 30, 100);
  expect(permanent.totalDamage).toBe(820);
  expect(permanent.cycle).toBeNull();
  // 正血量/零DPS，任意时间无法击杀→Infinity，不能出现NaN。
  const zero = timeline({ ...model, normal: phase(0), skill: null }, level, 30, 100);
  expect(zero.totalDamage).toBe(0);
  expect(zero.killTimeSec).toBe(Infinity);
});
it('未知生命周期不能凭duration或PASSIVE猜常驻', () => {
  // 不支持的durationType→unknown；PASSIVE且描述部署后但没有持续数据→unknown。
  const s: SkillData = { skillId: 'test', name: '', skillType: 'MANUAL', durationType: 'UNRECOGNIZED', iconId: null, levels: {} };
  expect(lifecycle(s, level).lifecycle).toBe('unknown');
  expect(lifecycle({ ...s, skillType: 'PASSIVE', durationType: 'NONE' }, { ...level, duration: -1, description: '部署后发动特殊效果' }).lifecycle).toBe('unknown');
  // 无开启条件证据的PASSIVE同样unknown，不能由duration=-1直接判常驻。
  expect(lifecycle({ ...s, skillType: 'PASSIVE', durationType: 'NONE' }, { ...level, duration: -1, description: '未知被动' }).lifecycle).toBe('unknown');
});

const conditions = { tier: 'b' as const, bossId: 'boss_1', modeId: 'mode_single_10', equips: [] };
it.each([
  ['skchr_billro_1', 17, 18, 17],
  ['skchr_billro_2', 18, 25, 25],
  ['skchr_billro_3', 27, 28, 21],
] as const)('卡涅利安 %s 一份技力即可开技攻击', (skillId, first, recovery, duration) => {
  const input = { ...conditions, charId: 'char_426_billro', skillId, bonds: [{ bondId: 'sargonShip', activeChars: 3, stacks: 0 }] };
  const result = calculate({ ...input, durationSec: first + 1 });
  expect(calculate({...input, durationSec:first - 1e-5}).totalDamage.value).toBe(0);
  // 开技与第一发同帧。S1 在 0、0.5、1 秒命中；S2 在 0、0.3、0.6、0.9 秒命中。
  // S3 第三发在技能第1秒，获得首层 +10% 攻击。胄法抗25，精锐初始攻击取基础面板。
  const baseHit = 871.8876404494382 * .75;
  const multiplier = skillId.endsWith('_1') ? 3 * 1.4 : skillId.endsWith('_2') ? 4 : 3.1;
  expect(result.totalDamage.value).toBeCloseTo(baseHit * multiplier, 8);
  expect(result.cycle).toMatchObject({ spRecoverSec: recovery, skillDurationSec: duration });
});

it.each([
  ['char_1036_fang2', 'skchr_fang2_1', 5],

] as const)('%s 的下次攻击技能按一份技力触发', (charId, skillId, recovery) => {
  // 精锐历阵锐枪芬从 0 SP 起，5 秒可强化下一次攻击。
  const result = calculate({ ...conditions, charId, skillId, bonds: [{ bondId: 'kazimierzShip', activeChars: 3, stacks: 0 }] });
  expect(result.skill).not.toBeNull();
  expect(result.cycle?.spRecoverSec).toBe(recovery);
  expect(result.cycle?.skillDurationSec).toBeCloseTo(result.skill!.stats.attackInterval, 8);
});

it('薇薇安娜一份技力就绪，在下一个攻击时刻以强化二连替换普攻', () => {
  const input = { ...conditions, charId: 'char_4098_vvana', skillId: 'skchr_vvana_1', bonds: [] };
  const r = calculate(input);
  const interval = 38 / 30;
  const hit = r.normal.components[0]!.perHit;
  // 4 秒回满时前三次普攻已经命中，第 4 次攻击为 170% 法伤的二连。
  const at = (t: number) => calculate({ ...input, durationSec:t }).totalDamage.value;
  expect(at(4 * interval - .001)).toBeCloseTo(3 * hit, 7);
  expect(at(4 * interval)).toBeCloseTo((3 + 2 * 1.7) * hit, 7);
});

it('历阵锐枪芬二技能从部署生效，到期后恢复普攻', () => {
  // 进阶被动持续18秒。20秒内先计18秒技能，再计2秒普攻，每次部署只生效一次。
  const result = calculate({ ...conditions, charId: 'char_1036_fang2', skillId: 'skchr_fang2_2', durationSec: 20,
    bonds: [{ bondId: 'kazimierzShip', activeChars: 3, stacks: 0 }] });
  expect(result.lifecycle).toBe('on_deploy');
  expect(result.cycle).toBeNull();
  expect(result.totalDamage.value).toBeCloseTo(18 * result.skill!.dps + 2 * result.normal.dps, 8);
});

it('薇薇安娜三技能首次和第二次开启有不同的持续区间', () => {
  const skill = skills.skchr_vvana_3 as SkillData;
  const level = skill.levels['7'];
  const life = lifecycle(skill, level);
  // 首轮30−12=18秒回技，18–33秒开技。再回30秒，63–88秒开技。技能共40秒，普攻共48秒。
  const result = timeline({ ...model, ...life }, level, 88, Infinity);
  expect(life.lifecycle).toBe('timed');
  expect(result.totalDamage).toBe(40 * 30 + 48 * 10);
  expect(result.cycle?.skillDurationSec).toBe(25);
});

it('卡涅利安蓄满两份技力仍只开一次', () => {
  const skill = skills.skchr_billro_2 as SkillData;
  const full = { ...skill.levels['7'], initSp: 50 };
  // S2满50技力只开一次25秒技能。其后10秒回技：25×30 + 10×10 = 850。
  expect(timeline({ ...model, ...lifecycle(skill, full) }, full, 35, Infinity).totalDamage).toBe(850);
});

it('卡涅利安二技能的间隔缩短先于萨尔贡攻速结算', () => {
  // 进阶每击间隔(2−0.8)÷(400/100)=0.3秒，即9帧。
  const result = calculate({ ...conditions, charId: 'char_426_billro', skillId: 'skchr_billro_2',
    bonds: [{ bondId: 'sargonShip', activeChars: 3, stacks: 0 }] });
  expect(result.skill!.stats.attackInterval).toBeCloseTo(9 / 30, 8);
});

it('薇薇安娜三技能按延长后的攻击间隔触发卡西米尔真伤', () => {
  // 进阶100攻速，(1.25+0.5)×30=52.5，取53帧，卡西米尔每秒附伤30/53次。
  const result = calculate({ ...conditions, charId: 'char_4098_vvana', skillId: 'skchr_vvana_3',
    bonds: [{ bondId: 'kazimierzShip', activeChars: 6, stacks: 0 }] });
  const extra = result.skill!.components.find(c => c.source === 'bond:kazimierzShip');
  expect(extra?.hitsPerSec).toBeCloseTo(30 / 53, 8);
});
