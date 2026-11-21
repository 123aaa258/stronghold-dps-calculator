import { operatorAttack, instant } from './operator-attack.ts';
import { necrosisProfile } from '../../effects/elemental.ts';
import { damage } from '../../damage.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
import { swiftSucceeds } from '../../swift.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const mantraOverride = operatorAttack('arts', ({ ctx, n, b, trait, talent, hit, add, notes }) => {
  const normal = hit(false);
  const interval = ctx.tier.attributes.baseAttackTime + (b.base_attack_time ?? 0);
  const opts = { interval, atk:b.atk, scale:n === 3 ? 1 : b['attack@atk_scale'] ?? b.atk_scale ?? 1 };
  const skill = hit(true,opts), moduleScale = trait.damage_scale ?? 1;
  const normalBurst = hit(false,{ scale:moduleScale });
  const skillBurst = add(hit(true,{ ...opts, scale:opts.scale * moduleScale }),true,'爆发期元素附伤',
    { ...opts, type:'elemental', scale:(b['attack@element_atk_scale'] ?? b.element_atk_scale ?? 0) * moduleScale });
  const ratio = b['attack@ep_damage_ratio'] ?? b.ep_damage_ratio ?? 0;
  const profile = necrosisProfile(ctx.boss);
  const immune = ctx.boss.attributes?.immunities.palsyImmune;
  const enemyInterval = bossAttackInterval(ctx.boss).interval;
  const hitTalent = (active:boolean, burst:boolean) => hit(active,{ atk:active ? b.atk : 0, type:'elemental',
    scale:(talent(0).atk_scale ?? 0) * (burst ? moduleScale : 1), ownerActions:0 }).components[0]!.perHit;
  const hits = [hitTalent(false,false),hitTalent(true,false),hitTalent(false,true),hitTalent(true,true)];
  const overflow = n === 3 ? hit(true,{ atk:b.atk, type:'elemental', scale:b.atk_scale, ownerActions:0 }).components[0]!.perHit : 0;
  notes.push('默认 Boss 自最近入口登场并按其普通攻击间隔触发麻痹，未计抵抗自然衰减或友方其他技能；神经损伤按直接法伤速率积累，爆发立即结算 6000 元素伤害、锁条 10 秒（PRTS 元素）。');
  return { ...(n === 1 ? instant(normal,skill,true) : { normal, skill }), sequence:{
    element:{ ...profile, duration:10, burstDamage:damage({ attack:6000,type:'elemental',target:ctx.boss,epDamageResistance:ctx.boss.attributes?.epDamageResistance }).perHit,
      rate:(p,s) => s.active ? p.components[0]!.dps * ratio : 0 },
    select:s => s.active ? s.elementActive ? skillBurst : skill : s.elementActive ? normalBurst : normal,
    castDamage:s => {
      if (immune || n !== 3) return 0;
      const count = (s.counters.palsy ?? 1) + b.per_active!;
      s.counters.palsy = Math.min(2,count);
      return Math.max(0,count - 2) * overflow;
    },
    onElement:s => { if (!immune) s.counters.palsy = 3; },
    pulse:s => ({ at:!immune && (s.counters.palsy ?? 1) > 0 ? (Math.floor((s.time + 1e-8) / enemyInterval) + 1) * enemyInterval : Infinity,
      damage:hits[+s.active + 2 * +s.elementActive]! }),
    afterPulse:s => {
      const count = s.counters.draw ?? 0;
      if (!swiftSucceeds(count,talent(0).prob ?? 0,1)) s.counters.palsy = (s.counters.palsy ?? 1) - 1;
      s.counters.draw = count + 1;
    },
  } };
});
