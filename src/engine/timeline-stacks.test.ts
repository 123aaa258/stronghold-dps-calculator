import { swiftSucceeds } from './swift.ts';
import { expect, it } from 'vitest';
import operatorsJson from '../data/generated/operators.json' with { type: 'json' };
import bossesJson from '../data/generated/bosses.json' with { type: 'json' };
import equipsJson from '../data/generated/equips.json' with { type: 'json' };
import { battleEffects, type BattleEffects } from './effects/common.ts';
import { applyEquips } from './effects/equips.ts';
import { generic } from './skills/generic.ts';
import { timeline } from './timeline.ts';
import type { BossData, EquipData, OperatorData, SkillData, SkillLevelData } from './types.ts';

// 干员/目标结构沿用生成数据，清除天赋特性并设ATK100、间隔1秒、零防抗，便于独立手算。
const operator = (operatorsJson as unknown as OperatorData[]).find(o => o.name === '蓝毒')!;
const tier = { ...operator.tiers.b, trait: null, talents: [], garrisonIds: [],
  attributes: { ...operator.tiers.b.attributes, atk: 100, attackSpeed: 100, baseAttackTime: 1 } };
const originalBoss = (bossesJson as BossData[])[0];
const boss: BossData = { ...originalBoss, attributes: { ...originalBoss.attributes!, def: 0, magicResistance: 0 } };
const level: SkillLevelData = { description: '', spType: 'INCREASE_WITH_TIME', spTypeRaw: 1,
  spCost: 2, initSp: 2, increment: 1, duration: 1, maxChargeTime: 1, rangeId: null,
  prefabId: null, blackboard: { nums: {} } };
const skill: SkillData = { skillId: 'test', name: '测试', skillType: 'MANUAL', durationType: 'NONE', iconId: null, levels: {} };
const model = (e: BattleEffects, l = level, s = skill) => generic(operator, tier, s, l, boss, e);
const attackStacks = () => {
  const e = battleEffects();
  e.stacks.push({ trigger: 'attack', max: 2, modifier: { stat: 'atk', bucket: 'pct', value: 0.1, source: 'test' } });
  return e;
};

it('真实炎国短刀从首次技能开启逐层增加，30秒手算并验证十层上限', () => {
  const e = battleEffects();
  applyEquips(e, [(equipsJson as EquipData[]).find(x => x.chessId === 'chess_item_3_03_e_a')!], 0);
  // 每次技能持续1秒、再等2秒，t=0,3,...,27开启第1..10次。
  // 每3秒DPS依次105,110,...,150：30秒=3×(105+150)×10/2=3825。
  // 此后封顶150，36秒=3825+6×150=4725；HP3825恰在30秒击杀。
  const result = timeline(model(e), level, 30, 3825);
  expect(result.totalDamage).toBeCloseTo(3825, 8);
  expect(result.killTimeSec).toBeCloseTo(30, 8);
  expect(timeline(model(e), level, 36, 10000).totalDamage).toBeCloseTo(4725, 8);
});

it('攻击叠层从完整攻击间隔结束后生效', () => {
  const e = attackStacks();
  const m = model(e);
  const passive = { ...m, skill: null, rebuild: (...args: Parameters<NonNullable<typeof m.rebuild>>) => ({ ...m.rebuild!(...args), skill: null }) };
  // [0,1)100，[1,2)110，[2,30)120：100+110+28×120=3570。
  expect(timeline(passive, level, 30, 3570).totalDamage).toBeCloseTo(3570, 8);
});

it('部署限时攻击力加成到期后不保留', () => {
  const e = battleEffects();
  e.timedStats.push({ until: 5, modifier: { stat: 'atk', bucket: 'pct', value: 1, source: 'test' } });
  // 前5秒200DPS，后25秒100DPS：1000+2500=3500。
  expect(timeline(model(e), level, 30, 3500).totalDamage).toBeCloseTo(3500, 8);
});

it('有限停止攻击技能结束后仍继续攻击叠层', () => {
  const e = attackStacks();
  const l = { ...level, description: '停止攻击', duration: 2, spCost: 100, initSp: 100 };
  // t=0..2停攻；2..3为100，3..4为110，4..30为120，总3330。
  expect(timeline(model(e, l), l, 30, 3330).totalDamage).toBeCloseTo(3330, 8);
});

it('停攻技能被迅捷无间隔续开时不等待普攻叠层', () => {
  const e = attackStacks();
  e.skillEndSp = level.spCost;
  e.skillEndProbability = 1;
  const l = { ...level, description: '停止攻击' };
  const result = timeline(model(e, l), l, 30, 100);
  expect(result.totalDamage).toBe(0);
  expect(result.cycle?.avgDps).toBe(0);
  expect(result.killTimeSec).toBe(Infinity);
});

it('永久停止攻击时未达上限的攻击叠层不会导致无限等待', () => {
  const e = attackStacks();
  const l = { ...level, description: '停止攻击，持续时间无限' };
  const result = timeline(model(e, l), l, 30, 100);
  expect(result.totalDamage).toBe(0);
  expect(result.killTimeSec).toBe(Infinity);
});

it.each(['attack', 'expiry'])('弹药期间攻速变化保留剩余弹数进度：%s', kind => {
  const e = battleEffects();
  const modifier = { stat: 'attackSpeed', bucket: 'direct', value: 100, source: 'test' } as const;
  if (kind === 'attack') e.stacks.push({ trigger: 'attack', max: 1, modifier });
  else e.timedStats.push({ until: 0.5, modifier });
  const l = { ...level, description: '攻击力+{atk:0%}，装有{trigger_time}发子弹', duration: 0,
    spCost: 100, initSp: 100, blackboard: { nums: { atk: 1, trigger_time: 3 } } };
  // attack：首弹1秒，后两弹共1秒；3秒内技能600伤害+普攻1秒×200=800。
  // expiry：首弹0.5秒，攻速到期后两弹共2秒；技能600+普攻0.5秒×100=650。
  expect(timeline(model(e, l, { ...skill, durationType: 'AMMO' }), l, 3, 10000).totalDamage)
    .toBeCloseTo(kind === 'attack' ? 800 : 650, 8);
});

it('初始技力、消耗缩放、自然回复一起进入首轮时间过程', () => {
  const e = battleEffects();
  e.initSp = 2; e.spCostScale = 0.5; e.spRecovery = 1;
  const l = { ...level, spCost: 10, initSp: 0, duration: 2,
    description: '攻击力+{atk:0%}', blackboard: { nums: { atk: 1 } } };
  // cost5、init2、回复2/s：先等1.5秒，技能2秒，再普攻0.5秒。
  // 4秒=1.5×100+2×200+0.5×100=600。
  expect(timeline(model(e, l), l, 4, 10000).totalDamage).toBeCloseTo(600, 8);
});

it.each([[7, 2700], [9, 2900]])('迅捷在限时属性到期（第%s秒）前后都只回技一次', (until, expected) => {
  const e = battleEffects();
  e.skillEndSp = 5.1;
  e.skillEndProbability = 1;
  e.timedStats.push({ until, modifier: { stat: 'atk', bucket: 'pct', value: 1, source: 'test' } });
  const l = { ...level, spCost: 10, initSp: 4, duration: 2,
    description: '攻击力+{atk:0%}', blackboard: { nums: { atk: 1 } } };
  // t=6..8、12.9..14.9共4秒技能。16秒普攻底伤1600，技能额外400，限时ATK额外100×7或100×9。
  const result = timeline(model(e, l), l, 16, 10000);
  expect(result.cycle!.spRecoverSec).toBeCloseTo(4.9, 8);
  expect(result.totalDamage).toBeCloseTo(expected, 8);
});

it('附加伤害由原攻击各段触发一次，不递归触发', () => {
  const e = battleEffects();
  e.extraHits.push({ type: 'arts', scale: 0.25, hits: 2, source: 'test' });
  const l = { ...level, description: '连续攻击{times}次', blackboard: { nums: { times: 2 } } };
  // 原攻击2×100；每段附带2×25法伤：200+2×2×25=300DPS，附伤不再递归。
  const m = model(e, l);
  expect(m.skill!.dps).toBe(300);
  expect(m.skill!.components.map(c => c.hitsPerAttack)).toEqual([2, 4]);
});

it('明确瞬发攻击也触发一次攻击叠层', () => {
  const e = battleEffects();
  e.stacks.push({ trigger: 'attack', max: 1, modifier: { stat: 'attackSpeed', bucket: 'direct', value: 100, source: 'test' } });
  const l = { ...level, description: '立即进行一次攻击，造成相当于攻击力{atk_scale:0%}的物理伤害',
    duration: 0, spCost: 100, initSp: 100, blackboard: { nums: { atk_scale: 1 } } };
  // t=0瞬发攻击100，触发一次攻速+100；随后1秒普攻200，总300。
  expect(timeline(model(e, l), l, 1, 10000).totalDamage).toBeCloseTo(300, 8);
});

it('纯治疗不能触发伤害叠盟约，时间过程仍终止', () => {
  const e = battleEffects();
  e.bondStacks = { perDamage: 1, max: 12, source: 'equip:test' };
  const healer = { ...operator, profession: 'MEDIC' as const, subProfessionId: 'medic' };
  const m = generic(healer, tier, skill, level, boss, e);
  const result = timeline(m, level, 30, 1000);
  expect(result.totalDamage).toBe(0);
  expect(result.killTimeSec).toBe(Infinity);
});

it('首次期望伤害达到550时击杀，窗口结束后仍能求交点', () => {
  const e = battleEffects();
  e.skillEndSp = 2;
  e.skillEndProbability = .5;
  const l = { ...level, duration: 2, description: '攻击力+{atk:0%}', blackboard: { nums: { atk: 1 } } };
  // [0,2]技能400伤害；第0次判定（固定判定序列）成功则[2,4]技能200 DPS，失败则普攻100 DPS。
  // 成功：2.5秒500、2.75秒达550；失败：2.5秒450、3.5秒达550。
  const ok = swiftSucceeds(0, .5);
  const result = timeline(model(e, l), l, 2.5, 550);
  expect(result.totalDamage).toBeCloseTo(ok ? 500 : 450, 8);
  expect(result.killTimeSec).toBeCloseTo(ok ? 2.75 : 3.5, 8);
  expect(result.notes.join('')).toContain('成功时整笔返还技力');
});

it('两次充能保留成功后的库存，只有连续两次失败才要重新充能', () => {
  const e = battleEffects();
  e.skillEndSp = 12;
  e.skillEndProbability = .5;
  const l = { ...level, duration: 1, spCost: 3, initSp: 3, maxChargeTime: 2,
    description: '攻击力+{atk:0%}', blackboard: { nums: { atk: 1 } } };
  // 成功回满库存6，下一次扣3后即使失败也有3可续开；库存为0且失败时等3秒普攻。
  // 按固定判定序列逐次判定，手工推进前3秒：技能 200 DPS、普攻 100 DPS。
  let t = 1, sp = 0, k = 0, damage = 200;
  while (t < 3 - 1e-9) {
    if (swiftSucceeds(k++, .5)) sp = Math.min(6, sp + 12);
    if (sp >= 3) { sp -= 3; damage += 200 * Math.min(1, 3 - t); t += 1; }
    else { const idle = Math.min(3 - sp, 3 - t); damage += 100 * idle; t += idle; sp = 3; if (t < 3 - 1e-9) { sp -= 3; damage += 200 * Math.min(1, 3 - t); t += 1; } }
  }
  const result = timeline(model(e, l), l, 3, 1000);
  expect(result.totalDamage).toBeCloseTo(damage, 8);
});

it('零触发概率与未配迅捷的时间过程相同', () => {
  const l = { ...level, duration: 2, description: '攻击力+{atk:0%}', blackboard: { nums: { atk: 1 } } };
  const baseline = timeline(model(battleEffects(), l), l, 7, 1050);
  const effects = battleEffects();
  effects.skillEndSp = 12;
  effects.skillEndProbability = 0;
  const zero = timeline(model(effects, l), l, 7, 1050);
  expect(zero.cycle).toEqual(baseline.cycle);
  expect(zero.totalDamage).toBe(baseline.totalDamage);
  expect(zero.killTimeSec).toBe(baseline.killTimeSec);
});

it('停攻期内裁度不触发，迅捷成功与失败分支分别数攻击', () => {
  const l = { ...level, description: '停止攻击' };
  const e = battleEffects();
  e.skillEndSp = 2;
  e.skillEndProbability = .5;
  e.timedStats.push({ until: 1, modifier: { stat: 'attackSpeed', bucket: 'direct', value: 0, source: 'test' } });
  const before = timeline(model(e, l), l, 2.2, 1000);
  e.judgment = { until: 2.2, damage: 5000, probability: .03 };
  const after = timeline(model(e, l), l, 2.2, 1000);
  // t=1 首次停攻结束，第0次判定：失败时在 t=2 普攻一次；成功则立即续开，窗口内没有完整普攻。
  expect(after.totalDamage - before.totalDamage).toBeCloseTo(swiftSucceeds(0, .5) ? 0 : 5000 * .03);
});
