import { describe, expect, it } from 'vitest';
import equipsJson from '../data/generated/equips.json';
import bossesJson from '../data/generated/bosses.json';
import { calculate } from './calc.ts';
import { swiftCycles } from './skills/overrides/swift.ts';
import { castMark, type Segment } from './timeline.ts';
import { battleEffects } from './effects/common.ts';
import type { GenericModel } from './skills/generic.ts';
import type { BondSetting, BossData, EquipData, SkillLevelData } from './types.ts';

const base = { tier: 'b' as const, bossId: 'boss_1', modeId: 'mode_single_10', cultivation: 2060, potential: 5 };
const run = (charId: string, skillId: string, equips: string[] = [], bonds: BondSetting[] = [], durationSec = 180) =>
  calculate({ ...base, charId, skillId, equips, bonds, durationSec });
const bond = (bondId: string, activeChars: number, stacks: number): BondSetting => ({ bondId, activeChars, stacks });
const total = (...args: Parameters<typeof run>) => run(...args).totalDamage.value;
const glove = 'chess_item_2_10_e_b', dagger = 'chess_item_3_03_e_b', tonic = 'chess_item_3_13_e_b';
const isomorph = 'chess_item_6_03_e_a', flag = 'chess_item_4_04_e_a', suit = 'chess_item_3_01_e_a';

describe('阶段 DPS 取区间积分', () => {
  it('史尔特尔 S2 带进阶灵巧涡轮手套：技能期 = 首轮 [13, 30] 秒的伤害 ÷ 17，非技能期 = 前 13 秒伤害 ÷ 13', () => {
    // 初始 0、消耗 13、每秒 1 → 第 13 秒开技，持续 17 秒。手套每秒 +3 攻速，开技前已叠层，快照面板低估两期。
    const r = run('char_350_surtr', 'skchr_surtr_2', [glove]);
    const at13 = total('char_350_surtr', 'skchr_surtr_2', [glove], [], 13);
    const at30 = total('char_350_surtr', 'skchr_surtr_2', [glove], [], 30);
    expect(r.normal.dps).toBeCloseTo(at13 / 13, 6);
    expect(r.skill!.dps).toBeCloseTo((at30 - at13) / 17, 6);
    // 第 k 秒的攻速为 100+3×min(k,20)，逐秒按 30 帧取整后积分。
    const average = (from:number, until:number, hit:number) => {
      let amount = 0;
      for (let k=from; k<until; k++) amount += hit * 30 / Math.round(1.25 * 30 * 100 / (100 + 3 * Math.min(k,20)));
      return amount / (until-from);
    };
    expect(r.skill!.dps).toBeCloseTo(average(13,30,r.skill!.components[0]!.perHit), 6);
    expect(r.normal.dps).toBeCloseTo(average(0,13,r.normal.components[0]!.perHit), 6);
  });
});

describe('迅捷在独立时间轴里逐次判定', () => {
  const swift = (n: number) => n ? [bond('swiftShip', 2, n)] : [];
  it('烛煌 S1、妮芙 S2、塔露拉 S1：概率小于 1 时回技也会生效，228 与 229 层只差少量失败判定', () => {
    for (const [charId, skillId] of [['char_1040_blaze2', 'skchr_blaze2_1'], ['char_4146_nymph', 'skchr_nymph_2'], ['char_4247_oxi', 'skchr_oxi_1']] as const) {
      const [none, mid, near, full] = [0, 100, 228, 229].map(n => total(charId, skillId, [], swift(n)));
      // 修复前 0 / 100 / 228 层结果完全相同，229 层才跳到另一条路径。
      expect(mid).not.toBeCloseTo(none, 0);
      // 228 层概率 0.998：180 秒内至多一两次失败，每次失败多等一轮回复。
      expect(Math.abs(near - full) / full).toBeLessThan(0.05);
    }
  });
  it('零时长技能连续施放的最短间隔取技能攻击间隔（锏 S2：1.30 秒而不是 1 秒）', () => {
    // 直接驱动专属模型的迅捷循环：零时长、每次必定回技且回技 ≥ 消耗，两次施放之间只能隔一个攻击间隔。
    const level = { spType: 'INCREASE_WITH_TIME', maxChargeTime: 1, spCost: 10, initSp: 10, increment: 1 } as SkillLevelData;
    const stats = { atk: 1, attackSpeed: 100, attackInterval: 1.3, derivation: { atk: [], attackSpeed: [], attackInterval: [] } };
    const model = { normal: { stats, components: [], dps: 1 }, skill: { stats, components: [], dps: 0 }, duration: 0, lifecycle: 'charge',
      burst: true, passive: false, notes: [], caveats: [], ignoredKeys: [], unconsumed: [],
      battle: { ...battleEffects(), skillEndProbability: 1, skillEndSp: 12 } } as unknown as GenericModel;
    const cast = (): Segment[] => [castMark(), { duration: 0, dps: 0, burst: 100 }];
    swiftCycles(model, level, 10, 10, cast(), need => need <= 0 ? 0 : need, seconds => [{ duration: seconds, dps: 1 }, ...cast()]);
    const casts = model.customTimeline!(20, Infinity).castsUntil!(10);
    expect(casts.slice(0, 4)).toEqual([0, 1.3, 2.6, 3.9].map(t => expect.closeTo(t, 9)));
  });
  it('引星棘刺 S2：首投在攒满一次消耗之后，库存不再欠首轮技力', () => {
    // 初始13、消耗24，第11秒首投，投后库存0。单元存在19秒，期间每秒额外回复0.1技力。
    // 成功回复12时第二投在11+12/1.1，失败时在11+24−19×.1。第31秒前最多只有第二投会带来额外伤害。
    const two = [bond('swiftShip', 2, 0)];
    const at = (t: number, settings: BondSetting[]) => total('char_1039_thorn2', 'skchr_thorn2_2', [], settings, t);
    const unitRate = (at(13, []) - at(12, [])) - (at(8, []) - at(7, []));
    expect(unitRate).toBeGreaterThan(0);
    for (const t of [11, 20, 25, 30, 31]) {
      const extra = unitRate * Math.max(0, t - 11 - 12 / 1.1);
      expect(at(t, two)).toBeCloseTo(at(t, []) + .2 * extra, 6);
    }
    // 40层时成功回满24点，迅捷轨迹前180秒有11投。首投的固定判定失败，第二投为33.1秒。
    // 单元存在的19秒与攒技力并行，若误加到两投间隔，就会被分到低频支而在25秒多算一个单元。
    expect(at(25, [bond('swiftShip', 2, 40)])).toBeCloseTo(at(25, []), 6);
  });
});

describe('六人卡西米尔订阅专属时间轴的每一次开技', () => {
  it('棘刺 S3 带变形同构体与竞技旗：第二次开技（约 67 秒，进入永续）重新开启 30 秒真伤窗口', () => {
    const diff = (t: number) => total('char_293_thorns', 'skchr_thorns_3', [isomorph, flag], [bond('kazimierzShip', 6, 0)], t)
      - total('char_293_thorns', 'skchr_thorns_3', [isomorph, flag], [bond('kazimierzShip', 3, 0)], t);
    // 修复前第 60、75、90 秒差值相同（第二次开技后不再附带真伤）。
    expect(diff(75)).toBeGreaterThan(diff(60) + 1000);
    // 窗口 [c₂, c₂+30) 内永续阶段真伤秒伤恒定：[75,90] 15 秒与 [90, c₂+30] 的增量之比等于时长之比。
    // c₂ 由 [60,75] 的增量反推：只有 [c₂,75] 在窗口内（首次窗口约 48.5 秒已关闭）。
    const rate = (diff(90) - diff(75)) / 15;
    const second = 75 - (diff(75) - diff(60)) / rate;
    expect(second).toBeGreaterThan(60);
    expect(diff(120) - diff(90)).toBeCloseTo(rate * (second + 30 - 90), 0);
  });
});

describe('伊比利亚持续法伤保留独立时钟', () => {
  it('温蒂 S3 第 21 秒瞬发：开技前后的持续法伤连续，不凭空多一跳', () => {
    const diff = (t: number) => total('char_400_weedy', 'skchr_weedy_3', [], [bond('iberiaShip', 3, 0)], t) - total('char_400_weedy', 'skchr_weedy_3', [], [], t);
    const dot = run('char_400_weedy', 'skchr_weedy_3', [], [bond('iberiaShip', 3, 0)]).normal.components.find(c => c.source === 'bond:iberiaShip:dot')!;
    // 每秒 620.29；修复前 [20.999, 21] 之间跳了一整跳 620.29。
    expect(diff(21) - diff(20.999)).toBeCloseTo(dot.perHit * 0.001, 6);
    expect(diff(22) - diff(20)).toBeCloseTo(dot.perHit * 2, 6);
  });
});

describe('六人叙拉古按当时层数与在场状态结算', () => {
  it('贝洛内带多功能补剂：每跳按当时有效层数，叠满后每秒 800 + 10 × 24', () => {
    const max = (equipsJson as EquipData[]).find(e => e.chessId === tonic)!.buffs[0]!.blackboard.nums.temp_stack_count_max!;
    const diff = (t: number) => total('char_4037_demetr', 'skchr_demetr_1', [tonic], [bond('siracusaShip', 6, 0)], t)
      - total('char_4037_demetr', 'skchr_demetr_1', [tonic], [bond('siracusaShip', 3, 0)], t);
    // 修复前 180 秒恰为 800 × 180 = 144000（固定读部署层数 0）。
    expect(diff(180)).toBeGreaterThan(144000);
    expect(diff(120) - diff(60)).toBeCloseTo(60 * (800 + 10 * max), 6);
  });
  it('史尔特尔 S3 经同构体与正装取得身份：余烬结束退场后真伤停止，也不会因此击杀', () => {
    const six = run('char_350_surtr', 'skchr_surtr_3', [isomorph, suit], [bond('siracusaShip', 6, 0)]);
    const diff = (t: number) => total('char_350_surtr', 'skchr_surtr_3', [isomorph, suit], [bond('siracusaShip', 6, 0)], t)
      - total('char_350_surtr', 'skchr_surtr_3', [isomorph, suit], [bond('siracusaShip', 3, 0)], t);
    // 退场在第 42~43 秒之间：只结算 42 跳 = 33600。修复前全程 180 跳 = 144000，并在约 1607 秒“击杀”。
    expect(diff(180)).toBeCloseTo(42 * 800, 6);
    expect(diff(60)).toBeCloseTo(diff(180), 6);
    expect(six.killTimeSec).toBe(Infinity);
  });
});

describe('专属模型的分段叠层', () => {
  it('望 S3 第 0 秒的开局伤害保留：手套从第 1 秒才开始叠', () => {
    // 修复前第 0 秒 5856.66 被相减为 0。
    expect(total('char_2027_wang', 'skchr_wang_3', [glove], [], 0)).toBeCloseTo(total('char_2027_wang', 'skchr_wang_3', [], [], 0), 6);
    expect(total('char_2027_wang', 'skchr_wang_3', [], [], 0)).toBeCloseTo(5856.66, 1);
  });
  it('史尔特尔 S3（只开一次）与圣聆初雪 S2 带进阶炎国短刀：首次开技叠一层', () => {
    // 修复前两者总伤与空装完全相同（史尔特尔首开时刻算成 NaN 被丢弃；圣聆初雪被入口条件排除）。
    expect(total('char_350_surtr', 'skchr_surtr_3', [dagger])).toBeGreaterThan(total('char_350_surtr', 'skchr_surtr_3') + 1000);
    expect(total('char_1046_sbell2', 'skchr_sbell2_2', [dagger])).toBeGreaterThan(total('char_1046_sbell2', 'skchr_sbell2_2') + 1000);
  });
  it('逻各斯 S1 带手套：分段击杀保留处决阈值', () => {
    const hp = (bossesJson as BossData[]).find(b => b.bossId === 'boss_1')!.hpByMode.mode_single_10!;
    const r = run('char_4133_logos', 'skchr_logos_1', [glove]);
    expect(Number.isFinite(r.killTimeSec)).toBe(true);
    // 处决：击杀时刻的累计伤害仍低于血量。
    expect(total('char_4133_logos', 'skchr_logos_1', [glove], [], r.killTimeSec)).toBeLessThan(hp);
  });
});

describe('限时增益进入真实时间轴', () => {
  it('史尔特尔经同构体与正装取得叙拉古身份：部署攻速 32 秒到期后不再计入', () => {
    // 叙拉古 3 人 0 层：部署后 32 秒 +25 攻速。修复前专属轴按部署攻速整场计算，差值随时间一直增长。
    for (const skillId of ['skchr_surtr_1', 'skchr_surtr_2']) {
      const diff = (t: number) => total('char_350_surtr', skillId, [isomorph, suit], [bond('siracusaShip', 3, 0)], t) - total('char_350_surtr', skillId, [isomorph, suit], [], t);
      expect(diff(30)).toBeGreaterThan(0);
      if (skillId.endsWith('_1')) {
        // 攻回技能的早开相位保留。两条轴在部署增益到期后都以 3 次普攻加 1 次技能攻击循环。
        // 同构体与正装下未加部署攻速的攻击间隔为 33 帧，10 轮共 44 秒。
        expect(diff(40 + 10 * 4 * 33 / 30)).toBeCloseTo(diff(40), 6);
      } else {
        // 自动回复的 S2 转场由时间决定，失去部署攻速后差值恒定。
        expect(diff(180)).toBeCloseTo(diff(32), 6);
      }
    }
  });
});
