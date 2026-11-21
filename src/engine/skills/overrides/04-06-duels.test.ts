import { describe, expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with { type: 'json' };
import skills from '../../../data/generated/skills.json' with { type: 'json' };
import bosses from '../../../data/generated/bosses.json' with { type: 'json' };
import { calculate } from '../../calc.ts';
import { applyGarrisons } from '../../effects/garrisons.ts';
import { battleEffects } from '../../effects/common.ts';
import { generic } from '../generic.ts';
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { batch as fourth } from './batches/b04.ts';
import { batch as fifth } from './batches/b05.ts';
import { batch as sixth } from './batches/b06.ts';

const registry = { ...fourth, ...fifth, ...sixth };
const roster = operators as unknown as OperatorData[];
const skillTable = skills as unknown as Record<string, SkillData>;
const boss = (bosses as BossData[]).find(x => x.bossId === 'boss_1')!;
// 胄的防御 1000、法抗 25。倍率在扣防前乘，每段物理伤害各自享有 5% 保底。
const p = (value: number, armor = 1000) => Math.max(value * .05, value - armor);
const m = (value: number) => value * .75;
it('独立爆破和连击按各自命中时刻结算', () => {
  const at=(charId:string, skillId:string, durationSec:number)=>calculate({
    charId,skillId,durationSec,tier:'b',bossId:'boss_1',modeId:'mode_single_10',equips:[],bonds:[],
  }).totalDamage.value;
  const jump=(id:string,skill:string,time:number)=>at(id,skill,time+1e-6)-at(id,skill,time-1e-6);
  // D12 第22秒挂弹，第25秒引爆。目标免疫晕眩，阻挡攻击倍率1.1。
  expect(jump('char_113_cqbw','skchr_cqbw_3',22)).toBeCloseTo(0,7);
  expect(jump('char_113_cqbw','skchr_cqbw_3',25)).toBeCloseTo(p(898.2471910112359*1.1*2.8),7);
  // 怒潮凛冬第17秒第一锤，后续每1.8秒提升0.3A。第三锤系数为1+.28+.8+.6。
  expect(jump('char_1051_headb2','skchr_headb2_3',20.6)).toBeCloseTo(p(1256.9101123595506*2.68*2.1),7);
  // 艾丽妮由14次普通攻击就绪，每次1.1秒。第一次轰击在开技0.3秒后。
  const first=14*1.1;
  expect(at('char_4009_irene','skchr_irene_3',first+.29)).toBeCloseTo(at('char_4009_irene','skchr_irene_3',first+.01),7);
  expect(jump('char_4009_irene','skchr_irene_3',first+.3)).toBeGreaterThan(0);
  // 第14次普攻的两段只用于回技。在后续11个穿甲判定中，初击与五次轰击成功，另五次轰击失败。
  const irene=calculate({charId:'char_4009_irene',skillId:'skchr_irene_3',tier:'b',bossId:'boss_1',modeId:'mode_single_10',equips:[],bonds:[]});
  const a=624.8202247191011;
  expect(irene.skill!.dps).toBeCloseTo((p(2.5*a,465)+5*p(2.3*a,465)+5*p(2.3*a,930))/3.5,7);
});
it('老鲤首个标记满五秒时按八次真实命中爆炸', () => {
  const input={charId:'char_322_lmlee',skillId:'skchr_lmlee_2',tier:'b' as const,bossId:'boss_1',modeId:'mode_single_10',equips:[],bonds:[]};
  const before=calculate({...input,durationSec:15-1e-5}),after=calculate({...input,durationSec:15});
  const attack=roster.find(op=>op.charId===input.charId)!.tiers.b.attributes.atk;
  // 10秒开技同帧打出一发，10至15秒之间共八发；第15秒只有符咒爆炸。
  expect(after.totalDamage.value-before.totalDamage.value).toBeCloseTo(m(attack*(2.6+8*.15)),7);
});
it('斯卡蒂三种技能只在装备阻挡强化模组时应用115%倍率', () => {
  const input = { charId:'char_263_skadi', tier:'b' as const, bossId:'boss_1', modeId:'mode_single_10', bonds:[], equips:[] };
  for(const skillId of roster.find(op => op.charId === input.charId)!.skillIds) {
    for(const [uniEquipId, scale] of [['uniequip_002_skadi',1],['uniequip_003_skadi',1.15]] as const) {
      const r=calculate({...input, skillId, uniEquipId});
      for(const panel of [r.normal,r.skill!]) expect(panel.components[0]!.perHit).toBeCloseTo(p(panel.stats.atk*scale),6);
    }
  }
});
type Part = [value: number, label?: string, count?: number];
const formulas: Record<string, (a: number, def: number) => Part[]> = {
  phatm2: a => [[m(1.2*a), undefined, 2], [m(a)], [m(1.95*a)]],
  rosmon: a => [[m(1.08*a*1.2), '思维膨大法伤'], [p(1.38*a*.5,840),'余震',4], [p(1.48*a,680)]],
  siege2: a => [[1.10*a*1.2,'重铸晖光'], [m(2.6*a)], [2.75*a]],
  veen: a => [[m(90),'战争技艺'], [m(90),'战争技艺'], [m(90),'战争技艺']],
  ironmn: a => [[p(a*(1+.12*3)*1.7)], [p(1.4*a)], [p(1.4*a)]],
  // 天赋固定序列的首次判定大于 25%，未暴击。单元与本体分开过抗。
  malist: a => [[m(1.34*a)], [m(1.6*a),undefined,2]],
  kazema: a => [[p(2.75*a)], [p(1.9*a)]],
  blemsh: a => [[p(2.2*a)], [p(1.7*a)], [m(1.8*a*.7),'先贤化身法伤']],
  bluep: a => [[p(1.55*a)], [m(75),'神经毒素']],
  snakek: a => [[p(a)], [0]],
  skgoat: a => [[m(1.5*a)], [0]],
  leto: a => [[p(1.34*a)], [p(1.8*a)]],
  cetsyr: a => [[0], [2.6*1.08*a,'微尘碰撞'], [0]],
  // 打字机相邻，当前有效防御为 1000×(1−23%)。
  bgsnow: a => [[p(1.5*a,770)], [p(2*a,770),undefined,3], [p(2.15*a,770)]],
  headb2: a => [[p(1.67*a)], [p(2.03*a)], [p(2.08*a*2.1)]],
  pasngr: a => [[m(1.08*a*2.1)*1.2], [m(1.28*a)*1.2], [m(1.08*a*1.3)*1.2,'雷暴额外攻击']],
  jesca2: a => [[p(1.55*a)], [p(1.6*a)], [p(3.7*a*2.5),'机动盾牌炮弹']],
  billro: a => [[m(1.4*a)], [m(a)], [m(a)]],
  hbound: a => [[m(.6*a),'炼金单元'], [m(1.5*a),'重目标额外法伤']],
  skadi: a => [[p(1.48*a)], [p(2.34*a)], [p(2.14*a)]],
  cuttle: a => [[p(1.6*a)*1.15], [p(2.9*a)*1.15]],
  bubble: (a,def) => [[p(a)], [p(def*(1+.85+.2)*.4),'尖刺反伤']],
  quercu: () => [[0],[0]],
  // 杰克的卫戍特质取物理和法术较高值。第一记技能攻的攻击力为 2.1A。
  jaksel: a => [[Math.max(p(2.1*a),m(2.1*a))], [0]],
  haruka: a => [[0], [m(a*.75*2),'治疗溅射'], [0]],
  lmlee: a => [[p(1.4*a)], [m(a*(2.6+.15*7)),'符咒爆炸'], [p(1.37*a)]],
  irene: a => [[p(1.6*a,930)], [p(3.4*a,930)], [p(2.5*a,930)]],
  cqbw: a => [[p(a*1.1*3.1)], [p(a*1.1*2.5)], [p(a*1.1*2.8)]],
  yu: a => [[m(.4*a),'礼尚往来'], [m(3*a),'厚礼上宾开启'], [m(1.8*a*.4),'礼尚往来']],
  fang2: a => [[p(1.5*a),undefined,2], [p(1.95*a)]],
  nothin: a => [[p(a)], [p(1.4*a)]],
  highmo: a => [[p(1.35*a),undefined,2], [p(1.5*a)]],
  aosta: a => [[p(1.34*a*1.6)], [p(1.5*a*1.6)]],
  astesi: a => [[m(1.4*a)*1.1], [m(1.6*a)*1.1]],
  yak: a => [[p(a)], [p(a)]],
  varkis: a => [[p(1.1*a*1.2),undefined,3], [p(1.1*a*1.75)]],
};

for (const [charId, override] of Object.entries(registry)) {
  const operator = roster.find(op => op.charId === charId)!;
  const tier = operator.tiers.b;
  const expected = formulas[charId.split('_').at(-1)!](tier.attributes.atk, tier.attributes.def);
  describe(operator.name, () => {
    it.each(operator.skillIds.map((id,i) => [id,i] as const))('%s 的裸装技能单段与两阶时间过程', (skillId,index) => {
      const skill = skillTable[skillId], level = skill.levels[tier.skillLevel], effects = battleEffects();
      applyGarrisons(effects, tier.garrisonIds, []);
      const model = override({ operator, tier, skill, level, boss }, generic(operator,tier,skill,level,boss,effects));
      const [value,label,count] = expected[index];
      const component = label ? model.skill!.components.find(c => c.label === label)! : model.skill!.components[0]!;
      expect(component.perHit).toBeCloseTo(value, 6);
      if (count !== undefined) expect(component.hitsPerAttack).toBeCloseTo(count, 6);
      for (const tierKey of ['a','b'] as const) {
        const result = calculate({ charId, tier: tierKey, skillId, bossId: 'boss_1', modeId: 'mode_single_10', bonds: [], equips: [] });
        expect(result.model).toBe('override');
        expect(result.totalDamage.durationSec).toBe(180);
        expect(Number.isFinite(result.totalDamage.value)).toBe(true);
        expect(result.totalDamage.value).toBeGreaterThanOrEqual(0);
      }
    });
  });
}
