import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json' with {type:'json'};
import allSkills from '../../../data/generated/skills.json' with {type:'json'};
import bosses from '../../../data/generated/bosses.json' with {type:'json'};
import { calculate } from '../../calc.ts';
import { battleEffects } from '../../effects/common.ts';
import { generic } from '../generic.ts';
import type { OperatorData, BossData, SkillData } from '../../types.ts';
import { override } from './char_4231_clemnt.ts';

const charId='char_4231_clemnt', A=867.0786516853932;
const input={charId,bossId:'boss_1',modeId:'mode_single_10',bonds:[],equips:[]};
const run=(slot:number,seconds:number)=>calculate({...input,tier:'b',skillId:'skchr_clemnt_'+slot,durationSec:seconds});
const jump=(slot:number, time:number)=>run(slot,time+1e-5).totalDamage.value-run(slot,time-1e-5).totalDamage.value;

// 独立逐帧重算使用胄1000防御、2000阈值、8秒锁条；各类伤害小计列于 operators-07-09.md。
it.each([
  [1,71105.1625,126480.16151685],
  [2,296520.3875,394366.84129213],
  [3,217750.5675,379773.25730337],
])('技能%i两阶180秒完整轨迹', (slot,ordinary,elite)=>{
  for(const [tier,expected] of [['a',ordinary],['b',elite]] as const){
    const r=calculate({...input,tier,skillId:'skchr_clemnt_'+slot});
    expect(r.totalDamage.value).toBeCloseTo(expected,5);
  }
});

it('强化攻击按结算后的伤害积条，普通攻击与侵蚀损伤本身不额外扣血',()=>{
  expect(jump(1,33.6)).toBeCloseTo(5000+A*2.25*1.35-1000,6);
  const r=calculate({...input,tier:'b',skillId:'skchr_clemnt_1',equips:['chess_item_5_01_e_a']});
  const [primary,erosion]=r.skill!.components;
  expect(primary!.damageType).toBe('arts');
  expect(erosion!.countsTowardDps).toBe(false);
  expect(erosion!.perHit).toBeCloseTo(primary!.perHit*.3,7);
});

it('放逐舱无碰撞伤害，落点后一秒漩涡才打第一跳；第十跳达到领袖阈值',()=>{
  expect(jump(2,8)).toBeCloseTo(0,7);
  expect(jump(2,9.5)).toBeCloseTo(0,7);
  expect(jump(2,10.1)).toBeCloseTo(A*2.3*1.35-1000,7);
  expect(jump(2,10.5)).toBeCloseTo(A*2.85-1000,7);
  expect(jump(2,19.5)).toBeCloseTo(5000+A*2.85-1000,7);
});

it('实际爆条耗弹，永久减防先于舰炮；最后一轮舰炮在回技期继续命中',()=>{
  expect(jump(3,30)).toBeCloseTo(5000+A*2-1000,6);
  expect(jump(3,31)).toBeCloseTo(A*2.7-880+A*2,6);
  expect(jump(3,32)).toBeCloseTo(A*2.7*1.35-880+A*2,6);
  expect(jump(3,33)).toBeCloseTo(A*2.7*1.35-880+A*2,6);
  const r=run(3,180);
  expect(r.cycle!.skillDurationSec).toBeCloseTo(169.2-17,6);
  expect(r.cycle!.spRecoverSec).toBeCloseTo(45,6);
  expect(jump(3,170.2)).toBeCloseTo(A*2.7*1.35+A*2,6);
  expect(jump(3,171.2)).toBeCloseTo(A*2.7+A*2,6);
  expect(jump(3,172.2)).toBeCloseTo(A*2.7+A*2,6);
});

it('零技力回复和完全抵抗积累时都能在无限生命目标上结束查询',()=>{
  const operator=(operators as unknown as OperatorData[]).find(o=>o.charId===charId)!;
  const tier=operator.tiers.b, skill=(allSkills as unknown as Record<string,SkillData>).skchr_clemnt_3!;
  const level=skill.levels[tier.skillLevel]!, original=(bosses as unknown as BossData[])[0]!;
  for(const rate of [0,1]){
    const boss={...original,attributes:{...original.attributes!,epResistance:100}};
    const effects=battleEffects();
    effects.spRecovery=rate-1;
    const model=override({operator,tier,skill,level,boss},generic(operator,tier,skill,level,boss,effects));
    const result=model.customTimeline!(180,Infinity);
    expect(Number.isFinite(result.totalDamage)).toBe(true);
    expect(result.killTimeSec).toBe(Infinity);
    if(rate)expect(result.firstSkill!.start).toBeCloseTo(17,8);
    else expect(result.firstSkill!.start).toBe(Infinity);
    expect(result.firstSkill!.end).toBe(Infinity);
  }
});

it('八秒锁条中不预存损伤，元素抗性只减少实际扣血',()=>{
  const operator=(operators as unknown as OperatorData[]).find(o=>o.charId===charId)!;
  const original=operator.tiers.b;
  const tier={...original,attributes:{...original.attributes,atk:10000},talents:original.talents.map(t=>({...t,
    blackboard:{...t.blackboard,nums:{...t.blackboard.nums,prob_normal:0,prob_special:0}}}))};
  const skill=(allSkills as unknown as Record<string,SkillData>).skchr_clemnt_3!;
  const level={...skill.levels[tier.skillLevel]!,initSp:45};
  const source=(bosses as unknown as BossData[])[0]!;
  const boss={...source,attributes:{...source.attributes!,def:0,epResistance:50,epDamageResistance:80}};
  const model=override({operator,tier,skill,level,boss},generic(operator,tier,skill,level,boss,battleEffects()));
  const curve=model.customTimeline!(180,Infinity).at!;
  const delta=(t:number)=>curve(t+1e-6)-curve(t-1e-6);
  // 20000物伤×20%×(1−50%)正好满领袖条；5000元素伤害×(1−80%)只扣1000生命。
  expect(delta(1.2)).toBeCloseTo(21000,5);
  expect(delta(2.4)).toBeCloseTo(20000,5);
  expect(delta(8.4)).toBeCloseTo(20000,5);
  expect(delta(9.6)).toBeCloseTo(21000,5);
});
