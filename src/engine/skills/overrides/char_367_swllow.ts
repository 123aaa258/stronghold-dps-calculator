import { operatorAttack, instant } from './operator-attack.ts';
import { swiftSucceeds } from '../../swift.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const swllowOverride = operatorAttack('physical', ({ ctx, b, n, talent, hit, notes }) => {
  const t = talent(0);
  const speed = (t.attack_speed ?? 0) + (ctx.tier.talents.find(t => t.index < 0 && t.blackboard.nums.attack_speed)?.blackboard.nums.attack_speed ?? 0);
  const hits = n === 1 ? 2 : 3;
  const normal = [false,true].map(crit => hit(false,{ speed,scale:crit ? t.atk_scale : 1 }));
  const skill = Array.from({length:hits+1}, (_,k) => {
    const opts = { speed, atk:b.atk, scale:n === 1 ? b.atk_scale! : 1 };
    const base = hit(true,{ ...opts,hits:hits-k, ownerActions:k === hits ? 0 : 1 });
    if (!k) return base;
    const critical = hit(true,{ ...opts, scale:opts.scale * (t.atk_scale ?? 1), hits:k, ownerActions:k === hits ? 1 : 0 });
    return { ...base, components:[...base.components,...critical.components], dps:base.dps + critical.dps };
  });
  notes.push('每发弹丸独立按固定序列判定天赋暴击，多连射属于一次本体攻击动作。');
  return { ...(n === 1 ? instant(normal[0]!,skill[0]!,true) : { normal:normal[0]!,skill:skill[0]! }), sequence:{select:s => {
    if (!s.active) return normal[+swiftSucceeds(s.attacks, t.prob ?? 0,1)]!;
    let crit = 0;
    for (let k=0; k<hits; k++) if (swiftSucceeds(s.attacks * hits + k,t.prob ?? 0,1)) crit++;
    return skill[crit]!;
  }} };
});
