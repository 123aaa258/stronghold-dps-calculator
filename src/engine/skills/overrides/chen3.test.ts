import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import type { CalcInput } from '../../types.ts';

it.each([
  ['boss_1','arts',572.97,1179.73], ['boss_3','physical',872.97,786.49],
] as const)('五阶陈三技能对%s同时提供两侧的可见数值及三连击频率', (bossId, chosen, physical, arts) => {
  const r = calculate({ charId: 'char_1050_chen3', skillId: 'skchr_chen3_3', tier: 'b', diyShopLevel: 5,
    bossId, modeId: 'mode_single_20', equips: [], bonds: [], cultivation: 2060, potential: 5 });
  const c = r.skill!.components[0]!;
  expect(c.damageType).toBe(chosen);
  expect(c.hitsPerAttack).toBe(3);
  expect(c.hitsPerSec).toBeCloseTo(2.8125, 8);
  expect(c.dps).toBeCloseTo(c.perHit * c.hitsPerSec, 8);
  for (const [label, expected] of [['理论物理伤害', physical], ['理论法术伤害', arts]] as const) {
    const step = c.derivation.find(s => s.label.includes(label))!;
    expect(step.op).toBe('set');
    expect(step.value).toBeCloseTo(expected, 2);
  }
});

const input: CalcInput = { charId: 'char_1050_chen3', tier: 'b', skillId: 'skchr_chen3_3',
  bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [], durationSec: 30 };

it.each([[5, 30], [6, 60]] as const)('%i阶精锐陈S3：首轮剑气按胄本体当前生命，三段平砍各自择弱', (diyShopLevel, moduleAtk) => {
  // 精二60面板 B=542+(670−542)×59/89+模组攻击（X1 +30，X3 +60），天赋 A=1.13B，间隔 I=1.25/1.13。
  // 胄 DEF1000/RES25，普攻与三连每段法伤更高：N=.75A/I，S=3×1.8A×.75/I。
  // 首轮13=28−15秒开：本体600000−13N。其6%超过5.5A；剑气是预计算法伤，即使物伤更高也固定过25法抗。
  // 剑气只在开启时记一次，技能面板=S+剑气/20；30秒=13N+剑气+17S。
  const result = calculate({ ...input, diyShopLevel });
  const a = (542 + 128 * 59 / 89 + moduleAtk) * 1.13, interval = (33 / 30);
  const n = a * .75 / interval, s = 3 * 1.8 * a * .75 / interval;
  const opening = (600000 - 13 * n) * .06 * .75;
  expect(result.skill!.components.map(c => c.damageType)).toEqual(['arts', 'arts']);
  expect(result.skill!.dps).toBeCloseTo(s + opening / 20, 7);
  expect(result.totalDamage.value).toBeCloseTo(13 * n + opening + 17 * s, 7);
  // 循环平均 = 30 秒窗口总伤 ÷ 30。
  expect(result.cycle!.avgDps).toBeCloseTo(result.totalDamage.value / 30, 7);
  // 稳态本体降至1，剑气最低5.5A，再过法抗，冷却28秒：180 秒窗口不能把首轮高额剑气无限复制。
  const long = calculate({ ...input, diyShopLevel, durationSec: 180 });
  expect(long.totalDamage.value).toBeLessThan(13 * n + 4 * opening + 167 * s);
});

it('普通陈S2：在对铳时普攻选法术，十次高倍率斩击各自转物理', () => {
  // 普通阶无模组 B=542；铳 DEF1100/RES60。普攻 A=1.13B，取.4A；斩击 3.9A，取3.9A−1100。
  // 初动24−11=13秒；第一斩即命中，之后每.4秒一斩。第17秒起6秒强化，A'=542×(1+.13+2.3)，
  // 此时.4A'与A'−1100再次取大。技能期10秒总伤=10斩+6秒强化普攻；无击倒追加。
  const base = { ...input, tier: 'a' as const, bossId: 'boss_2', skillId: 'skchr_chen3_2' };
  const at = (durationSec: number) => calculate({ ...base, durationSec });
  const a = 542 * 1.13, boosted = 542 * 3.43, interval = (33 / 30);
  const slash = a * 3.9 - 1100, normal = a * .4 / interval;
  const enhanced = Math.max(boosted - 1100, boosted * .4) / interval;
  const result = at(13.5);
  expect(result.normal.components[0].damageType).toBe('arts');
  expect(result.skill!.components[0].damageType).toBe('physical');
  expect(result.skill!.dps).toBeCloseTo((10 * slash + 6 * enhanced) / 10, 7);
  expect(result.totalDamage.value).toBeCloseTo(13 * normal + 2 * slash, 7);
});

it('普通陈S1：炎盟约百分比与天赋、技能攻击力加算', () => {
  // 三名炎干员、5层给.23+.009×5=.275，S1四级+.65，二连对胄均取法伤。
  const result = calculate({ ...input, tier: 'a', skillId: 'skchr_chen3_1',
    bonds: [{ bondId: 'yanShip', stacks: 5, activeChars: 3 }] });
  expect(result.skill!.stats.atk).toBeCloseTo(542 * (1 + .13 + .65 + .275), 8);
  expect(result.skill!.dps).toBeCloseTo(542 * 2.055 * 2 * .75 / ((33 / 30)), 8);
});

it('精锐陈S3：迅捷按两种施放时刻分别读取本体血量', () => {
  // 第一次开技13秒，结束33秒；40层迅捷非成员 p=.34、R=15。
  // t=46秒仅迅捷成功时能再开。成功时首轮之后经历了20秒三连和13秒普攻，
  // 故 t=46 的伤害是首轮+26秒普攻+20秒三连，成功时再加第二次剑气。
  const a = (542 + 128 * 59 / 89 + 60) * 1.13, interval = (33 / 30);
  const n = a * .75 / interval, s = 3 * 1.8 * a * .75 / interval;
  const first = (600000 - 13 * n) * .06 * .75;
  const before = 26 * n + 20 * s + first;
  const second = (600000 - before) * .06 * .75;
  const result = calculate({ ...input, durationSec: 46, bonds: [{ bondId: 'swiftShip', activeChars: 3, stacks: 40 }] });
  expect(result.totalDamage.value).toBeCloseTo(before + .34 * second, 6);
});

// 独立逐路径遍历。每个子分支扣自己的剑气、完整技能期和实际回技期间的普攻，再读下一次剑气的生命。
function manualChenWindow(seconds:number, p:number, tier:'a'|'b', armor:boolean) {
  const elite = tier === 'b';
  const atk = (elite ? 542 + 128 * 59 / 89 + 60 : 542) * 1.13;
  const arts = .75 * (armor ? .5 : 1), interval = 33 / 30;
  const idle = atk * arts / interval, strikes = 3 * (elite ? 1.8 : 1.65) * idle;
  const cost = elite ? 28 : 29, first = elite ? 13 : 17;
  const initialLife = armor ? 120000 : 600000;
  function cast(time:number, life:number):number {
    if (seconds < time) return 0;
    const wave = arts * Math.max((elite ? 5.5 : 5.3) * atk, .06 * Math.max(1, life));
    const duration = Math.min(20, seconds - time);
    const hit = wave + duration * strikes;
    if (duration < 20) return hit;
    const after = life - hit;
    function next(wait:number) {
      const ordinary = Math.min(wait, seconds - time - 20) * idle;
      return ordinary + cast(time + 20 + wait, after - ordinary);
    }
    return hit + (p < 1 ? (1-p) * next(cost) : 0) + (p > 0 ? p * next(cost - 15) : 0);
  }
  return Math.min(seconds, first) * idle + cast(first, initialLife - first * idle);
}

it.each([
  ['a',false,40,.34,180], ['b',false,40,.34,180],
  ['b',false,40,.34,79], ['b',false,40,.34,94],
  ['b',true,40,.34,180], ['b',true,999,1,180],
  ['b',false,40,.34,12], ['b',false,40,.34,0],
] as const)('陈S3 %s阶 残血%s 迅捷%i层 p=%s，%i秒全路径的期望总伤', (tier,armor,stacks,p,seconds) => {
  const r = calculate({ ...input, tier, durationSec:seconds, bossMechanics:{low_hp_armor:armor},
    bonds:[{bondId:'swiftShip',activeChars:2,stacks}] });
  const expected = manualChenWindow(seconds, p, tier, armor);
  expect(r.totalDamage.value).toBeCloseTo(expected, 6);
  if (seconds > 0) expect(r.cycle!.avgDps).toBeCloseTo(expected / seconds, 6);
});

it('胄残血阶段：开场本体最多12万，剑气与普攻都受甲胄减伤', () => {
  // 原始60万，开启20%甲胄。13秒初动先打13N，N=.75A/I×.5；首道剑气
  // (600000×.2−13N)×.06仍高于5.5A，预计算法伤取原始值×.75×.5。
  const result = calculate({ ...input, bossMechanics: { low_hp_armor: true } });
  const a = (542 + 128 * 59 / 89 + 60) * 1.13;
  const n = a * .75 / ((33 / 30)) * .5;
  const wave = (120000 - 13 * n) * .06 * .75 * .5;
  const strikes = n * 3 * 1.8;
  expect(result.skill!.dps).toBeCloseTo(strikes + wave / 20, 7);
  expect(result.totalDamage.value).toBeCloseTo(13 * n + 17 * strikes + wave, 7);
});

it.each([['boss_13', 'unblocked_shield'], ['boss_17', 'moving_might']])(
  '%s未阻挡开关使陈X模组获得8攻速', (bossId, mechanic) => {
    // 精锐常态100+13=113；未阻挡额外+8，间隔1.25/1.21，普通阶没有这项模组特性。
    const scenario = { ...input, bossId, bossMechanics: { [mechanic]: true } };
    expect(calculate(scenario).skill!.stats.attackInterval).toBeCloseTo((31 / 30), 8);
    expect(calculate({ ...scenario, tier: 'a' }).skill!.stats.attackInterval).toBeCloseTo((33 / 30), 8);
  },
);

it.each([
  ['boss_6', 'advance', 15000 * .5], ['boss_7', 'madness', 240000 * .5],
  ['boss_11', 'directional_armor', 120000 * .5], ['boss_14', 'directional_armor', 120000],
  ['boss_12', 'evade', 120000 * .75], ['boss_15', 'evade', 120000 * .75],
] as const)('%s的%s按所选阶段起始本体生命计算', (bossId, mechanic, initialHp) => {
  // 首轮前13秒普攻扣本体生命；隐秘核心械从登场就有护甲，茧首次伪装时已损失1/4。
  const r = calculate({ ...input, bossId, bossMechanics: { [mechanic]: true } });
  const displayed = r.skill!.components.at(-1)!.derivation.find(step => step.label === '开技时推算本体生命');
  expect(displayed!.value).toBeCloseTo(Math.max(1, initialHp - 13 * r.normal.dps), 7);
});

it('剑气只触发一次骨刺刀附伤，附伤不递归', () => {
  // 普通骨刺刀每次伤害附加25%ATK法伤。初动的13秒平砍也附伤，先扣本体；
  // t=13恰好剑气命中，未经过三连的持续时间，此时额外只加一段刀伤。
  const a = (542 + 128 * 59 / 89 + 60) * 1.13, interval = (33 / 30);
  const knife = .25 * a * .75, opening = 13 * (a * .75 + knife) / interval;
  const wave = (600000 - opening) * .06 * .75;
  const r = calculate({ ...input, durationSec: 13, equips: ['chess_item_3_14_e_a'] });
  expect(r.totalDamage.value).toBeCloseTo(opening + wave + knife, 7);
});
