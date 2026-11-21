import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';

// 期望由独立分段积分得到：单个 Boss、裸装、无盟约，部署后 180 秒总伤；每行为 [干员, 技能, 普通阶, 精锐阶]。
const checked: [string, string, number, number][] = [
  ["char_4230_mcnist", "skchr_mcnist_1", 6050.70000, 8935.83303],
  ["char_4230_mcnist", "skchr_mcnist_2", 19963.50000, 44877.47453],
  ["char_4230_mcnist", "skchr_mcnist_3", 47236.11905, 85521.88673],
  ["char_474_glady", "skchr_glady_1", 3568.00000, 13982.38202],
  ["char_474_glady", "skchr_glady_2", 3267.32367, 8724.31200],
  ["char_474_glady", "skchr_glady_3", 11335.11111, 15922.57678],
  ["char_4010_etlchi", "skchr_etlchi_1", 32503.85769, 34207.54382],
  ["char_4010_etlchi", "skchr_etlchi_2", 34387.63846, 59729.25843],
  ["char_4010_etlchi", "skchr_etlchi_3", 67330.33846, 121404.23596],
  ["char_430_fartth", "skcom_quickattack[3]", 17536.87749, 50816.80091],
  ["char_430_fartth", "skchr_fartth_2", 10969.32367, 40469.03993],
  ["char_430_fartth", "skchr_fartth_3", 32160.00000, 79874.71333],
  ["char_4065_judge", "skchr_judge_1", 37496.70000, 55578.50899],
  ["char_4065_judge", "skchr_judge_2", 41748.37500, 59321.81039],
  ["char_4065_judge", "skchr_judge_3", 37227.22500, 56489.72654],
  ["char_4026_vulpis", "skchr_vulpis_1", 24137.06250, 39904.03169],
  ["char_4026_vulpis", "skchr_vulpis_2", 10475.06250, 16593.92496],
  ["char_174_slbell", "skchr_slbell_1", 30037.50000, 36209.27353],
  ["char_174_slbell", "skchr_slbell_2", 30574.83750, 37150.71464],
  ["char_4245_alga", "skchr_alga_1", 5860.01250, 7336.08608],
  ["char_4245_alga", "skchr_alga_2", 5135.06250, 6240.18987],
  ["char_4211_snhunt", "skchr_snhunt_1", 25709.75826, 62744.60759],
  ["char_4211_snhunt", "skchr_snhunt_2", 15774.80870, 57520.40506],
  ["char_333_sidero", "skcom_heal_self[3]", 51710.86957, 71239.93171],
  ["char_333_sidero", "skchr_sidero_2", 65155.69565, 96886.30713],
  ["char_325_bison", "skcom_def_up[3]", 2280.65217, 2650.15823],
  ["char_325_bison", "skchr_bison_2", 1279.69928, 1472.31013],
  ["char_1014_nearl2", "skchr_nearl2_1", 46105.56667, 159961.87109],
  ["char_1014_nearl2", "skchr_nearl2_2", 14215.09333, 36670.25311],
  ["char_1014_nearl2", "skchr_nearl2_3", 60638.38000, 140509.67566],
  ["char_1047_halo2", "skchr_halo2_1", 46582.05159, 60063.12640],
  ["char_4037_demetr", "skchr_demetr_1", 26173.13043, 71909.37360],
  ["char_4037_demetr", "skchr_demetr_2", 35984.19437, 96817.99358],
  ["char_1023_ghost2", "skchr_ghost2_1", 11378.33333, 42795.16152],
  ["char_1023_ghost2", "skchr_ghost2_2", 11818.26667, 42466.02208],
  ["char_1023_ghost2", "skchr_ghost2_3", 22736.00758, 56510.93016],
  ["char_416_zumama", "skchr_zumama_1", 10652.06250, 44593.14312],
  ["char_416_zumama", "skchr_zumama_2", 32936.90625, 71376.29989],
  ["char_416_zumama", "skchr_zumama_3", 58113.61328, 114831.72645],
  ["char_427_vigil", "skchr_vigil_1", 82725.00000, 98995.47694],
  ["char_427_vigil", "skchr_vigil_2", 83326.92000, 100002.94853],
  ["char_427_vigil", "skchr_vigil_3", 134775.60000, 169695.11212],
  ["char_4162_cathy", "skchr_cathy_1", 2954.88000, 3637.70886],
  ["char_4162_cathy", "skchr_cathy_2", 1368.00000, 1638.60759],
  ["char_135_halo", "skchr_halo_1", 33458.71637, 43909.08953],
  ["char_135_halo", "skchr_halo_2", 34654.50128, 47559.80900],
  ["char_4221_ju", "skchr_ju_1", 2935.27174, 9383.06962],
  ["char_4221_ju", "skchr_ju_2", 8657.78261, 33994.79826],
  ["char_337_utage", "skchr_utage_1", 2803.12500, 3443.01449],
  ["char_337_utage", "skchr_utage_2", 15828.27945, 22303.61043],
  ["char_4207_branch", "skchr_branch_1", 3584.59239, 4457.63449],
  ["char_4207_branch", "skchr_branch_2", 12684.29348, 36568.82714],
  ["char_358_lisa", "skchr_lisa_1", 49928.98091, 66988.02273],
  ["char_358_lisa", "skchr_lisa_2", 41247.87970, 52244.63182],
  ["char_358_lisa", "skchr_lisa_3", 24409.62406, 24706.22727],
  ["char_4058_pepe", "skchr_pepe_1", 48241.04000, 96977.84957],
  ["char_4058_pepe", "skchr_pepe_2", 65814.06541, 150982.46438],
  ["char_4058_pepe", "skchr_pepe_3", 109179.57778, 172745.05568],
  ["char_400_weedy", "skchr_weedy_1", 5006.39750, 6307.57197],
  ["char_400_weedy", "skchr_weedy_2", 12422.14093, 30811.62805],
  ["char_400_weedy", "skchr_weedy_3", 13943.41250, 16823.30688],
  ["char_188_helage", "skchr_helage_1", 6493.80000, 13330.65562],
  ["char_188_helage", "skchr_helage_2", 6709.73333, 17034.06180],
  ["char_188_helage", "skchr_helage_3", 5304.85000, 15449.98034],
  ["char_488_buildr", "skcom_charge_cost[3]", 3071.25000, 3936.25396],
  ["char_488_buildr", "skchr_buildr_2", 3260.64375, 4410.06230],
  ["char_484_robrta", "skchr_robrta_1", 2940.76000, 3678.77174],
  ["char_484_robrta", "skchr_robrta_2", 1702.00000, 1826.34058],
  ["char_4031_liesel", "skchr_liesel_1", 33287.99382, 44928.48712],
  ["char_4031_liesel", "skchr_liesel_2", 41900.79816, 63771.46814],
  ["char_237_gravel", "skchr_gravel_1", 3394.28571, 4148.94410],
  ["char_237_gravel", "skchr_gravel_2", 3394.28571, 4148.94410],
  ["char_328_cammou", "skcom_atk_up[2]", 66910.72500, 95830.02717],
  ["char_328_cammou", "skchr_cammou_2", 67026.48750, 93556.40916],
  ["char_127_estell", "skcom_atk_up[2]", 4358.51600, 6093.03502],
  ["char_127_estell", "skchr_estell_2", 4483.41102, 15433.04348],
];

it.each(checked)('%s 的 %s 两阶裸装180秒总伤与独立积分一致', (charId, skillId, a, b) => {
  for (const [tier, expected] of [['a', a], ['b', b]] as const) {
    const r = calculate({ charId, skillId, tier, bossId: 'boss_1', modeId: 'mode_single_10', equips: [], bonds: [] });
    expect(r.totalDamage.value).toBeCloseTo(expected, 4);
  }
});

// 这四项含攻速递变、逐击叠层或血量增伤，独立1/600秒参考值及假设见 cross-07-09-extra.md。
it.each([
  ['char_4026_vulpis','skchr_vulpis_3',7416.35,10724.33],
  ['char_1047_halo2','skchr_halo2_2',42777.42,53519.27],
  ['char_1047_halo2','skchr_halo2_3',57912.72,78970.78],
  ['char_4037_demetr','skchr_demetr_3',67842.11,192393.59],
] as const)('%s 的 %s 两阶180秒与逐击参考相差小于5%', (charId, skillId, a, b) => {
  for(const [tier, expected] of [['a',a],['b',b]] as const) {
    const result=calculate({charId, skillId, tier, bossId:'boss_1', modeId:'mode_single_10', equips:[], bonds:[]});
    expect(Math.abs(result.totalDamage.value/expected-1)).toBeLessThan(.05);
  }
});
