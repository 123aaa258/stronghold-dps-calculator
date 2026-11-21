import { expect, it } from 'vitest';
import { consume, emptyEffects } from './skills/rules.ts';
import type { RuleContext } from './skills/rules.ts';
it('百分比减防减抗的负号不变成穿透', () => {
  // 初始减防=0；初雪2 def=-0.45、RES=-0.26 → 减防45%、减抗26%，穿透仍0。
  const effects = emptyEffects(); const consumed = new Set<string>();
  consume({ kind: 'skill', source: 'test', prefabId: 'skchr_slbell_2', description: '', blackboard: { nums: { def: -0.45, magic_resistance: -0.26 } } }, effects, consumed);
  expect(effects.defReductionPct).toBeCloseTo(0.45, 8);
  expect(effects.resReductionPct).toBeCloseTo(0.26, 8);
  expect(effects.resPenetrationFixed).toBe(0);
  expect(consumed.size).toBe(2);
});
it('同名times是多段还是护盾必须按prefab区分', () => {
  // archet_2 times=5→5段；nearl2_2 times=3是护盾→仍1段，键未消费。
  const context: RuleContext = { kind: 'skill', source: 'test', prefabId: 'skchr_archet_2', description: '', blackboard: { nums: { times: 5 } } };
  const attacks = emptyEffects(); consume(context, attacks, new Set());
  expect(attacks.hits).toBe(5);
  const shield = emptyEffects(); const consumed = new Set<string>();
  consume({ ...context, prefabId: 'skchr_nearl2_2', blackboard: { nums: { times: 3 } } }, shield, consumed);
  expect(shield.hits).toBe(1);
  expect(consumed.size).toBe(0);
});
it('条件倍率和未知间隔不消费', () => {
  // 冻结条件未确认，atk_scale=3不能无条件乘；未知prefab的base_attack_time=0.25不可猜。
  const effects = emptyEffects(); const consumed = new Set<string>();
  consume({ kind: 'skill', source: 'test', prefabId: 'unknown', description: '若目标已经处于冻结状态，本次攻击力提高至{atk_scale:0%}', blackboard: { nums: { atk_scale: 3, base_attack_time: 0.25 } } }, effects, consumed);
  expect(effects.attackScale).toBe(1);
  expect(effects.stats).toEqual([]);
  expect(consumed.size).toBe(0);
});

it.each([
  // 真实描述/blackboard：skills.json 慕斯2，operators.json 卡达天赋。
  ['攻击力和防御力各<@ba.vup>+{atk:0%}</>', { atk: 0.45, def: 0.45 }, 'atk', true],
  ['自身与浮游单元的攻击速度+6', { attack_speed: 6 }, 'attack_speed', true],
  // skills.json 摆渡人1：倍率1.2；连续三次为无键行为，留待后续建模。
  ['下次攻击造成相当于攻击力<@ba.vup>{atk_scale:0%}</>的物理伤害，并连续攻击三次', { atk_scale: 1.2 }, 'atk_scale', true],
  // operators.json 慕斯模组：未阻挡敌人时攻击速度+8，不能无条件消费。
  ['未阻挡敌人时攻击速度<@ba.kw>+{attack_speed}</>', { attack_speed: 8 }, 'attack_speed', false],
  // skills.json 深靛1：-0.8无单位，不可猜加算；极光2明确规则另测。
  ['攻击间隔<@ba.vup>大幅度缩短</>', { base_attack_time: -0.8 }, 'base_attack_time', false],
  // skills.json 阿米娅2：每次攻击变为描述固定7连发，不是累计N次后触发。
  ['每次攻击变为攻击力{attack@atk_scale:0%}的{attack@times}连发', { 'attack@atk_scale': 0.45, 'attack@times': 7 }, 'attack@times', true],
  // 合成边界：数字/单位核对、跨逗号条件作用域。
  ['连续攻击{attack@times}次', { 'attack@times': 3 }, 'attack@times', true],
  ['攻击间隔延长{base_attack_time}秒', { base_attack_time: 0.5 }, 'base_attack_time', true],
  ['当生命低于50%，攻击速度+{attack_speed}', { attack_speed: 20 }, 'attack_speed', false],
  ['每攻击3次，连续攻击{attack@times}次', { 'attack@times': 3 }, 'attack@times', false],
  ['攻击力+150%', { atk: 0.5 }, 'atk', false],
])('描述数值匹配 %s', (description, nums, key, expected) => {
  const consumed = new Set<string>();
  consume({ kind: 'talent', source: 'test', prefabId: null, description, blackboard: { nums: nums as Record<string, number> } }, emptyEffects(), consumed);
  expect(consumed.has(key)).toBe(expected);
});

it('通用规则遵守条件前缀', () => {
  const used = new Set<string>();
  consume({ kind: 'skill', source: 'test', prefabId: null, description: '若生命低于50%，攻击力+{atk:0%}，攻击速度+{attack_speed}', blackboard: { nums: { atk: 0.5, attack_speed: 20 } } }, emptyEffects(), used);
  expect([...used]).toEqual([]);
});
it('真实多段描述与既有间隔规则保持优先', () => {
  // skills.json archet_2 7级：立即发射箭矢对目标进行攻击力{atk_scale:0%}的{times}次攻击。
  // blackboard times=5；已核实规则确认目标5段，后面的弹射不重复计入本目标。
  const effects = emptyEffects();
  consume({ kind: 'skill', source: 'test', prefabId: 'skchr_archet_2', description: '立即发射箭矢对目标进行攻击力{atk_scale:0%}的{times}次攻击，可弹射至目标周围的下一个未选择过的敌人（每次弹射减少1次攻击次数）', blackboard: { nums: { times: 5, atk_scale: 1.3 } } }, effects, new Set());
  expect(effects.hits).toBe(5);
});
it('无关键忽略不能吞掉目标减防、易伤或生命转伤害', async () => {
  const { nonDps } = await import('./skills/description.ts');
  const context: RuleContext = { kind: 'skill', source: 'test', prefabId: null, description: '', blackboard: { nums: {} } };
  expect(nonDps({ ...context, description: '敌人防御力降低45%' }, 'def')).toBe(false);
  expect(nonDps({ ...context, description: '使目标受到的伤害提升20%' }, 'damage_resistance')).toBe(false);
  expect(nonDps({ ...context, description: '造成相当于生命上限50%的伤害' }, 'hp_ratio')).toBe(false);
  expect(nonDps({ ...context, description: '每秒回复5%的生命' }, 'hp_recovery_per_sec')).toBe(true);
});
it('塔露拉真实后置叠层条件不能当无条件攻击力', () => {
  // skills.json skchr_oxi_2：攻击力+{atk:0%}和防御力+{def:0%}（可叠加5层）；atk=0.47。
  const used = new Set<string>();
  consume({ kind: 'skill', source: 'test', prefabId: 'skchr_oxi_2', description: '攻击力+{atk:0%}和防御力+{def:0%}（可叠加5层）', blackboard: { nums: { atk: 0.47, def: 0.47 } } }, emptyEffects(), used);
  expect(used.has('atk')).toBe(false);
});
