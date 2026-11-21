import { expect, it } from 'vitest';
import operators from '../data/generated/operators.json' with { type: 'json' };
import { stats } from './stats.ts';
it('蓝毒进阶面板与普攻间隔', () => {
  // generated 蓝毒b：ATK=524.3037974683544, ASPD=102, 基础间隔=1；无额外加成。
  // ATK=[(524.3037974683544+0)×1+0]×1；间隔=round(30×100/102)/30=29/30。
  const result = stats(operators.find(o => o.name === '蓝毒')!.tiers.b.attributes);
  expect(result.atk).toBeCloseTo(524.3037974683544, 6);
  expect(result.attackSpeed).toBe(102);
  expect(result.attackInterval).toBeCloseTo(29 / 30, 6);
});
it('按最终攻击间隔而非基础间隔取最近帧，至少一帧', () => {
  expect(stats({atk:1,attackSpeed:200,baseAttackTime:1.02}).attackInterval).toBe(15/30);
  expect(stats({atk:1,attackSpeed:600,baseAttackTime:.01}).attackInterval).toBe(1/30);
});
it('面板乘区和攻速截断', () => {
  // [(100+20)×(1+0.5)+10]×2=380；ASPD=100+1000→600；间隔=(1+0.25)×0.8/(600/100)=1/6。
  const result = stats({ atk: 100, attackSpeed: 100, baseAttackTime: 1 }, [
    { stat: 'atk', bucket: 'direct', value: 20, source: 'test' },
    { stat: 'atk', bucket: 'pct', value: 0.5, source: 'test' },
    { stat: 'atk', bucket: 'finalAdd', value: 10, source: 'test' },
    { stat: 'atk', bucket: 'mul', value: 2, source: 'test' },
    { stat: 'attackSpeed', bucket: 'direct', value: 1000, source: 'test' },
    { stat: 'attackInterval', bucket: 'direct', value: 0.25, source: 'test' },
    { stat: 'attackInterval', bucket: 'mul', value: 0.8, source: 'test' },
  ]);
  expect(result.atk).toBe(380);
  expect(result.attackInterval).toBeCloseTo(1 / 6, 8);
  expect(result.derivation.atk).toHaveLength(6);
});
