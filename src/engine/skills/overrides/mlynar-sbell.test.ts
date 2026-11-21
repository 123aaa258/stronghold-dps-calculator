import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import type { CalcInput } from '../../types.ts';
const input = (charId: string, skill: string, tier: 'a' | 'b' = 'b', durationSec = 30): CalcInput => ({ charId, skillId: `skchr_${skill}`, tier, equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10', durationSec });
it.each([0, 507])('玛恩纳进阶满潜S3，卡西米尔%d层的首轮、100秒后与循环', stacks => {
  const config = { ...input('char_4064_mlynar', 'mlynar_3'), cultivation: 2060, potential: 5,
    bonds: stacks ? [{ bondId: 'kazimierzShip', stacks, activeChars: 6 }] : [] };
  // 网页默认基础攻击为 (354.79775…+25)×1.1。507层另给 floor(507/5)×20 基础攻击及 50%+507% 百分比加攻。
  // S3仅翻倍特性，满蓄力贡献+400%。物理主击吃单敌满潜游侠1.13，11%技能真伤和65%盟约真伤各算一次。
  const atk = ((354.7977528089888 + 25) * 1.1 + Math.floor(stacks / 5) * 20) * (5 + (stacks ? .5 + .01 * stacks : 0));
  const dps = (atk * 1.5 * 1.13 - 1000 + atk * (.11 + (stacks ? .65 : 0))) / (34 / 30);
  const result = calculate(config);
  expect(result.normal.dps).toBe(0);
  expect(result.skill!.stats.atk).toBeCloseTo(atk, 8);
  expect(result.skill!.dps).toBeCloseTo(dps, 8);
  // 第25秒开技，第51秒关技，第96秒再开。30秒只有5秒输出；循环平均 = 窗口总伤 ÷ 30。
  // 100秒累计攻击26+4秒（部署特质的基础攻击限时100秒，窗口末尾仍生效）。
  expect(result.totalDamage.value).toBeCloseTo(dps * 5, 8);
  expect(result.cycle!.avgDps).toBeCloseTo(dps * 5 / 30, 8);
  expect(calculate({ ...config, durationSec: 100 }).totalDamage.value).toBeCloseTo(dps * 30, 8);
});
it('玛恩纳普通S3按真实蓄力过程：首轮35秒爬升，之后满蓄力', () => {
  // 普通无初始+100%；首轮等50-15=35秒，特性 min(2, 35×2/40)=+175%；S3只翻倍特性：301×(1+1.75×2)=1354.5。
  // 单击物理1354.5×1.25×1.1-1000；真伤135.45；间隔1.2。40秒窗口只有35~40秒技能。
  const result = calculate(input('char_4064_mlynar', 'mlynar_3', 'a', 40));
  const first = (1354.5 * 1.25 * 1.1 - 1000 + 135.45) / 1.2;
  expect(result.normal.dps).toBe(0);
  expect(result.skill!.stats.atk).toBeCloseTo(1354.5, 8);
  expect(result.skill!.components.map(c => c.damageType)).toEqual(['physical', 'true']);
  expect(result.totalDamage.value).toBeCloseTo(first * 5, 8);
  expect(result.cycle!.avgDps).toBeCloseTo(first * 5 / 40, 8);
});
it('玛恩纳六人卡西米尔开技后30秒窗口覆盖整段技能，停攻时没有触发次数', () => {
  const sample = (seconds: number, activeChars: number) => calculate({
    ...input('char_4064_mlynar', 'mlynar_3', 'b', seconds),
    bonds: [{ bondId: 'kazimierzShip', activeChars, stacks: 0 }],
  });
  // 0层部署加攻+50%，进阶首轮特性满额后，S3面板为基础攻击的1+.5+2×2=5.5倍。
  // [25,51)和[96,122)两轮每次攻击附带面板×.65（开技窗口30秒 ≥ 技能26秒）。30秒只有5秒附伤，51~96秒停攻。
  const atk = 354.7977528089888 * 5.5;
  const bondDps = atk * .65 / (34 / 30);
  const at30 = sample(30, 6);
  expect(at30.normal.dps).toBe(0);
  expect(at30.skill!.components.find(c => c.source === 'bond:kazimierzShip')?.dps).toBeCloseTo(bondDps, 8);
  expect(at30.totalDamage.value).toBeCloseTo(5 * (atk * 1.5 * 1.1 - 1000 + atk * (.11 + .65)) / (34 / 30), 8);
  for (const [seconds, attacked] of [[25, 0], [51, 26], [96, 26], [101, 31]]) {
    expect(sample(seconds, 6).totalDamage.value - sample(seconds, 3).totalDamage.value).toBeCloseTo(attacked * bondDps, 8);
  }
  expect(at30.cycle!.avgDps - sample(30, 3).cycle!.avgDps).toBeCloseTo(bondDps * 5 / 30, 8);
});
it('玛恩纳S2双击逐段扣防，首轮和后续技能均按满蓄力', () => {
  // 进阶S2面板3A，每段各乘1.6×1.1后减1000防，间隔43帧。初始10、消耗30 → 第20秒开技，30秒窗口内技能10秒。
  const a = 354.7977528089888;
  const result = calculate(input('char_4064_mlynar', 'mlynar_2'));
  const dps = (a * 3 * 1.6 * 1.1 - 1000) * 2 / (43 / 30);
  expect(result.skill!.dps).toBeCloseTo(dps, 8);
  expect(result.cycle!.avgDps).toBeCloseTo(dps * 10 / 30, 8);
});
it('玛恩纳补剂从首轮伤害叠满，第二轮与稳态保留层数并沿用部署特质快照', () => {
  const sample = (seconds: number, activeChars = 3) => calculate({ ...input('char_4064_mlynar', 'mlynar_2', 'b', seconds),
    equips: ['chess_item_3_13_e_a'], bonds: [{ bondId: 'kazimierzShip', stacks: 4, activeChars }] });
  // 首轮20秒起S2每次两段，6个攻击间隔后补剂累计+12层；部署时只有4层故无特质基础加攻。
  // 第二次开技在70秒，此前休整30秒，解放者按真实蓄力过程 min(2, 30×2/40)=+150%；盟约加攻50%+16%，面板为基础攻击的3.16倍。
  const second = (354.7977528089888 * 3.16 * 1.6 * 1.1 - 1000) * 2 / (43 / 30);
  const at80 = sample(80);
  expect(at80.totalDamage.value - sample(70).totalDamage.value).toBeCloseTo(second * 10, 8);
  expect(at80.cycle!.avgDps).toBeCloseTo(at80.totalDamage.value / 80, 8);
  // 首轮前三个攻击间隔开始时临时层数为0、2、4；六人盟约自身的附伤不重复触发补剂。
  const third = 20 + 3 * 43 / 30;
  expect(sample(third, 6).totalDamage.value - sample(third).totalDamage.value)
    .toBeCloseTo(354.7977528089888 * .65 * (3.54 + 3.56 + 3.58), 8);
});
it('圣聆初雪进阶S3：无普攻、10点穿透、3%模组增伤，18秒首次开启', () => {
  // A=846.2247191011236×1.7；单击A×2.1×(1-(25-10)/100)×1.03；间隔2/1.3。
  // 0~18s回53-35SP不攻击；18~30s技能12s；积雪生成间隔1.5不是攻击间隔。
  const dps = 846.2247191011236 * 1.7 * 2.1 * 0.85 * 1.03 / (46 / 30);
  const result = calculate(input('char_1046_sbell2', 'sbell2_3'));
  expect(result.normal.dps).toBe(0);
  expect(result.skill!.dps).toBeCloseTo(dps, 8);
  expect(result.accuracy).toBe('exact');
  expect(result.notes.some(note => note.includes('garrison_154'))).toBe(false);
  expect(result.totalDamage.value).toBeCloseTo(dps * 12, 8);
  // 循环平均 = 30 秒窗口总伤 ÷ 30。
  expect(result.cycle!.avgDps).toBeCloseTo(dps * 12 / 30, 8);
});
it('圣聆初雪S1两次容量不乘回复CD：5、17、29秒各施放一次', () => {
  // 单次846.2247191011236×4.8×.75×1.03；初始7/消耗12→首发5s，然后每12s；30s共3次。
  const hit = 846.2247191011236 * 4.8 * 0.75 * 1.03;
  const result = calculate(input('char_1046_sbell2', 'sbell2_1'));
  expect(result.lifecycle).toBe('charge');
  expect(result.accuracy).toBe('exact');
  expect(result.totalDamage.value).toBeCloseTo(hit * 3, 8);
  expect(result.cycle!.spRecoverSec).toBe(12);
  expect(result.cycle!.avgDps).toBeCloseTo(hit * 3 / 30, 8);
});
it('圣聆初雪S2静止积雪持续伤害按每秒一次，不吃攻速', () => {
  // 首次52s开启，此时早已有积雪；攻击A×3.5×.75×1.03/2，积雪A×.2×.75×1.03每秒。
  const dps = 846.2247191011236 * (3.5 / 2 + 0.2) * 0.75 * 1.03;
  const result = calculate(input('char_1046_sbell2', 'sbell2_2', 'b', 60));
  expect(result.skill!.dps).toBeCloseTo(dps, 8);
  expect(result.totalDamage.value).toBeCloseTo(dps * 8, 8);
  expect(result.lifecycle).toBe('permanent');
});
it.each(['a', 'b'] as const)('两名干员阶级%s的全部技能都走精建', tier => {
  for (const [id, prefix] of [['char_4064_mlynar', 'mlynar'], ['char_1046_sbell2', 'sbell2']]) for (const number of [1, 2, 3]) {
    const result = calculate(input(id, `${prefix}_${number}`, tier));
    expect(result.model).toBe('override');
    expect(result.normal.dps).toBe(0);
    expect(result.skill!.dps).toBeGreaterThan(0);
  }
});
