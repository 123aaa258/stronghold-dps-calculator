import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import type { CalcInput } from '../../types.ts';

const input: CalcInput = { charId: 'char_1035_wisdel', tier: 'b', skillId: 'skchr_wisdel_3',
  bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [], durationSec: 30 };
const physical = (attack: number) => Math.max(.05 * attack, attack - 1000);

// 独立枚举各次射击可能的到达秒数：每发后等概率等待3/4/5秒。只累计给定窗口里的期望发数。
function shotsBetween(first: number, start: number, end: number) {
  let arrivals = new Map([[first, 1]]), count = 0;
  while (arrivals.size) {
    const next = new Map<number, number>();
    for (const [time, chance] of arrivals) {
      if (time >= end) continue;
      if (time >= start) count += chance;
      for (const gap of [3, 4, 5]) next.set(time + gap, (next.get(time + gap) ?? 0) + chance / 3);
    }
    arrivals = next;
  }
  return count;
}

it.each([
  [5, 45, 1.05, 1.15, 1.5, 769], [6, 65, 1.07, 1.25, 1.75, 753],
] as const)('%i阶爆裂黎明：六发独立结算，30秒内两发，三只魂灵各自从初始技力启动', (diyShopLevel, moduleAtk, speed, main, bomb, frames) => {
  // 精二60的面板 A=583+(687−583)×59/89+模组攻击，X1 +45攻速+5，X3 +65攻速+7。魂灵 T=660+(777−660)×59/89。
  // 模组的两次余震各自过1000防；常态残影引爆概率=1−0.85²。初动58−35=23秒。
  const atk = 583 + 104 * 59 / 89 + moduleAtk, shadow = (660 + 117 * 59 / 89) * .75;
  const normal = (physical(atk * main) + 2 * physical(atk * main * .5) + .2775 * physical(atk * bomb)) / (Math.round(63 / speed) / 30);
  // S3面板2.5A；每发主击1.9×好礼倍率，两次余震各取一半，残影只取自身倍率。
  // 技能间隔5秒：X1 为143帧/首发54帧，X3 为140帧/首发53帧。三只魂灵各平均4秒一发。
  const boosted = atk * 2.5;
  const shell = physical(boosted * 1.9 * main) + 2 * physical(boosted * .95 * main) + physical(boosted * bomb);
  const result = calculate({ ...input, diyShopLevel });
  // 首轮统计从第23秒开始。天赋魂灵第5秒首发，两只新魂灵分别在第25和28秒首发。
  const length = frames / 30;
  const shots = [5, 25, 28].reduce((n, first) => n + shotsBetween(first, 23, 23 + length), 0);
  expect(result.skill!.dps).toBeCloseTo((shell * 6 + shots * shadow) / length, 8);
  // 技能落点为23+(53+140k)/30秒，30秒时只有k=0、1。天赋魂灵在5秒首发；
  // 此后25秒可再射n次的概率等于n个独立3/4/5秒间隔之和≤25的概率：
  // n=1..5为1；n=6、7、8为561/729、274/2187、9/6561；连首发共15082/2187。
  // 新召魂灵在25和28秒各自首发，前一只到30秒必定再攻一次；新召合计3发。
  expect(result.totalDamage.value).toBeCloseTo(23 * normal + 2 * shell + (15082 / 2187 + 3) * shadow, 7);
});

it('魂灵使用自己的攻防曲线，主人满潜和自身练度只强化本体伤害', () => {
  const { skill, notes } = calculate({ ...input, diyShopLevel: 5, potential: 5, cultivation: 2060 });
  const shadow = skill!.components.find(c => c.source === 'token:token_10035_wisdel_wward')!;
  expect(shadow.perHit).toBeCloseTo((660 + 117 * 59 / 89) * .75, 8);
  expect(skill!.components.find(c => c.source === 'talent:wisdel:1')!.perHit)
    .toBeCloseTo(physical((583 + 104 * 59 / 89 + 45 + 32) * 1.1 * 2.5 * 1.6), 8);
  expect(notes.join('')).toMatch(/魂灵.*自身练度/);
});

it('普通定点清算：单Boss三次75%余震，四次普攻充能，概率迅捷只减成功分支', () => {
  // A=583；一次普攻=115%主击+57.5%余震+0.15次150%残影。
  // 技能=115%主击+3×(115%×75%)余震+[1−0.85³]次150%残影。全部逐段过防。
  const main = physical(583 * 1.15), bomb = physical(583 * 1.5);
  const normal = main + physical(583 * 1.15 * .5) + .15 * bomb;
  const skill = main + 3 * physical(583 * 1.15 * .75) + (1 - .85 ** 3) * bomb;
  const testInput = { ...input, tier: 'a' as const, skillId: 'skchr_wisdel_1' };
  // 一只660攻击的魂灵以(660×75%)/4常驻输出。无迅捷每五次射击一次强化。
  const shadow = 660 * .75 / 4;
  // 循环平均 = 窗口总伤 ÷ 窗口时长；长窗口下趋于稳态 (4N+S)/(5×2.1)+魂灵。
  const plain = calculate(testInput);
  expect(plain.cycle!.avgDps).toBeCloseTo(plain.totalDamage.value / 30, 8);
  const steady = (4 * normal + skill) / (5 * 2.1) + shadow;
  expect(Math.abs(calculate({ ...testInput, durationSec: 36000 }).cycle!.avgDps / steady - 1)).toBeLessThan(1e-3);
  // 非迅捷成员40层，每轮按固定判定序列判定（概率.34）获得15SP（封顶4），否则普攻四次，魂灵不变。
  // 长窗口内成功比例趋于.34，平均趋于 (.66×4N+S)/((.66×4+1)×2.1)+魂灵。
  const swift = calculate({ ...testInput, durationSec: 36000, bonds: [{ bondId: 'swiftShip', stacks: 40, activeChars: 3 }] });
  const expected = (.66 * 4 * normal + skill) / ((.66 * 4 + 1) * 2.1) + shadow;
  expect(Math.abs(swift.cycle!.avgDps / expected - 1)).toBeLessThan(.02);
});

it('精锐饱和复仇：前半仅一枚弹，后三点五秒的四连发全部落在同一Boss', () => {
  const atk = 583 + 104 * 59 / 89 + 65;
  const n = (physical(atk * 1.25) + 2 * physical(atk * .625) + .2775 * physical(atk * 1.75)) / (59 / 30);
  const boosted = 1.25 * atk, interval = 39 / 30, bomb = physical(boosted * 1.75);
  // 前半按主击+两次余震+0.2775次爆炸。过载每发主击和余震乘0.70，
  // 爆炸仍用完整面板，四连发交错时X模按ArkDPS每发0.2582484375次引爆。
  const early = (physical(boosted * 1.25) + 2 * physical(boosted * .625) + .2775 * bomb) / interval;
  const late = 4 * (physical(boosted * .7 * 1.25) + 2 * physical(boosted * .7 * .625) + .2582484375 * bomb) / interval;
  const shadow = (660 + 117 * 59 / 89) * .75;
  const result = calculate({ ...input, skillId: 'skchr_wisdel_2' });
  // 30秒分为14秒初动、12.5秒前半、3.5秒过载；天赋魂灵同期望15082/2187发。
  expect(result.totalDamage.value).toBeCloseTo(14 * n + 12.5 * early + 3.5 * late + shadow * 15082 / 2187, 7);
  // [14,39)内只有部署时的一只魂灵，按初始5秒首发的有限窗口统计。
  expect(result.skill!.dps).toBeCloseTo((early + late) / 2 + shadow * shotsBetween(5, 14, 39) / 25, 8);
});

it('迅捷S3不吞掉首轮最后一发：下次开技前，成功和失败分支均已打满六发', () => {
  // 第六发在23+753/30=48.1秒落地。到50秒即使回满15SP也不能再开技。
  const at = (stacks: number) => calculate({ ...input, durationSec: 50,
    bonds: [{ bondId: 'swiftShip', activeChars: 3, stacks }] }).totalDamage.value;
  expect(at(40)).toBeCloseTo(at(0), 7);
  expect(at(229)).toBeCloseTo(at(0), 7);
});

it('维什戴尔S3按弹药开火的实际帧时钟区分迅捷10次阈值', () => {
  const testInput: CalcInput = { ...input, cultivation: 2060, potential: 5, durationSec: 22,
    equips: ['chess_item_4_11_e_b'], bonds: [{ bondId: 'skillfulShip', activeChars: 2, stacks: 350, inRange: true },
      { bondId: 'suntShip', activeChars: 5, stacks: 0 }] };
  const at = (stacks: number) => calculate({ ...testInput, bonds: [...testInput.bonds, { bondId: 'swiftShip', activeChars: 2, stacks }] });
  // 绝技和怀表使消耗降至58×.7×.6=24.36。初始35立即开，六发耗时231帧。
  // 成功回15后充能281帧，失败需731帧。0.83代表序列的第10次在5058帧，第11次在5570帧，跨过180秒。
  // 22秒时只有第一次回技会影响窗口，成功支已再次开火，失败支仍在充能。
  const fast = at(229), slow = at(0), mixed = at(180);
  expect(fast.totalDamage.value).toBeGreaterThan(slow.totalDamage.value);
  expect(mixed.totalDamage.value).toBeCloseTo(.83 * fast.totalDamage.value + .17 * slow.totalDamage.value, 6);
});
