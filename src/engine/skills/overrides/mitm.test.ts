import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';
import operators from '../../../data/generated/operators.json' with {type:'json'};
import bosses from '../../../data/generated/bosses.json' with {type:'json'};
import skills from '../../../data/generated/skills.json' with {type:'json'};
import type { ChessTier, OperatorData, SkillData, BossData, SkillLevelData } from '../../types.ts';
import { timeline } from '../../timeline.ts';
import { generic } from '../generic.ts';
import { mitmOverride } from './char_4147_mitm.ts';

const phys=(a:number,d=1000)=>Math.max(a-d,a*.05);
const target=(tier:ChessTier,slot:number,durationSec:number,bossId='boss_1',bossMechanics?:Record<string,boolean>)=>calculate({
  charId:'char_4147_mitm',tier,skillId:'skchr_mitm_'+slot,bossId,modeId:'mode_single_10',durationSec,bossMechanics,bonds:[],equips:[],
}).totalDamage.value;

function curve(slot:number,bossId:string,targetHp:number,overrides:Partial<SkillLevelData>={}) {
  const operator=(operators as unknown as OperatorData[]).find(o=>o.name==='渡桥')!,tier=operator.tiers.b;
  const boss=(bosses as unknown as BossData[]).find(o=>o.bossId===bossId)!;
  const skill=(skills as unknown as Record<string,SkillData>)[operator.skillIds[slot-1]!]!;
  const level={...skill.levels['7'],...overrides} as SkillLevelData;
  const base=generic(operator,tier,skill,level,boss);
  return timeline(mitmOverride({operator,tier,skill,level,boss,targetHp},base),level,40,Infinity).at!;
}

it.each([
  ['a',390.7971014492754,246.72463768115944,58,7,3.2,71,.45],
  ['b',491.5189873417722,304.3291139240506,55,8,3.55,68,.6],
] as const)('渡桥%s阶对不可阻挡的胄逐击核算两技能180秒', (tier,a,c,car1,casts,explosion,car2,buff)=>{
  expect(target(tier,1,180)).toBeCloseTo(180*phys(a)+car1*phys(c)+casts*phys(a*explosion),7);
  expect(target(tier,2,180)).toBeCloseTo(135*phys(a)+45*phys(a*(1+buff))+car2*phys(c),7);
});

it('鳍被小车阻挡时只强化本体普攻，自毁后失去强化，真车刷新后恢复',()=>{
  const a=491.5189873417722,d=600;
  const at=(t:number)=>target('b',1,t,'boss_13');
  expect(at(1.01)-at(.99)).toBeCloseTo(phys(a*1.65,d),7);
  expect(at(17.01)-at(16.99)).toBeCloseTo(phys(a*3.55,d)+phys(a,d),7);
  expect(at(18.01)-at(17.99)).toBeCloseTo(phys(a,d),7);
  expect(at(32.01)-at(31.99)).toBeCloseTo(phys(a*1.65,d),7);
  const notBlocked=target('b',1,1.01,'boss_13',{unblocked_shield:true});
  expect(notBlocked).toBeCloseTo(phys(a,d)*.6,7);
});

it('矩兽的初始占用为2挡，只有真车开启二技能才够挡',()=>{
  const a=491.5189873417722;
  const at=(t:number)=>target('b',2,t,'boss_17',{might:false});
  expect(at(1.01)-at(.99)).toBeCloseTo(phys(a),7);
  expect(at(27.01)-at(26.99)).toBeCloseTo(phys(a*1.6*1.65),7);
  const low=curve(2,'boss_17',1);
  expect(low(27.01)-low(26.99)).toBeCloseTo(phys(a*1.6),7);
});

it('残骸期间再次施放一技能不产生爆炸，也不推迟真车刷新',()=>{
  const at=curve(1,'boss_1',Infinity,{spCost:5,initSp:0});
  const a=491.5189873417722;
  expect(at(5.01)-at(4.99)).toBeCloseTo(phys(a*3.55)+phys(a),7);
  expect(at(10.01)-at(9.99)).toBeCloseTo(phys(a),7);
  expect(at(20.01)-at(19.99)).toBeCloseTo(phys(a*3.55)+phys(a),7);
});

