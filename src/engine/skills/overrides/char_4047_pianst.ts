import { operatorAttack } from './operator-attack.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const pianstOverride = operatorAttack('physical', ({ ctx, b, n, trait, hit, add, notes }) => {
  const bossInterval = bossAttackInterval(ctx.boss).interval;
  notes.push('默认 Boss 按普攻间隔攻击车尔尼；缺少普攻伤害类型时，仅结算不限定受击类型的模组附伤。');
  const attack = (active:boolean, atk:number) => {
    let p = hit(active, { atk, type:active ? 'arts' : 'physical' });
    if (trait.atk_scale) {
      p = add(p, active, '攻击附伤', { atk, type:'arts', scale:trait.atk_scale });
      p = add(p, active, '受击附伤', { atk, type:'arts', scale:trait.atk_scale, fixedInterval:bossInterval });
    }
    return p;
  };
  const normal = attack(false, 0);
  if (n === 1) return { normal, skill:attack(true, b.atk!) };
  notes.push('曲惊四座按 Boss 自部署起的受击时钟叠攻；同一时刻先开技再受击，结束时按已受击层数一次结算。');
  const stages = Array.from({ length:b.max_stack_cnt! + 1 }, (_, k) => attack(true, k * b.atk!));
  const finishers = stages.map((_, k) => hit(true, { type:'arts', atk:k * b.atk!, scale:b.atk_scale }).components[0]!.perHit);
  const layers = (time:number, start:number) => Math.min(b.max_stack_cnt!, Math.max(0,
    Math.floor(time / bossInterval + 1e-8) - Math.max(1, Math.ceil(start / bossInterval - 1e-8)) + 1));
  return { normal, skill:stages[0]!, sequence:{
    select:state => state.active ? stages[layers(state.time,state.lastCast)]! : normal,
    next:state => state.active ? (Math.floor(state.time / bossInterval + 1e-8) + 1) * bossInterval : Infinity,
    endDamage:state => finishers[layers(state.time - 1e-6,state.lastCast)]!
  } };
});
