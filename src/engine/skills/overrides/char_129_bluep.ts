import { duel } from './single-boss.ts';

// 神经毒素是固定值法伤；模组对范围中的地面目标提供攻速。
export const bluepOverride = duel(({ s, b, t, attack, add }) => {
  const speed = t(1, 'attack_speed');
  const make = (active: boolean) => add(attack(active, 'physical', { speed, atk: active ? b.atk : 0,
    scale: active && s === 1 ? b.atk_scale : 1, hits: active && s === 2 ? b['attack@times'] : 1 }),
    { label: '神经毒素', type: 'arts', flat: t(0, 'poison_damage'), interval: 1, independent: true });
  return { normal: make(false), skill: make(true), assumptions: ['蓝毒持续攻击地面 Boss，中毒按刷新覆盖，每秒结算一次；额外目标不重复攻击同一 Boss。'] };
});