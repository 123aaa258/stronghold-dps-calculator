import { describe, expect, it } from 'vitest';
import { integrate } from './timeline.ts';
import { applyGarrisons } from './effects/garrisons.ts';
import { battleEffects } from './effects/common.ts';
import { stats } from './stats.ts';

describe('精建时间分段', () => {
  it('线性增伤积分与击杀使用同一曲线', () => {
    // 前2秒无伤，之后DPS=10+2t，积分10t+t²；HP75在t5时耗尽。
    const result = integrate([{duration:2,dps:0},{duration:5,dps:10,slope:2}], [{duration:10,dps:20}], 5, 75);
    expect(result.totalDamage).toBe(39);
    expect(result.killTimeSec).toBe(7);
  });
  it('斩杀只在生效阶段应用，且不虚增总伤害', () => {
    // 前5秒造成50；技能门槛30，剩余HP50再打20需2秒，7秒斩杀；30秒积分300。
    expect(integrate([{duration:5,dps:10},{duration:Infinity,dps:10,executeBelow:30}], [], 30, 100)).toEqual({totalDamage:300,killTimeSec:7});
    expect(integrate([{duration:5,dps:10}], [{duration:10,dps:10,executeBelow:30}],30,300).killTimeSec).toBe(27);
  });
  it('零伤永久段不产生NaN', () => {
    expect(integrate([{duration:Infinity,dps:0}], [], 30, 100)).toEqual({totalDamage:0,killTimeSec:Infinity});
  });
  it('逻各斯战斗ADD_BOND攻速：普通1/进阶2，各盟约整除', () => {
    for (const tier of ['a','b']) {
      const e=battleEffects();
      applyGarrisons(e,[`garrison_92_${tier}`],[{bondId:'arcaneShip',stacks:5,activeChars:1},{bondId:'visiShip',stacks:4,activeChars:1}]);
      expect(stats({atk:100,attackSpeed:100,baseAttackTime:1},e.stats).attackSpeed).toBe(tier==='a'?102:106);
    }
  });
});
