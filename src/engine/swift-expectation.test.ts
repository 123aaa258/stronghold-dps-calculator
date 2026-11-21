import { expect, it } from 'vitest';
import { swiftRefundSucceeds } from './swift.ts';
import { swiftExpectation } from './swift-expectation.ts';

it('同一结束序号只抽一次，不同结束序号各自按概率加权', () => {
  const result = swiftExpectation(180, () => {
    const low = swiftRefundSucceeds(0, .2, 20);
    const high = swiftRefundSucceeds(0, .7, 20);
    const next = swiftRefundSucceeds(1, high ? .4 : .1, 60);
    return (low ? 100 : high ? 10 : 0) + (next ? 5 : 0);
  });
  expect(result.sampled).toBe(false);
  expect(result.damage).toBeCloseTo(100 * .2 + 10 * .5 + 5 * (.7 * .4 + .3 * .1), 10);
});

it('回技使额外施放进入窗口时计入伤害，窗口结束后的回技不展开', () => {
  let runs = 0;
  const result = swiftExpectation(180, () => {
    runs++;
    const second = swiftRefundSucceeds(0, .34, 100) ? 170 : 200;
    swiftRefundSucceeds(1, .34, second + 20);
    return 100 + (second <= 180 ? 100 : 0);
  });
  expect(result.damage).toBeCloseTo(134, 10);
  expect(runs).toBe(2);
});
