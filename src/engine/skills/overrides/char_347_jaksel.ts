import { duel } from './single-boss.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';
import { swiftSucceeds } from '../../swift.ts';

// 闪避判定采用各来源独立乘算，成功后五秒限时攻速；S2 停止普攻，只有闪避反击产生伤害。
export const jakselOverride = duel(({ ctx, s, b, t, trait, attack, add }) => {
  const interval = bossAttackInterval(ctx.boss).interval;
  const event = Math.floor(ctx.elapsed / interval + 1e-8);
  const p = 1 - (1 - t(0, 'prob')) * (1 - trait('prob'));
  const evade = (index: number, probability: number) => index > 0 && swiftSucceeds(index - 1, probability, 1);
  const make = (active: boolean) => {
    const probability = active && s === 2 ? 1 - (1 - p) * (1 - b['jaksel_skill_2[evade].prob']) : p;
    const window = t(0, 'charge_atk_speed_on_evade.duration');
    let bonus = 0;
    for (let i = event; i > 0 && ctx.elapsed - i * interval < window; i--) if (evade(i, probability)) { bonus = t(0, 'charge_atk_speed_on_evade.attack_speed'); break; }
    const shot = attack(active, active && s === 2 ? 'none' : 'physical', { speed: bonus, scale: active && s === 1 ? b.atk_scale : 1 });
    return active && s === 2 && evade(event + 1, probability) ? add(shot, { label: '成功闪避反击', type: 'physical', scale: b['attack@atk_scale'],
      interval: Math.max(interval, shot.stats.attackInterval * b.base_attack_time) }) : shot;
  };
  const breakpoints = Array.from({ length: Math.ceil(180 / interval) }, (_, i) => [(i + 1) * interval, (i + 1) * interval + t(0, 'charge_atk_speed_on_evade.duration')]).flat();
  return { normal: make(false), skill: make(true), breakpoints,
    assumptions: ['Boss 每次普攻均视为可闪避的物理攻击，以固定序列逐次判定，反击伤害在对应攻击间隔连续结算；180 秒后的击杀估时沿用窗口末段。'] };
});