import { expect, it } from 'vitest';
import { calculate } from './calc.ts';
import type { BondSetting, CalcInput } from './types.ts';

const lappland: CalcInput = { charId: 'char_140_whitew', skillId: 'skchr_whitew_2', tier: 'a',
  bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], equips: [], durationSec: 30 };
const skadi = { ...lappland, charId: 'char_263_skadi', skillId: 'skchr_skadi_2' };
const egir = { bondId: 'egirShip', stacks: 0, activeChars: 3 };
const siracusa = { bondId: 'siracusaShip', stacks: 0, activeChars: 6 };
function output(input: CalcInput, setting: BondSetting, durationSec = 30) {
  const { input: _, ...result } = calculate({ ...input, bonds: [setting], durationSec });
  return result;
}

it('斯卡蒂吞噬与部署技能 +100% 同区加算', () => {
  const r = output(skadi, { ...egir, devouredAtk: 500 });
  // 深海掠食者与跃浪击均以普通阶基础攻击 842 为基数；吞噬的 500 在百分比加成后加入。
  expect(r.normal.stats.atk).toBeCloseTo(842 * 1.14 + 500, 8);
  expect(r.skill?.stats.atk).toBeCloseTo(842 * (1 + .14 + 1) + 500, 8);
  const trained = {...skadi,cultivation:2060,potential:5};
  const base = output(trained,egir), fed = output(trained,{...egir,devouredAtk:500});
  expect(fed.normal.stats.atk-base.normal.stats.atk).toBeCloseTo(500,8);
  expect(fed.skill!.stats.atk-base.skill!.stats.atk).toBeCloseTo(500,8);
  expect(output(skadi, { ...egir, activeChars: 2, devouredAtk: 500 }).normal.stats.atk).toBeCloseTo(842 * 1.14, 8);
  for (const bad of [-1, NaN, Infinity, '500']) {
    expect(output(skadi, { ...egir, devouredAtk: bad as number }).normal.stats.atk).toBeCloseTo(842 * 1.14, 8);
  }
  expect(output(lappland, { ...egir, devouredAtk: 500 })).toEqual(output(lappland, egir));
  expect(output(skadi, { ...siracusa, bandId: 'band_siracusa' })).toEqual(output(skadi, siracusa));
});

it.each([0, 20])('裁度 %i 层按完整攻击动作计数，窗口后停止', stacks => {
  const settings = { ...siracusa, stacks };
  // 裁度替换默认6人效果（异常状态每秒真伤），3人部署攻速不变，故以3人档为基准。
  const plain = { ...settings, activeChars: 3 };
  const delta = (t: number) => output(lappland, { ...settings, bandId: 'band_siracusa' }, t).totalDamage.value
    - output(lappland, plain, t).totalDamage.value;
  // 狼魂不改变攻速。0层前32秒间隔1.3/1.25，20层前40秒间隔1.3/1.41；
  // 隐匿结束至窗口末尾再按原间隔1.3攻击10秒，跨边界保留进度。
  const hidden = 32 + .4 * stacks, interval = Math.round(39 / (1.25 + .008 * stacks)) / 30;
  const expected = .03 * (5000 + 50 * stacks);
  expect(delta(30)).toBeCloseTo(Math.floor(30 / interval) * expected);
  const full = Math.floor(hidden / interval + 10 / 1.3) * expected;
  expect(delta(hidden + 10)).toBeCloseTo(full);
  expect(delta(hidden + 20)).toBeCloseTo(full);
  const base = output(lappland, plain), selected = output(lappland, { ...settings, bandId: 'band_siracusa' });
  expect(selected.cycle!.spRecoverSec).toBe(base.cycle!.spRecoverSec);
  expect(selected.cycle!.avgDps - base.cycle!.avgDps).toBeCloseTo(delta(30) / 30);
  // 阶段 DPS 是区间积分（裁度按离散攻击结算）；开技时的分项快照仍是每次攻击期望 ÷ 间隔。
  const sum = (r: typeof base) => r.skill!.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0);
  expect(sum(selected) - sum(base)).toBeCloseTo(expected / interval);
});

it('缺省或未知策略逐项沿用默认叙拉古，三人档切换不改变结果', () => {
  const base = output(lappland, siracusa);
  expect(output(lappland, { ...siracusa, bandId: 'other' })).toEqual(base);
  // 默认6人：在3人档之上每秒追加800点异常状态真伤（0层），30秒共30跳。
  const plain = output(lappland, { ...siracusa, activeChars: 3 });
  // 分项为开技时快照；技能期 DPS 是首轮 15 秒区间积分（跨过 32 秒部署攻速到期），异常真伤按每秒 800 连续计入。
  const sum = (r: typeof base) => r.skill!.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0);
  expect(sum(plain)).toBeCloseTo(668.32573633);
  expect(plain.skill!.dps).toBeLessThan(sum(plain));
  expect(plain.totalDamage.value).toBeCloseTo(2113.81882889);
  expect(sum(base)).toBeCloseTo(668.32573633 + 800);
  expect(base.skill!.dps - plain.skill!.dps).toBeCloseTo(800, 6);
  expect(base.totalDamage.value).toBeCloseTo(2113.81882889 + 30 * 800);
  expect(base.cycle?.avgDps).toBeCloseTo(base.totalDamage.value / 30);
  expect(base.killTimeSec).toBeLessThan(plain.killTimeSec);
  const three = { ...siracusa, activeChars: 3 };
  expect(output(lappland, { ...three, bandId: 'band_siracusa' })).toEqual(output(lappland, three));
});

it('荒芜拉普兰德只用本体攻击触发，浮游单元不重复触发', () => {
  const input = { ...lappland, charId: 'char_1038_whitw2', skillId: 'skchr_whitw2_3' };
  const plain = { ...siracusa, activeChars: 3 };
  const normal = output(input, plain);
  // 首个本体攻击间隔末端，尽管开场已有浮游单元，仍只追加 150。
  const t = normal.normal.stats.attackInterval;
  expect(output(input, { ...siracusa, bandId: 'band_siracusa' }, t).totalDamage.value
    - output(input, plain, t).totalDamage.value).toBeCloseTo(150);
});

it.each([['boss_9', 1], ['boss_11', .5]] as const)('裁度按 %s 的伤害类型应用承伤倍率', (bossId, factor) => {
  const input = { ...lappland, bossId, bossMechanics: { directional_armor: true } };
  const selected = { ...siracusa, bandId: 'band_siracusa' };
  // 29 次各 150；隐秘核心只减物法，定向装甲明确包含真伤并减半。
  expect(output(input, selected).totalDamage.value - output(input, { ...siracusa, activeChars: 3 }).totalDamage.value)
    .toBeCloseTo(29 * 150 * factor);
});

it('萨尔贡流沙从首次开技计时，地面节拍跨技能保留，技能秒伤单列', () => {
  const input = { ...lappland, charId: 'char_127_estell', skillId: 'skcom_atk_up[2]', tier: 'b' as const };
  const setting = { bondId: 'sargonShip', stacks: 0, activeChars: 6 };
  const delta = (t: number) => output(input, setting, t).totalDamage.value
    - output(input, { ...setting, activeChars: 3 }, t).totalDamage.value;
  // 胄法抗25：5000×.75/5=750 DPS，800×.75=600 DPS。32秒开技，57秒结束；
  // 地面在37、42…秒跳伤，62秒仍有地面；第二次94秒开启，首跳技能秒伤在95秒。
  const r = output(input, setting);
  expect(r.skill!.components.find(c => c.source === 'bond:sargonShip:mag_damage')?.dps).toBe(750);
  expect(r.skill!.components.find(c => c.source === 'bond:sargonShip:mag_damage_2')?.dps).toBe(600);
  expect(delta(32.99)).toBeCloseTo(0);
  expect(delta(33)).toBeCloseTo(600);
  expect(delta(37)).toBeCloseTo(5 * 600 + 3750);
  expect(delta(62)).toBeCloseTo(25 * 600 + 6 * 3750);
  expect(delta(95)).toBeCloseTo(26 * 600 + 12 * 3750);
  // 循环平均 = 窗口总伤 ÷ 窗口时长：100 秒窗口差值 = delta(100)/100。
  expect(output(input, setting, 100).cycle!.avgDps - output(input, { ...setting, activeChars: 3 }, 100).cycle!.avgDps)
    .toBeCloseTo(delta(100) / 100);
  // 击杀时累计伤害必须达到血量，即使最后一跳是离散的地面伤害。
  expect(output(input, setting, r.killTimeSec - .001).totalDamage.value).toBeLessThan(1_418_400);
  expect(output(input, setting, r.killTimeSec).totalDamage.value).toBeGreaterThanOrEqual(1_418_400 - 1e-5);
});

it('卡西米尔六人真伤只在部署后与开技后30秒窗口内生效', () => {
  const input = { ...lappland, charId: 'char_1014_nearl2', skillId: 'skchr_nearl2_1', tier: 'b' as const };
  const setting = { bondId: 'kazimierzShip', stacks: 0, activeChars: 6 };
  const delta = (t: number) => output(input, setting, t).totalDamage.value
    - output(input, { ...setting, activeChars: 3 }, t).totalDamage.value;
  const r = output(input, setting, 180);
  const idle = r.normal.stats.atk * .65 / r.normal.stats.attackInterval;
  const active = r.skill!.stats.atk * .65 / r.skill!.stats.attackInterval;
  // S1初始0、消耗60，永久技能，第60秒开启。窗口 [0,30) 与 [60,90)：30~60秒、90秒以后不附带。
  // 非技能期面板取开技前一刻（部署窗口已过），不再列真伤分项；技能期面板取开技时，列出。
  expect(r.normal.components.find(c => c.source === 'bond:kazimierzShip')).toBeUndefined();
  expect(r.skill!.components.find(c => c.source === 'bond:kazimierzShip')?.dps).toBeCloseTo(active);
  expect(delta(29)).toBeCloseTo(29 * idle);
  expect(delta(59)).toBeCloseTo(30 * idle);
  expect(delta(65)).toBeCloseTo(30 * idle + 5 * active);
  expect(delta(95)).toBeCloseTo(30 * idle + 30 * active);
  expect(delta(r.killTimeSec) + output(input, { ...setting, activeChars: 3 }, r.killTimeSec).totalDamage.value)
    .toBeCloseTo(1_418_400);
});

it.each([
  ['char_350_surtr', 'skchr_surtr_3', 'raidShip', /条件/],
  ['char_4064_mlynar', 'skchr_mlynar_3', 'kazimierzShip', /开技后 30 秒/],
  ['char_127_estell', 'skcom_atk_up[2]', 'sargonShip', /攻速.*全程/],
] as const)('%s 的两个阶段都能在计算过程展开盟约假设', (charId, skillId, bondId, assumption) => {
  const r = output({ ...lappland, charId, skillId, tier: 'b' }, { bondId, activeChars: 6, stacks: 0 });
  for (const phase of [r.normal, r.skill!]) {
    expect(phase.components[0]!.derivation.filter(s => s.source === `bond:${bondId}` && s.op === 'info' && assumption.test(s.label))).toHaveLength(1);
  }
});
