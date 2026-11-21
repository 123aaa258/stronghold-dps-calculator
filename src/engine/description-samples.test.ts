import { expect, it } from 'vitest';
import skills from '../data/generated/skills.json';
import { clauses, conditional } from './skills/description.ts';
import { consume, emptyEffects } from './skills/rules.ts';
import type { RuleContext } from './skills/rules.ts';

it('真实灰喉一技能的逐次射击倍率正常消费', () => {
  const level = skills.skchr_swllow_1.levels['7'];
  const effects = emptyEffects();
  const consumed = new Set<string>();
  const context: RuleContext = { kind: 'skill', source: 'skill:skchr_swllow_1', ...level };
  consume(context, effects, consumed);
  // 真实七级 blackboard 的 atk_scale=1.25：每段伤害倍率为125%，不把逐击表述当计次条件。
  expect(effects.attackScale).toBe(1.25);
  expect(consumed.has('atk_scale')).toBe(true);
  expect(clauses(context).slice(0, 2).map(c => c.conditional)).toEqual([false, false]);
});

it('真实幽灵鲨二技能的生命保底不限制独立攻击力增益', () => {
  const level = skills.skchr_ghost_2.levels['7'];
  const effects = emptyEffects();
  const consumed = new Set<string>();
  consume({ kind: 'skill', source: 'skill:skchr_ghost_2', ...level }, effects, consumed);
  // 真实七级 atk=1：面板攻击倍率1+1=2；不依赖当前生命值。
  expect(effects.stats).toContainEqual({ stat: 'atk', bucket: 'pct', value: 1, source: 'skill:skchr_ghost_2:atk' });
  expect(consumed.has('atk')).toBe(true);
});

it.each([
  ['每次攻击造成相当于攻击力125%的物理伤害', false],
  ['每次射击造成相当于攻击力125%的物理伤害', false],
  ['每次造成相当于攻击力125%的物理伤害', false],
  ['每3秒造成相当于攻击力125%的物理伤害', true],
  ['每3次攻击造成相当于攻击力125%的物理伤害', true],
  ['每击倒一个敌人攻击力+10%', true],
  ['每层攻击力+10%', true],
  ['每次造成伤害后攻击力+10%', true],
  ['每次射击有概率造成相当于攻击力125%的物理伤害', true],
])('逐击与条件边界：%s', (description, expected) => {
  expect(conditional(description)).toBe(expected);
});

it.each(['生命值低于50%', '当生命值低于50%', '每攻击3次'])('真正前置条件仍跨逗号传播：%s', prefix => {
  const consumed = new Set<string>();
  consume({ kind: 'skill', source: 'test', prefabId: null, description: `${prefix}，攻击力+{atk:0%}`, blackboard: { nums: { atk: 1 } } }, emptyEffects(), consumed);
  expect(consumed.has('atk')).toBe(false);
});
