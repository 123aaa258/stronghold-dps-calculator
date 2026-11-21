import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';

const result = (skill: number, durationSec = 30) => calculate({
  charId: 'char_2027_wang', tier: 'b', skillId: `skchr_wang_${skill}`,
  bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], equips: [], durationSec,
});

it.each([
  [5, 36, 1.20, .93], [6, 60, 1.26, .99],
] as const)('%i阶精锐望 S3：两子连线，首轮库存与开技弹药分别计数', (diyShopLevel, moduleAtk, boost, res) => {
  // ATK = 482 + (589-482)×59/89 + 模组攻击；DEF 1000 使普攻保底，N = 5% A / 0.85。
  // X1的每枚棋子提供10%增伤和9法穿，X3提供13%和12法穿，对25抗单子 H = 320% A ×增伤×法抗系数。
  // 0/2/4/6/8/10/12 秒各一组（首枚免费，随后消耗初始六枚）；首开54-38=16秒。
  // 开技补满7枚，每2秒一组，16至28秒七组。两格布阵只容一枚额外跟子，
  // 各组耗1弹，20−7=13按上限返还7枚，30秒时已有下一对。开技溢出1枚孤子，在同格覆盖后随首组一起结算。
  // 技能期 = 14H/(28−16)；30秒共7+7+1组，总伤 = (16+2)N + 30H。稳态每轮有7组填充期与7组技能期。
  const a = 482 + 107 * 59 / 89 + moduleAtk;
  const n = .05 * a / (26 / 30);
  const h = 3.2 * a * boost * res;
  const r = calculate({ charId: 'char_2027_wang', tier: 'b', skillId: 'skchr_wang_3', diyShopLevel,
    bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], equips: [], durationSec: 30 });
  expect(r.model).toBe('override');
  expect(r.skill?.dps).toBeCloseTo(14 * h / 12, 8);
  expect(r.totalDamage.value).toBeCloseTo(18 * n + 30 * h, 8);
  // 循环平均 = 30 秒窗口总伤 ÷ 30。
  expect(r.cycle?.avgDps).toBeCloseTo((18 * n + 30 * h) / 30, 8);
});

it('望五阶满潜天下劫：棋子借练度加成后的主人面板，库存从七枚提升到八枚', () => {
  // 三潜的铸子增加一枚初始棋子，召唤物天赋另加一格库存。七级补八枚，冷却2秒，
  // 开场0..14秒有8组，16..30秒技能也有8组。满潜一级模组每子加12%伤害、10法穿。
  const atk = (482 + 107 * 59 / 89 + 36 + 27) * 1.1;
  const h = 3.2 * atk * 1.24 * .95, n = .05 * atk / (26 / 30);
  const r = calculate({ charId: 'char_2027_wang', tier: 'b', skillId: 'skchr_wang_3', diyShopLevel: 5,
    potential: 5, cultivation: 2060, bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], equips: [], durationSec: 30 });
  expect(r.skill!.components.map(c => c.hitsPerAttack)).toEqual([8, 8]);
  expect(r.skill!.dps).toBeCloseTo(16 * h / 14, 8);
  expect(r.totalDamage.value).toBeCloseTo(16 * n + 32 * h, 7);
});

it('望 S2：踩中跟子一次，补充库存不会触发留在邻格的原子', () => {
  // 仅 Boss 格中的跟子触发。两子连线的一击 = A×4.8×(1+2×.13)×(1−(25−2×12)/100)。
  // 邻格原子无人踩，阻挡目标不移动，16秒回复的两枚棋子只进库存。
  // 30秒和60秒都是一次法伤加同期物理保底普攻，第二个窗口不多出第二次法伤。
  const a = 482 + 107 * 59 / 89 + 60;
  const hit = a * 4.8 * 1.26 * .99;
  for (const t of [30, 60]) expect(result(2, t).totalDamage.value).toBeCloseTo(hit + t * .05 * a / (26 / 30), 8);
});

it('望 S3：迅捷早开保留返还库存和原格再部署时钟，溢出跟子可以先自行连线', () => {
  // 两个精锐怀表：消耗54×.6²=19.44。初始38立刻开，免费预设一组后仍有6枚；
  // 溢出6+8−7=7，但两格仅能落两枚，立即同批触发。原格刚刚部署，2～14秒再下七组。
  // 14秒前已结算(1+1+7)×2H=18H。16/18秒两次返还库存部署，两分支都多4H。
  // 40层迅捷(非成员)有 .2+40×.0035=.34 概率回15SP。成功时18.44秒还剩5枚，
  // 多枚溢出立即贡献2H，选定原格要等到20秒才可再次落子；失败时19秒仍在普攻。
  const r = calculate({ charId: 'char_2027_wang', tier: 'b', skillId: 'skchr_wang_3',
    bossId: 'boss_1', modeId: 'mode_single_10', durationSec: 19,
    bonds: [{ bondId: 'swiftShip', activeChars: 2, stacks: 40 }],
    equips: ['chess_item_4_11_e_b', 'chess_item_4_11_e_b'] });
  const a = 482 + 107 * 59 / 89 + 60;
  const n = .05 * a / (26 / 30);
  const h = 3.2 * a * 1.26 * .99;
  expect(r.totalDamage.value).toBeCloseTo(.34 * (24 * h + n * 4.44) + .66 * (22 * h + n * 5), 6);
});
