import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import type { CalcInput } from '../../types.ts';

const base: CalcInput = { charId: 'char_4182_oblvns', tier: 'b', skillId: 'skchr_oblvns_3',
  bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [], durationSec: 30 };
const atk = 587 + (725 - 587) * 59 / 89 + 63;
const interval = 33 / 30;

it.each([
  [5, 38, 5, .03, .02], [6, 63, 7, .05, .025],
] as const)('%i阶精锐祥子 S3：四个音符分别过防抗，16次普攻后进技能', (diyShopLevel, moduleAtk, moduleSpeed, defPen, resPen) => {
  // Y1加38攻/5速，每音符3%穿防/2%穿抗；Y3加63攻/7速，每音符5%穿防/2.5%穿抗。
  // 另有自身范围天赋12攻速；阻挡时普攻全倍率，在两档穿防下都只打胄的5%保底。
  const atk = 587 + 138 * 59 / 89 + moduleAtk;
  const interval = Math.round(3900 / (100 + moduleSpeed + 12)) / 30;
  // S3单次2物2法，每段1.8A；同批四个音符按4→1消失，物/法各均分四个命中位置。
  // 初始30、消耗46，16I秒开技，30秒时仍在25秒技能内；尚未凑足450 Fever。
  const normal = .05 * atk / interval;
  const skill = [1, 2, 3, 4].reduce((sum, notes) => sum + .5 * (
    Math.max(.05 * 1.8 * atk, 1.8 * atk - 1000 * (1 - defPen * notes))
    + 1.8 * atk * (1 - .25 * (1 - resPen * notes))), 0) / interval;
  const result = calculate({ ...base, diyShopLevel });
  expect(result.normal.dps).toBeCloseTo(normal, 8);
  expect(result.skill!.dps).toBeCloseTo(skill, 8);
  expect(result.totalDamage.value).toBeCloseTo(16 * interval * normal + (30 - 16 * interval) * skill, 6);
});

it('S2 在卫戍每次部署只切换一次，钢琴五击后风琴常驻', () => {
  // 钢琴攻击+75%，普通音符一层穿防；五次物理=5×(1.75A−950)。风琴攻速119+110，
  // 一层穿抗2.5%，每发法伤=A×(1−.25×.975)。30秒与120秒的差额全为风琴输出。
  const input = { ...base, skillId: 'skchr_oblvns_2' };
  const r = calculate(input);
  const pianoHit = 1.75 * atk - 950;
  const organ = atk * (1 - .25 * .975) / (17 / 30);
  expect(r.skill!.dps).toBeCloseTo(organ, 8);
  expect(r.totalDamage.value).toBeCloseTo(5 * pianoHit + (30 - 5 * interval) * organ, 6);
  expect(calculate({ ...input, durationSec: 120 }).totalDamage.value - r.totalDamage.value).toBeCloseTo(90 * organ, 6);
});

it('S1 八个递减倍率分开结算，自己充满 Fever 后连续演奏', () => {
  // 一次攻回4点需4次普攻，技耗1个攻击间隔。8个法术音符依次按9至2个在场音符穿抗。
  // 每轮(4+8)×3=36 Fever。第13次开技前(12×12+4)×3=444，第14次开技前达到450。
  // 首个 Fever 于 4I+13×5I=69I 开启；随后20秒连续施放，按12层穿抗，无普攻或技力等待。
  const input = { ...base, skillId: 'skchr_oblvns_1' };
  const scales = [.8, .73, .6, .47, .33, .27, .13, .04];
  const hit = scales.reduce((sum, scale, i) => sum + atk * scale * (1 - .25 * (1 - .025 * (9 - i))), 0);
  expect(calculate(input).skill!.dps).toBeCloseTo(hit / interval, 8);
  const onset = 69 * interval;
  const before = calculate({ ...input, durationSec: onset });
  const after = calculate({ ...input, durationSec: onset + 2 });
  const fever = atk * scales.reduce((sum, scale) => sum + scale, 0) * (1 - .25 * .7) / interval;
  expect(after.totalDamage.value - before.totalDamage.value).toBeCloseTo(2 * fever, 6);
  // 进阶作战粮初始6SP，开局先用4、余2。第二次开技在3I，第14次在63I，
  // 此时前13个八音符和50次普攻已累计462点；在该施放点立刻进入Fever。
  const stocked = { ...input, equips: ['chess_item_3_04_e_b'] };
  const at = (t: number) => calculate({ ...stocked, durationSec: t }).totalDamage.value;
  expect(at(63 * interval + 2) - at(63 * interval)).toBeCloseTo(2 * fever, 6);
});

it('S3 迅捷两支达到 Fever 门槛的施放轮次不同', () => {
  // 首开前16击，技能中22轮四音符=88击。失败支再普攻46次，第二次开技时恰为150击，
  // 技能持续20+25秒。成功支仅普攻31次，第二次开技时只有135击，仍只持续25秒。
  // 122秒时慢支正在演奏、快支已结束两次25秒技能且没有第三次开技，按首轮结束时的概率加权。
  const { normal, skill } = calculate(base);
  const t = 122;
  const fast = 50 * skill!.dps + (t - 50) * normal.dps;
  const slow = (t - 62 * interval) * skill!.dps + 62 * interval * normal.dps;
  const result = calculate({ ...base, durationSec: t, bonds: [{ bondId: 'swiftShip', activeChars: 3, stacks: 40 }] });
  expect(result.totalDamage.value).toBeCloseTo(.34 * fast + .66 * slow, 6);
});
