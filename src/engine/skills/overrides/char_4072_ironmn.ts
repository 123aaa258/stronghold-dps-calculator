import { duel } from './single-boss.ts';
import { token } from './duel-effects.ts';

// S1、S2 装置天赋各从对应 token 读取加攻与回技间隔；技能锁定期间不累计自然回复。
export const ironmnOverride = duel(({ ctx, e, s, b, attack }) => {
  const device = token(ctx, s === 1 ? 'token_10027_ironmn_pile1' : 'token_10027_ironmn_pile2');
  const nums = device.talents?.[0]?.blackboard.nums ?? {};
  const boost = s === 1 ? nums.atk : 0;
  return { normal: attack(false, 'physical', { atk: boost }), skill: attack(true, 'physical', {
    atk: (b.atk ?? 0) + boost * (b.fake_scale ?? 1), scale: b['attack@atk_scale'], speed: b.attack_speed }),
    battle: s === 2 ? { ...e, spRecovery: e.spRecovery + 1 / nums['default.interval'] } : e,
    assumptions: [s === 3 ? '白铁直接攻击 Boss。铁钳号需队友为装置充能，未配置其他攻击来源，未计装置炮击。' : '一个支援装置对准白铁，并按到期或销毁后补放计算；未模拟装置持有量或格位争用。'] };
});