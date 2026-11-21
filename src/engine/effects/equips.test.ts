import { describe, expect, it } from 'vitest';
import data from '../../data/generated/equips.json';
import type { EquipData } from '../types.ts';
import { stats } from '../stats.ts';
import { battleEffects } from './common.ts';
import { applyEquips, equipCoverage } from './equips.ts';
const equips = data as EquipData[];
const equip = (name: string, tier = 'a') => equips.find(e => e.name === name && e.tier === tier)!;
const apply = (name: string, tier = 'a', count = 0) => {
  const e = battleEffects(); applyEquips(e, [equip(name, tier)], count); return e;
};
describe('装备按描述建模', () => {
  it('无条件攻击力和攻速按各自乘区手算', () => {
    // 基础1000攻击、100攻速、1秒间隔；重刃a：1000×1.4=1400，100-10=90，间隔1/0.9。
    const e = apply('阿戈尔重刃');
    const result = stats({ atk: 1000, attackSpeed: 100, baseAttackTime: 1 }, e.stats);
    expect(result.atk).toBe(1400); expect(result.attackSpeed).toBe(90);
    expect(result.attackInterval).toBeCloseTo(33 / 30);
    expect(e.derivation.every(s => s.source === `equip:${equip('阿戈尔重刃').chessId}`)).toBe(true);
  });
  it('技能、攻击和每秒叠层保留触发器及两阶数值', () => {
    expect(apply('炎国短刀').stacks[0]).toMatchObject({ trigger: 'skill', max: 10, modifier: { value: 0.05 } });
    expect(apply('炎国短刀', 'b').stacks[0]?.modifier.value).toBe(0.08);
    expect(apply('动能加速器').stacks[0]).toMatchObject({ trigger: 'attack', max: 60, modifier: { value: 2 } });
    expect(apply('灵巧涡轮手套', 'b').stacks[0]).toMatchObject({ trigger: 'second', max: 20, modifier: { value: 3 } });
    expect(apply('灵巧涡轮手套').notes[0]).toContain('受伤清空');
  });
  it('骨刺刀两阶逐次伤害为一段和两段，天马之耀为真伤', () => {
    expect(apply('伊比利亚骨刺刀').extraHits[0]).toMatchObject({ type: 'arts', scale: 0.25, hits: 1 });
    expect(apply('伊比利亚骨刺刀', 'b').extraHits[0]).toMatchObject({ type: 'arts', scale: 0.25, hits: 2 });
    expect(apply('天马之耀').extraHits[0]).toMatchObject({ type: 'true', scale: 0.3, hits: 1 });
  });
  it('可靠怀表只在技能期间降百分比攻速，并保留技力下限', () => {
    const e = apply('可靠怀表', 'b');
    expect(e.spCostScale).toBe(0.6); expect(e.spCostMin).toBe(3); expect(e.stats).toEqual([]);
    expect(stats({ atk: 100, attackSpeed: 160, baseAttackTime: 1 }, e.skillStats).attackSpeed).toBe(120);
  });
  it('佣兵名牌按激活盟约种数计层并截断，呼吸器只计1层', () => {
    expect(apply('佣兵名牌', 'b', 0).stats[0]?.value).toBe(0);
    expect(apply('佣兵名牌', 'b', 3).stats[0]?.value).toBeCloseTo(0.36);
    expect(apply('佣兵名牌', 'b', 99).stats[0]?.value).toBeCloseTo(0.96);
    // 一场只部署一次：普通 atk_cell 0.2、进阶 0.3，不乘 layer_max。
    expect(apply('乌萨斯呼吸器', 'b').stats[0]?.value).toBeCloseTo(0.3);
    expect(apply('乌萨斯呼吸器').stats[0]?.value).toBeCloseTo(0.2);
    expect(apply('乌萨斯呼吸器').notes[0]).toContain('只计 1 层');
    expect(apply('乌萨斯呼吸器').assumptions[0]).toContain('只计 1 层');
  });
  it('汲取者之镰仅翻倍自身装备加成', () => {
    const e = apply('汲取者之镰');
    expect(stats({ atk: 100, attackSpeed: 100, baseAttackTime: 1 }, e.stats).atk).toBe(130);
    const skill = stats({ atk: 100, attackSpeed: 100, baseAttackTime: 1 }, [...e.stats, ...e.skillStats]);
    expect(skill.atk).toBe(160); expect(skill.attackSpeed).toBe(160);
  });
  it('自身攻速不重复计算给予左右两侧其他干员的光环', () => {
    expect(apply('叙拉古正装', 'b').stats).toHaveLength(1);
    expect(apply('叙拉古正装', 'b').stats[0]?.value).toBe(25);
  });
  it('浓茶与作战粮区分自然回复和初始技力', () => {
    expect(apply('萨尔贡浓茶', 'b').spRecovery).toBe(0.25);
    // 无盟约输入时只有部署的 3 点。
    expect(apply('迅捷作战粮').initSp).toBe(3);
    expect(apply('迅捷作战粮').notes[0]).toContain('无法去重');
  });
  it('经济与生存装备静默', () => {
    expect(apply('盟约之币')).toEqual(battleEffects());
    expect(apply('坚守盾牌')).toEqual(battleEffects());
  });
  it('116件均逐项分类，不落到未知装备，效果数值全部有限', () => {
    expect(equips).toHaveLength(116);
    for (const item of equips) {
      const e = battleEffects(); applyEquips(e, [item], 10);
      expect(e.notes.join('')).not.toContain('尚未核对');
      expect(equipCoverage(item).reason).toBeTruthy();
      for (const step of e.derivation) expect(Number.isFinite(step.value)).toBe(true);
    }
  });
});
