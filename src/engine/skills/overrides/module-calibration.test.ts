import { expect, it } from 'vitest';
import operators from '../../../data/generated/operators.json';
import skills from '../../../data/generated/skills.json';
import bosses from '../../../data/generated/bosses.json';
import type { OperatorData, SkillData, BossData } from '../../types.ts';
import { generic } from '../generic.ts';
import { override } from './char_4098_vvana.ts';
import { baseTalents, applyPart } from '../../../../tools/extract/operators.ts';

it('薇薇安娜三级 D 模对领袖逐击积累灼燃，爆发后的下一击吃减抗与元素附伤', () => {
  const op=(operators as unknown as OperatorData[]).find(o=>o.name==='薇薇安娜')!;
  const boss=(bosses as BossData[])[0]!;
  const tier=structuredClone(op.tiers.b);
  tier.talents[0]!.blackboard.nums.ep_damage_ratio_m=.09;
  tier.trait!.blackboard.nums={ep_damage_ratio:.15};
  const skill=(skills as unknown as Record<string,SkillData>)[op.skillIds[0]!]!;
  const level={...skill.levels['7']!,spCost:1e6,initSp:0};
  const model=override({operator:op,tier,skill,level,boss},generic(op,tier,skill,level,boss))!;
  const at=(seconds:number)=>model.customTimeline!(seconds,Infinity).totalDamage;
  const a=tier.attributes.atk, hit=a*.75*1.16, interval=38/30;
  const n=Math.ceil(2000/(hit*.18));
  expect(at(n*interval)).toBeCloseTo(n*hit+7000,7);
  expect(at((n+1)*interval)-at(n*interval)).toBeCloseTo(a*.95*1.16 + .15*a,7);
});

it('隐藏的回血部件和可见天赋共用索引仍保留各自的黑板', () => {
  const op=(operators as unknown as OperatorData[]).find(o=>o.name==='水月')!;
  const state={...op.tiers.b,uniEquipId:'uniequip_003_mizuki'};
  const condition={phase:'PHASE_2',level:1};
  const passive={unlockCondition:condition,requiredPotentialRank:0,prefabKey:'1',name:'创伤性癔症',
    blackboard:[{key:'atk_scale',value:.5,valueStr:null}]};
  const data=baseTalents({trait:null,talents:[{candidates:[passive]}],description:''} as Parameters<typeof baseTalents>[0],state);
  const hidden={...passive,name:null,talentIndex:0,isHideTalent:true,prefabKey:'10',blackboard:[{key:'hp_ratio',value:.1,valueStr:null}]};
  applyPart(data,{target:'TALENT',addOrOverrideTalentDataBundle:{candidates:[hidden]}} as Parameters<typeof applyPart>[1],state,new Set());
  expect(data.talents.map(t=>t.blackboard.nums)).toEqual([{atk_scale:.5},{hp_ratio:.1}]);
});
