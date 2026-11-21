import { expect, it } from 'vitest';
import { frameInterval } from './stats.ts';
import { calculate } from './calc.ts';
import { artsFraction, damage } from './damage.ts';
import type { BondSetting, DamageComponent } from './types.ts';

const run = (charId:string, skillId:string, equips:string[] = [], bonds:BondSetting[] = [], durationSec=180) =>
  calculate({charId, skillId, tier:'b', bossId:'boss_1', modeId:'mode_single_10', cultivation:2060, potential:5, equips, bonds, durationSec});
const flag = 'chess_item_4_04_e_b';

it('荒芜拉普兰德的卡西米尔六人窗口以本体首开计时', () => {
  const delta = (time:number) => {
    const at = (n:number) => run('char_1038_whitw2','skchr_whitw2_3',['chess_item_6_03_e_a',flag],
      [{bondId:'kazimierzShip',activeChars:n,stacks:0}], time).totalDamage.value;
    return at(6)-at(3);
  };
  // 天赋使首开从 25 秒提前到 20 秒，30 秒窗口随之在第 50 秒关闭。
  expect(delta(50)).toBeGreaterThan(0);
  expect(delta(55)).toBeCloseTo(delta(50),7);
});

it('机械臂概率攻击分别择弱，灼燃只读取期望伤害中的法术部分', () => {
  const hit = damage({attack:1000, type:'physical', defense:280, resistance:25, weakness:{source:'机械臂'},
    proc:{probability:.3, scale:1.3, source:'概率加攻'}});
  expect(hit.perHit).toBe(831);
  const c = {damageType:hit.type, derivation:hit.derivation} as DamageComponent;
  expect(artsFraction(c)*hit.perHit).toBeCloseTo(.7 * 750,9);
});

it('斥罪锁技期间不回技，第二次开启恰在第 220 秒', () => {
  const at = (t:number) => run('char_4065_judge','skchr_judge_3',[],[],t).totalDamage.value;
  // 第一次 96 秒开技，126 秒结束。随后第 24 次受击在 128 + 23×4 = 220 秒。
  expect(at(220)-at(219.99)).toBeCloseTo(at(96)-at(95.99),7);
  expect(at(220.01)-at(220)).toBeCloseTo(at(96.01)-at(96),7);
  expect(at(220.01)-at(220)).toBeGreaterThan(10*(at(220)-at(219.99)));
});

it('竞技旗放大部署的瞬伤，限时增伤结束后逻各斯仍以处决阈值击杀', () => {
  const wang = (eq:string[]) => run('char_2027_wang','skchr_wang_3',eq,[],0).totalDamage.value;
  expect(wang([flag])).toBeCloseTo(wang([])*1.6,7);
  const logos = (eq:string[],t=180) => run('char_4133_logos','skchr_logos_1',eq,[],t);
  const naked = logos([]).killTimeSec, boosted = logos([flag]).killTimeSec;
  expect(boosted).toBeLessThan(naked);
  expect(logos([flag],boosted).totalDamage.value).toBeCloseTo(logos([],naked).totalDamage.value,3);
  expect(logos([flag],boosted).totalDamage.value).toBeLessThan(1_418_400);
});

it('忍冬瞬发技能的回技等待锁与追凶十秒到期可以同时推进', () => {
  const r = calculate({charId:'char_4026_vulpis',skillId:'skchr_vulpis_2',tier:'a',equips:[],
    bossId:'boss_1',modeId:'mode_single_10',bonds:[{bondId:'swiftShip',activeChars:2,stacks:300}],durationSec:180});
  expect(r.totalDamage.value).toBeGreaterThan(0);
  expect(Number.isFinite(r.totalDamage.value)).toBe(true);
});

it('星源 120 攻速时 2.3 秒间隔恰为 57.5 帧，四舍五入到 58 帧', () => {
  expect(frameInterval(2.3 / 1.2)).toBe(58 / 30);
});
