import { describe, expect, it, vi } from 'vitest';
import { renewalCurve, swiftRefundSucceeds, swiftSucceeds, withSwiftPath, type RenewalPlan } from './swift.ts';
import operators from '../data/generated/operators.json' with { type: 'json' };
import bosses from '../data/generated/bosses.json' with { type: 'json' };
import skills from '../data/generated/skills.json' with { type: 'json' };
import { battleEffects } from './effects/common.ts';
import { generic } from './skills/generic.ts';
import { mitmOverride } from './skills/overrides/char_4147_mitm.ts';
import type { BossData, OperatorData, SkillData } from './types.ts';

describe('迅捷技能结束事件', () => {
  it('独立控制每条路径，嵌套与抛错后恢复；装备和天赋仍用各自的序列', () => {
    const fail = vi.fn(() => false);
    const unchanged = [swiftSucceeds(1, .34), swiftSucceeds(1, .34, 1)];
    withSwiftPath(fail, () => {
      expect(swiftRefundSucceeds(1, .34, 12)).toBe(false);
      expect(() => withSwiftPath(() => true, () => {
        expect(swiftRefundSucceeds(1, .34, 12)).toBe(true);
        expect([swiftSucceeds(1, .34), swiftSucceeds(1, .34, 1)]).toEqual(unchanged);
        throw Error('中止本条路径');
      })).toThrow('中止本条路径');
      expect(swiftRefundSucceeds(1, .34, 12)).toBe(false);
      expect(swiftRefundSucceeds(0, 0)).toBe(false);
      expect(swiftRefundSucceeds(0, 1)).toBe(true);
    });
    expect(fail.mock.calls).toEqual([[1, .34, 12], [1, .34, 12]]);
    expect(swiftRefundSucceeds(1, .34)).toBe(unchanged[0]);
  });

  const plan: RenewalPlan = {
    prefix: [{ duration: 10, dps: 1 }], stock: 0, cost: 10, maxCharges: 3, probability: .34, reward: 5,
    wait: sp => sp, skillDuration: 2, segments: () => [],
    counter: { initial: 0, afterCharge: (_count, recovery, stock) => [{
      count: 0, parts: [{ duration: recovery + 4 + 2, dps: 1 }], stock, weight: 1,
      freeSkills: { count: 2, firstEnd: recovery + 1, interval: 2 },
    }] },
  };

  it('两次免费结束各返5点，下轮付费施放已经攒够10点；所有时间均从部署起算', () => {
    const decisions: [number, number | undefined][] = [];
    withSwiftPath((k, _p, time) => {
      decisions.push([k, time]);
      return k === 1 || k === 2;
    }, () => renewalCurve(plan));
    expect(decisions.slice(0, 7)).toEqual([[0, 10], [1, 21], [2, 23], [3, 26], [4, 27], [5, 29], [6, 32]]);
  });

  it('无回技量时普通施放与免费连奏均不会请求概率分支', () => {
    const decide = vi.fn(() => true);
    withSwiftPath(decide, () => renewalCurve({ ...plan, reward: 0 }));
    expect(decide).not.toHaveBeenCalled();
  });

  it('重演渡桥逐击时每条路径重新部署小车，窗口边界保留瞬时伤害', () => {
    const operator = (operators as unknown as OperatorData[]).find(o => o.charId === 'char_4147_mitm')!;
    const tier = operator.tiers.b, boss = (bosses as BossData[])[0]!;
    const skill = (skills as unknown as Record<string, SkillData>)[operator.skillIds[0]!]!, level = skill.levels[tier.skillLevel]!;
    const make = () => {
      const effects = { ...battleEffects(), skillEndSp: 15, skillEndProbability: .34 };
      return mitmOverride({ operator, tier, boss, skill, level }, generic(operator, tier, skill, level, boss, effects));
    };
    const model = make();
    const paths = [() => true, () => false, (k: number) => k % 3 === 0, () => true];
    for (const decide of paths) withSwiftPath(decide, () => {
      const original = make().customTimeline!;
      for (const t of [0, 16.99, 17, 17.01, 180]) {
        expect(model.replayDamage!(t)).toBeCloseTo(original(t, Infinity).totalDamage, 7);
      }
    });
  });
});
