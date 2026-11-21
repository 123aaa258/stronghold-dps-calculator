import { operatorAttack, instant } from './operator-attack.ts';
import type { AttackClock } from './attack-sequence.ts';
import { actionDamage } from './shared.ts';
import { hpSwitch } from './hp-switch.ts';
import type { SkillOverride } from './index.ts';
import tokens from '../../../data/generated/tokens.json' with { type:'json' };
import { resolveTokenTier } from '../../operator-state.ts';
import type { TokenData } from '../../types.ts';

// PRTS「卫戍协议·规程/PRTS盟约记录」「假想敌：鳍」「假想敌：铳」及各敌人页。
// 胄、管、械、茧、昆图斯、阿利斯泰尔和萨米不能阻挡。铳的实际冲锋路径和时长没有输入，按不取阻挡奖励。
// 矩兽在协议关卡占2挡，半血后再加1挡。切换「移动明力」或「未阻挡护盾」时亦不取阻挡奖励。
const rotation = (belowHalf:boolean) => operatorAttack('physical', ({ ctx, n, b, trait, blocked, hit, token, notes }) => {
  const data = tokens.token_10037_mitm_trshrb as unknown as TokenData;
  const car = resolveTokenTier(data, ctx.operator, ctx.tier)!;
  const talent = car.talents![0]!.blackboard.nums;
  const id = ctx.boss.bossId;
  const cost = id === 'boss_13' || id === 'boss_16' ? 1 : id === 'boss_17' ? 2 + Number(belowHalf) : Infinity;
  const capacity = car.attributes.blockCnt + talent.block_cnt!;
  const scale = (blocks:number) => blocked && blocks >= cost ? trait.atk_scale ?? 1 : 1;
  const body = hit(false), carPresent = token(hit(false,{scale:scale(capacity)}),data,'physical');
  const carHit = carPresent.components.find(c => c.source === 'token:'+data.tokenId)!;
  const interval = 1/carHit.hitsPerSec;
  const active = n === 1 ? hit(true,{scale:b.aoe_damage_scale,ownerActions:0})
    : hit(true,{atk:b.atk,scale:scale(capacity+b.block_cnt_display!)});
  const withoutCar = n === 1 ? hit(true,{type:'none',ownerActions:0}) : hit(true,{atk:b.atk});
  const present = (st:AttackClock) => st.time >= (st.counters.readyAt ?? 0) - 1e-8;
  function destroy(st:AttackClock) {
    if (present(st)) {
      st.counters.readyAt = st.time + talent.interval!;
      st.counters.carShot = st.counters.readyAt + interval;
    }
    return 0;
  }
  notes.push('樱桃三号从部署开始攻击，S1自毁时按渡桥攻击力独立爆炸，S2小车停攻但仍可阻挡，结束后自毁。残骸按本场设定不攻击、不阻挡。假定Boss在车旁，没有提前击毁。');
  if(id==='boss_2'||id==='boss_9') notes.push('铳初始形态可阻挡、冲锋状态不可阻挡。没有冲锋目标和路径，按全程不取小车阻挡增伤的下限。');
  else if(id==='boss_17') notes.push('矩兽满血占2挡，降至半血后占3挡；小车普通1挡，二技能时2挡。');
  else notes.push(cost===1 ? '鳍在小车存活、接触目标且未选择未阻挡护盾时，由小车阻挡。' : '目标没有已证实的小车阻挡条件，渡桥不取攻击援军阻挡目标的倍率。');
  const model = n === 1 ? {...instant(carPresent,active),burstAttack:false} : {normal:carPresent,skill:active};
  return {...model, sequence:{
    discreteAttacks:true,
    select:st => st.active ? present(st) ? active : withoutCar : present(st) ? carPresent : body,
    next:st => present(st) ? Infinity : st.counters.readyAt!,
    // 本体普通攻击按自身动作扣血，车由独立攻击时钟结算，绝不重复计作本体普攻。
    shot:(_st,p) => {
      const components = p.components.filter(c=>!c.source.startsWith('token:'));
      return {damage:actionDamage({...p,components}),
        hits:components.filter(c=>c.countsTowardDps&&!c.source.startsWith('bond:')&&!c.source.startsWith('equip:')).reduce((v,c)=>v+c.hitsPerAttack,0)};
    },
    pulse:st => ({at:st.active ? Infinity : st.counters.carShot??interval, damage:carHit.perHit, hits:1}),
    afterPulse:st => {st.counters.carShot=st.time+interval;},
    endDamage:destroy,
  }};
});
const ordinary = rotation(false), switchAtHalf = hpSwitch(ordinary,rotation(true),.5);
export const mitmOverride:SkillOverride = (ctx,base) => ctx.boss.bossId==='boss_17' && ctx.skill.skillId.endsWith('_2')
  ? switchAtHalf(ctx,base) : ordinary(ctx,base);
