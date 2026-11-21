import { skillPulse } from './attack-sequence.ts';
import { operatorAttack, instant } from './operator-attack.ts';

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const greyy2Override = operatorAttack('physical', ({ ctx, n, b, trait, hit, add, notes }) => {
  const build = (active:boolean) => {
    const opts = { atk:active ? b.atk : 0, speed:active ? b.attack_speed : 0 };
    return add(hit(active,opts),active,'地面余震',{ ...opts, scale:trait['attack@append_atk_scale'] ?? 0.5,
      hits:1 + (trait['attack@enable_third_attack'] ?? 0) });
  };
  const normal = build(false);
  if (n === 1) return { normal, skill:build(true) };
  notes.push('雷电球固定在静止 Boss 的脚下，首跳在一个黑板 interval 后，最后一跳不得超过存在时长。');
  const orb = hit(true,{ type:'arts', scale:b.atk_scale, ownerActions:0 });
  return { ...instant(normal,orb), burst:false, duration:0, sequence:{
    pulse:s => skillPulse(s,b.interval!,b.projectile_delay_time!,orb.components[0]!.perHit,true),
  } };
});
