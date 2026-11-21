import { describe, it, expect } from 'vitest';
import bondsJson from '../../data/generated/bonds.json';
import operatorsJson from '../../data/generated/operators.json';
import equipsJson from '../../data/generated/equips.json';
import type { BondData, OperatorData, EquipData } from '../types.ts';
import { applyBonds, stacked } from './bonds.ts';
import { battleEffects } from './common.ts';
import { applyGarrisons } from './garrisons.ts';
import { stats } from '../stats.ts';
import { damage } from '../damage.ts';
import { calculate } from '../calc.ts';
const bonds = bondsJson as BondData[];
const op = (id: string) => (operatorsJson as unknown as OperatorData[]).find(o => o.bondIds.includes(id))!;
const run = (id: string, stacks: number, activeChars: number, equips: EquipData[] = []) => {
  const e = battleEffects(); const o = op(id);
  applyBonds(e, bonds, [{ bondId: id, stacks, activeChars }], o, o.tiers.a, equips);
  return e;
};
describe('盟约与卫戍特质手算', () => {
  it.each([
    // 史尔特尔普通阶攻击544。突袭0层为544×1.25，50层为544×1.75，另有全体攻速+50。
    ['史尔特尔', 'raidShip', 0, 2, 680, 100],
    ['史尔特尔', 'raidShip', 50, 2, 952, 150],
    // 玛恩纳普通阶攻击301，非技能期不攻击，面板不含特性蓄力；卡西米尔0层部署加攻上限+50%，301×1.5=451.5。
    ['玛恩纳', 'kazimierzShip', 0, 3, 451.5, 100],
    // 森蚺普通阶攻速100，每层+12，开场叠满25层后攻速400。
    ['森蚺', 'sargonShip', 0, 3, 835, 400],
  ] as const)('%s 的 %s 在 %i 层、%i 人时计入开场面板', (name, bondId, stacks, activeChars, atk, speed) => {
    const o = (operatorsJson as unknown as OperatorData[]).find(o => o.name === name)!;
    const result = calculate({ charId: o.charId, tier: 'a', skillId: o.skillIds[o.defaultSkillIndex],
      bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [{ bondId, stacks, activeChars }] });
    expect(result.normal.stats.atk).toBeCloseTo(atk);
    expect(result.normal.stats.attackSpeed).toBe(speed);
    expect(result.notes.some(line => line.startsWith(`近似：bond:${bondId} `))).toBe(true);
  });
  it('卡西米尔与萨尔贡到6人开启各自的附伤，流沙两种伤害各取自身上限', () => {
    expect(run('kazimierzShip', 10, 5).kazimierz).toBeUndefined();
    // 10层时攻击上限为50%+10×1%=60%；附伤倍率65%，只在部署后与每次开技后30秒窗口内。
    const kazimierz = run('kazimierzShip', 10, 6);
    expect(stats({ atk: 100, attackSpeed: 100, baseAttackTime: 1 }, kazimierz.stats).atk).toBe(160);
    expect(kazimierz.kazimierz).toEqual({ scale: .65, duration: 30 });
    expect(run('sargonShip', 10, 5).quicksand).toBeUndefined();
    // 10层为5000+25×10=5250和800+4×10=840。4000层时只有前者达到100000上限。
    expect(run('sargonShip', 10, 6).quicksand).toEqual({ interval: 5, firstDelay: 5, damage: 5250, skillDamage: 840 });
    expect(run('sargonShip', 4000, 6).quicksand).toMatchObject({ damage: 100000, skillDamage: 16800 });
    expect(run('sargonShip', 25000, 6).quicksand?.skillDamage).toBe(100000);
  });
  it.each([
    // 0层突袭再部署加攻25%。卡西米尔部署加攻上限50%，6人每次本体攻击另加65%真伤。
    ['raidShip', 2, .25, /全程.*再部署条件.*25%/],
    ['kazimierzShip', 3, .5, /开场.*上限.*全程.*50%/],
    ['kazimierzShip', 6, 0, /被击倒.*忽略/],
    // 萨尔贡每层攻速+12，25层共+300；6人仅从自身首次开技起计一块流沙。
    ['sargonShip', 3, 300, /开场.*25.*全程.*\+300/],
    ['sargonShip', 6, 1, /首次开技.*一块流沙.*默认敌人始终位于流沙上/],
  ] as const)('%s 的 %i 人效果在计算记录和近似说明中给出假设', (bondId, count, value, assumption) => {
    const effects = run(bondId, 0, count);
    expect(effects.derivation).toContainEqual(expect.objectContaining({
      source: `bond:${bondId}`, value, label: expect.stringMatching(assumption),
    }));
    expect(effects.notes.some(note => note.startsWith(`近似：bond:${bondId} `) && assumption.test(note))).toBe(true);
  });
  it('突袭50层时非成员只记录全体攻速', () => {
    const operator = (operatorsJson as unknown as OperatorData[]).find(o => o.name === '艾雅法拉')!;
    const effects = battleEffects();
    applyBonds(effects, bonds, [{ bondId: 'raidShip', stacks: 50, activeChars: 2 }], operator, operator.tiers.a, []);
    // 艾雅法拉未获得突袭身份，全体攻速+50，不享受再部署期间的加攻。
    expect(effects.stats).toEqual([{ stat: 'attackSpeed', bucket: 'direct', value: 50, source: 'bond:raidShip' }]);
    expect(effects.derivation.map(step => step.label)).toEqual([expect.stringMatching(/50 层.*全体.*\+50/)]);
    expect(effects.notes).toEqual([]);
  });
  it('炎0/10层攻击百分比；值上限而不是层数上限', () => {
    // 基础100，炎=0.23+0.009*s：0层123；10层132。当前炎atk无max，不擅加上限。
    expect(stats({ atk:100, attackSpeed:100, baseAttackTime:1 }, run('yanShip',0,3).stats).atk).toBeCloseTo(123);
    expect(stats({ atk:100, attackSpeed:100, baseAttackTime:1 }, run('yanShip',10,3).stats).atk).toBeCloseTo(132);
    // 同一真实炎参数添加边界fixture atk_max=.5：100层min(.23+.9,.5)=.5 →150。
    const n = { ...bonds.find(b=>b.bondId==='yanShip')!.buffs[0].blackboard.nums, atk_max:.5 };
    expect(stacked(n,'atk',100)).toBe(.5);
    expect(stats({atk:100,attackSpeed:100,baseAttackTime:1},[{stat:'atk',bucket:'pct',value:stacked(n,'atk',100),source:'bond:yanShip'}]).atk).toBe(150);
    expect(run('yanShip',10,2).stats).toHaveLength(0);
  });
  it.each([
    ['温蒂', 3, true], ['温蒂', 2, false],
    ['歌蕾蒂娅', 3, true], ['歌蕾蒂娅', 2, false],
    ['艾丝黛尔', 3, false], ['缪尔赛思', 3, true],
  ] as const)('精准对非成员 %s 在 %i 人时生效为 %s', (name, activeChars, active) => {
    const operator = (operatorsJson as unknown as OperatorData[]).find(o => o.name === name)!;
    expect(operator.bondIds).not.toContain('preciShip');
    const effects = battleEffects();
    applyBonds(effects, bonds, [{ bondId: 'preciShip', stacks: 0, activeChars }], operator, operator.tiers.a, []);
    expect(stats({ atk: 100, attackSpeed: 100, baseAttackTime: 1 }, effects.stats).atk).toBeCloseTo(active ? 110 : 100);
    expect(effects.defPenetrationPct).toBe(active ? 0.3 : 0);
    expect(effects.resPenetrationPct).toBe(active ? 0.3 : 0);
  });
  it('维多利亚6人强化按装备普通和进阶区别', () => {
    const a = (equipsJson as EquipData[]).find(x=>x.chessId==='chess_item_1_01_e_a')!;
    const b = (equipsJson as EquipData[]).find(x=>x.chessId==='chess_item_1_01_e_b')!;
    // 5人无攻击加成；6人：普通.4 + 进阶(.4+.4)=1.2，100*(1+1.2)=220。
    expect(run('victoriaShip',10,5,[a,b]).stats).toHaveLength(0);
    expect(stats({atk:100,attackSpeed:100,baseAttackTime:1},run('victoriaShip',10,6,[a,b]).stats).atk).toBeCloseTo(220);
  });
  it('奥术enemy固定减抗上限不当百分比', () => {
    // 10层减抗上限 -max(-100,-30-.05*10)=30.5，从首击生效。
    // A=100，R=60，减抗后29.5：100*(1-.295)=70.5。
    const e = run('arcaneShip',10,3);
    expect(e.resReductionFixed).toBe(30.5);
    expect(damage({attack:100,type:'arts',resistance:60,reductionFixed:e.resReductionFixed}).total).toBeCloseTo(70.5);
    expect(run('arcaneShip',10,2).resReductionFixed).toBe(0);
    expect(run('arcaneShip',1500,3).resReductionFixed).toBe(100);
  });
  it('无关干员不因炎强化进入近似，经济静默', () => {
    const o = op('egirShip'); const e = battleEffects();
    applyBonds(e,bonds,[{bondId:'yanShip',stacks:10,activeChars:6},{bondId:'visiShip',stacks:100,activeChars:6}],o,o.tiers.a,[]);
    expect(e.notes).toEqual([]); expect(e.stats).toEqual([]);
  });
  it('普通装备不授予盟约，协防按成员和阶级最终增伤', () => {
    const o = op('egirShip'); const e = battleEffects();
    const hammer = (equipsJson as EquipData[]).find(x=>x.chessId==='chess_item_1_01_e_a')!;
    applyBonds(e,bonds,[{bondId:'victoriaShip',stacks:10,activeChars:6}],o,o.tiers.a,[hammer]);
    expect(e.stats).toEqual([]); expect(e.modifiers).toEqual([]);
    const member = op('emptyShip');
    for (const tier of ['a','b'] as const) {
      const buff = battleEffects();
      applyBonds(buff,bonds,[{bondId:'emptyShip',stacks:0,activeChars:8}],member,member.tiers[tier],[]);
      // 100真伤 × (普通1.2 / 精锐1.4) = 120 / 140。
      expect(damage({attack:100,type:'true',modifiers:buff.modifiers}).total).toBeCloseTo(tier==='a'?120:140);
    }
  });
  it.each(['a', 'b'] as const)('两名协防激活后，维什戴尔%s阶各输出阶段按对应倍率结算', tier => {
    const input = { charId: 'char_1035_wisdel', tier, skillId: 'skchr_wisdel_3', bossId: 'boss_1', modeId: 'mode_single_10', equips: [] };
    const at = (activeChars: number) => calculate({ ...input, bonds: [{ bondId: 'emptyShip', stacks: 0, activeChars }] });
    const before = at(1), after = at(2), factor = tier === 'b' ? 1.4 : 1.2;
    // bondeffect_empty 的 damage_scale_normal/extra 是过防抗后的成员伤害倍率，精锐直接取1.4。
    expect(after.skill!.stats.atk).toBe(before.skill!.stats.atk);
    expect(after.skill!.dps).toBeCloseTo(factor * before.skill!.dps, 8);
    expect(after.cycle!.avgDps).toBeCloseTo(factor * before.cycle!.avgDps, 8);
    expect(after.totalDamage.value).toBeCloseTo(factor * before.totalDamage.value, 7);
  });
  it('艾雅法拉两盟约层数各自整除，攻击/自然技力同源', () => {
    // 普通阶每2层 atk+.01、SP+.02。两盟约各10层：5+5=10次，+10%攻、+.2 SP/s。
    const e = battleEffects(); applyGarrisons(e,['garrison_09_a'],[{bondId:'lethaniaShip',stacks:10,activeChars:3},{bondId:'arcaneShip',stacks:10,activeChars:2}]);
    expect(stats({atk:100,attackSpeed:100,baseAttackTime:1},e.stats).atk).toBeCloseTo(110);
    expect(e.spRecovery).toBeCloseTo(.2);
    expect(e.derivation[0].source).toBe('garrison:garrison_09_a');
    const zero = battleEffects(); applyGarrisons(zero,['garrison_09_a'],[]); expect(zero.spRecovery).toBe(0);
  });
});
