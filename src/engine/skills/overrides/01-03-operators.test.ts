import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type:'json' };
import { calculate } from '../../calc.ts';

// 裸装、无盟约、精锐默认等级。A 直接取干员原始属性；独立列出七级技能伤害倍率，Boss 胄防御 1000、法抗 25。
// 此处检验第一次施放的主伤害分项。持续技能的附伤、召唤物和多段另有专项断言。
const p = (attack:number, defense = 1000) => Math.max(attack * .05, attack - defense);
const m = (attack:number, resistance = 25) => attack * (1 - resistance / 100);
const expected: Record<string,(a:number) => number[]> = {
  mantra:a => [m(a * 2.75), m(a * 2.1), m(a * 3.1)],
  svash2:a => [0, p(a * 3.2), p(a * 1.7) * 1.25],
  shu:a => [0, 0, p(a * (1+.12+.34+.20))],
  sntlla:a => [m(a * (1+.15+.34)), m(a * 1.15 * .75)],
  slent2:() => [0, 0, 0],
  qiubai:a => [p(a), p(a * 1.9), m(a * 1.4)],
  brigid:a => [m(a * 1.1 * 1.15), m(a * 1.1 * 1.35)],
  // S2 在 34−6=28 秒开技，与胄第七次攻击同帧。先开技后受击，首层攻击力 +24%。
  pianst:a => [m(a * 1.5), m(a * 1.24)],
  kaitou:a => [m(a * 1.8), m(a)],
  ctrail:a => [p(a * 1.6 * 1.1), p(a * 1.6 * 1.1)],
  wildmn:a => [p(a),p(a * 1.6)],
  ghost:a => [p(a * 1.1 * 1.6),p(a * 1.1 * 2)],
  mlyss:a => [p(a * 1.35),p(a * 1.35),p(a * 1.35)],
  flamtl:a => [0,p(a * 2.1),p(a * 1.6)],
  demkni:() => [0,0,0],
  heyak:a => [m(a * 2.4,15),m(a * .35,15),m(a * 3.8,15)],
  gnosis:a => [m(a * 1.5) * 1.25,m(a * 1.6) * 1.25,m(a) * 1.25],
  hodrer:a => [p(a * 2 * 1.4),p(a * 1.28 * 1.4),p(a * 1.9 * 1.4)],
  kichi:a => [p(a * 1.6),p(a * 1.6 * 1.6)],
  udflow:a => [p(a * 1.39),p(a * 1.4)],
  mitm:a => [p(a * 3.55),p(a * 1.6)],
  glassb:a => [m(a),m(a * 1.3)],
  meteo:a => [p(a * 1.7,900),p(a * 2.4,690)],
  frncat:a => [m(a * 1.6),m(a * 1.45)],
  skadi2:a => [0,0,a * (1 + .15 + .08) * .55],
  closur:a => [p(a * 1.04 * 1.5),p(a * 1.59 * 1.5),p(a * 1.04 * 1.5 * 1.9)],
  acrbot:a => [p(a * (1 + 1.2 + 1.9))],
  ebnhlz:a => [m(a * .4),m(a * 2),m(a * 1.5)],
  aglina:a => [m(a * 1.8),m(a * .4),m(a * 2.05)],
  kjera:a => [m(a * 1.76),m(a * 1.56)],
  ethan:a => [p(a),p(a * 1.5)],
  aurora:a => [p(a),p(a * 1.6)],
  greyy2:a => [p(a * 1.34),m(a * 1.1)],
  podego:a => [0,m(a * 1.09 * .6)],
  swllow:a => [p(a * 1.25),p(a * 1.2)],
  frostl:a => [p(a * 1.35),p(a)],
};

for (const [suffix, hand] of Object.entries(expected)) {
  const operator = operators.find(o => o.charId.endsWith('_' + suffix))!;
  const hits = hand(operator.tiers.b.attributes.atk);
  for (const [i, skillId] of operator.skillIds.entries()) {
    it(operator.name + ' · ' + skillId + ' 单段伤害与180秒窗口', () => {
      const result = calculate({ charId:operator.charId, skillId, tier:'b', bossId:'boss_1', modeId:'mode_single_10', equips:[], bonds:[] });
      expect(result.model).toBe('override');
      expect((result.skill ?? result.normal).components[0]!.perHit).toBeCloseTo(hits[i]!,6);
      expect(Number.isFinite(result.totalDamage.value)).toBe(true);
      expect(result.totalDamage.value).toBeGreaterThanOrEqual(0);
    });
  }
}

it('霍尔海雅群星逶迤的九枚弹头全部命中同一 Boss', () => {
  const result = calculate({ charId:'char_4027_heyak', skillId:'skchr_heyak_2', tier:'b', bossId:'boss_1', modeId:'mode_single_10', equips:[], bonds:[] });
  expect(result.skill!.dps).toBeCloseTo(m(636.5955056179776 * .35,15) * 9 / 1.6,6);
});
it('淬羽赫默开两次无畏者协议后恢复普攻', () => {
  const result = calculate({ charId:'char_1031_slent2', skillId:'skchr_slent2_3', tier:'b', bossId:'boss_1', modeId:'mode_single_10', durationSec:300, equips:[], bonds:[] });
  // 三百秒内两次治疗各六十秒，剩余一百八十秒均可普攻。
  expect(result.totalDamage.value).toBeCloseTo(180 * m(485.03370786516854) / 1.6,6);
});

