import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';

const base = { tier:'b' as const, bossId:'boss_1', modeId:'mode_single_10', bonds:[] };
it('五种特殊锤齐备时，按攻击翻倍、攻速130和电流穿透后的法伤积累灼燃', () => {
  const equips = ['chess_item_6_11_e_a'];
  // 有效法抗 25×(1−30%) = 17.5。塔露拉 28 帧一次，烛煌技能三 7 帧一发。
  const oxi = calculate({...base, equips, charId:'char_4247_oxi', skillId:'skchr_oxi_2'});
  const blaze = calculate({...base, equips, charId:'char_1040_blaze2', skillId:'skchr_blaze2_3'});
  expect(oxi.elemental?.perSec).toBeCloseTo(830.5056179775281 * 2 * .825 * 30/28 * .21,7);
  expect(blaze.elemental?.perSec).toBeCloseTo(708.2696629213483 * 2.85 * .825 * 30/7 * .1,7);
});
it('塔露拉原生灼燃和普通或终极重锤共用一次爆发与十秒锁条', () => {
  for (const [id, atk] of [['chess_item_4_05_e_a',.30], ['chess_item_6_11_e_a',.20]] as const) {
    // 普通灼燃锤 +30%，终极仅继承场上一种特殊锤 +20%。天赋 11% 与重锤 10% 一起填充 2000。
    const input = { ...base, charId:'char_4247_oxi', skillId:'skchr_oxi_2', equips:[id], fieldHammers:['灼燃维式重锤'] };
    const attack = 830.5056179775281 * (1 + atk);
    const speed = attack * .75 / 1.2;
    const at = 2000 / (.21 * speed);
    const r = calculate({ ...input, durationSec:at + 5 });
    expect(r.elemental?.perSec).toBeCloseTo(speed * .21, 7);
    expect(r.totalDamage.value).toBeCloseTo(speed * at + 7000 + 5 * attack * .95 / 1.2, 6);
  }
});
it('烛煌三技能在灼燃锤首次引爆时发动熔点，并按补充弹药延长施放', () => {
  const input = { ...base, charId:'char_1040_blaze2', skillId:'skchr_blaze2_3', equips:['chess_item_4_05_e_a'] };
  const a = 708.2696629213483;
  const normal = 1.3 * a * .75 / 1.6;
  const skill = 2.15 * a * .75 / .3;
  const at = 18 + (2000 / .1 - 18 * normal) / skill;
  // 达阈值前本体恰好打出 20000 法伤。爆发 7000，与熔点 420%×精锐模组 110% 同时结算。
  const r = calculate({ ...input,durationSec:at + 1e-7 });
  expect(r.totalDamage.value).toBeCloseTo(20000 + 7000 + 2.15 * a * 4.2 * 1.1, 2);
  expect(r.elemental?.perSec).toBeCloseTo(skill * .1, 7);
  const window = r.skill!.dps * (23 * .3);
  const start = calculate({ ...input,durationSec:18 }).totalDamage.value;
  const end = calculate({ ...input,durationSec:18 + 23 * .3 }).totalDamage.value;
  expect(window).toBeCloseTo(end - start, 5);
});
