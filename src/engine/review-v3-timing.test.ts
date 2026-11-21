import { it, expect } from 'vitest';
import { calculate } from './calc.ts';
import type { CalcInput } from './types.ts';

const amiya: CalcInput = { charId: 'char_1037_amiya3', skillId: 'skchr_amiya3_2', tier: 'b',
  bossId: 'boss_1', modeId: 'mode_single_10', potential: 5, cultivation: 2060, bonds: [], equips: [] };
const thorns: CalcInput = { ...amiya, charId: 'char_293_thorns', skillId: 'skchr_thorns_3' };
const total = (input: CalcInput, durationSec: number) => calculate({ ...input, durationSec }).totalDamage.value;
const amiyaAtk = (529.9113924050632 + 22) * 1.1;

it('医疗阿米娅首轮15至47秒，竞技旗按实际时刻放大法术起手与后续真伤', () => {
  const input = { ...amiya, equips: ['chess_item_4_04_e_b'] };
  const normal = amiyaAtk * .75 / 1.6, strike = amiyaAtk * 1.25 * 1.7 * .75;
  const active = amiyaAtk * 1.25 / 1.6;
  // 第15秒是第一档衰减的起点，起手乘1.53；随后八个半秒档比基础多1.14秒的真伤。
  const extraSeconds = .5 * (.53 + .46 + .39 + .32 + .25 + .18 + .11 + .04);
  const result = calculate(input);
  expect(result.normal.dps).toBeCloseTo(normal * 1.6, 7);
  expect(total(input, 15)).toBeCloseTo(15 * normal * 1.6 + strike * 1.53, 7);
  expect(result.skill!.dps).toBeCloseTo((strike * 1.53 + active * (32 + extraSeconds)) / 32, 7);
});

it('伊比利亚持续法伤在慈悲愿景开场不重复计入32秒', () => {
  const without = { ...amiya, equips: ['chess_item_6_03_e_a', 'chess_item_3_14_e_a'] };
  const withBond = { ...without, bonds: [{ bondId: 'iberiaShip', activeChars: 3, stacks: 0 }] };
  const diff = (t: number) => total(withBond, t) - total(without, t);
  // 10层×11%攻击，每秒过25抗；第15秒的开场击在两个配置中完全相同。
  const rate = amiyaAtk * 10 * .11 * .75;
  expect(diff(14.999)).toBeCloseTo(14.999 * rate, 6);
  expect(diff(15)).toBeCloseTo(15 * rate, 6);
  expect(diff(15.001) - diff(15)).toBeCloseTo(.001 * rate * 1.25, 6);
});

it.each([[0, 0], [100, .55], [228, .998], [229, 1]])('棘刺元素模组迅捷%d层保留首轮、永续和三次元素爆发', (stacks, p) => {
  const input = { ...thorns, uniEquipId: 'uniequip_003_thorns', bonds: [{ bondId: 'swiftShip', activeChars: 2, stacks }] };
  const atk = 826.2730337078652;
  // 常态、首开、二开的攻击间隔分别为37、32、28帧；毒每秒140点过25抗。
  const dps = (mul: number, frames: number) => Math.max(atk * mul - 1000, atk * mul * .05) * 30 / frames + 105;
  const idle = dps(1, 37), first = dps(1.4, 32), permanent = dps(1.8, 28);
  // 首开18.5秒，持续30秒。非成员在40层起全场回15技力，成功立即二开，失败再等18.5秒。
  // 按伤害10%积累到2000，爆发后锁10秒。开技后等待18.5秒时约于78.67、120.56、162.45秒爆发；
  // 立即二开时约于64.25、106.15、148.04秒爆发。两条轴都应计足3×6000。
  const wait = (1 - p) * 18.5;
  const regular = idle * (18.5 + wait) + first * 30 + permanent * (180 - 48.5 - wait);
  const result = calculate(input);
  expect(result.elemental?.perSec).toBeCloseTo(idle * .1, 7);
  expect(result.totalDamage.value).toBeCloseTo(regular + 18000, 6);
});

it('棘刺灵巧涡轮手套依实际攻速积分，满15次攻击进度才首开', () => {
  const input = { ...thorns, equips: ['chess_item_2_10_e_b'] };
  let progress = 0, first = 0;
  while (progress < 15) {
    const speed = 105 + Math.min(20, Math.floor(first)) * 3;
    const gap = Math.round(1.3 * 100 / speed * 30) / 30;
    const seconds = Math.min(1, (15 - progress) * gap);
    progress += seconds / gap;
    first += seconds;
  }
  expect(first).toBeCloseTo(15.4275909561, 8);
  // 在同一整秒档左右取斜率，只有开技时会跳变。13.50秒的旧结果应仍处于同一普攻阶段。
  const step = .001;
  const slopes = (t: number) => [(total(input, t) - total(input, t - step)) / step,
    (total(input, t + step) - total(input, t)) / step];
  const [earlierLeft, earlierRight] = slopes(13.5);
  expect(earlierRight).toBeCloseTo(earlierLeft!, 5);
  const [before, after] = slopes(first);
  expect(after!).toBeGreaterThan(before! * 1.2);
});
