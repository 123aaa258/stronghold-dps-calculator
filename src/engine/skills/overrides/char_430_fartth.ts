import { operatorRotation, amplify } from './batches/phase-07-09.ts';
import { stats } from '../../stats.ts';
// 凝神从部署后满 delay 秒起生效。距离模组是独立伤害乘区。
export const override = operatorRotation('physical', ({ ctx, effects, slot, skill: s, trait, talent }) => {
  const t = talent(0), focused = ctx.elapsed >= t.delay;
  const atk = focused ? t.atk : 0, speed = focused ? t.attack_speed ?? 0 : 0;
  const e = amplify(effects, 'trait:fartth', trait.damage_scale ?? 0);
  const assumptions = [`远牙自部署后连续 ${t.delay} 秒未受伤，固定目标按距离模组的最远增伤位置。`];
  if (trait.sp) {
    // 远击手 Y 模未击倒目标时按每击回技；用当前空窗攻速换算回复率，首发相位有一击以内的误差。
    const normal = stats(ctx.tier.attributes, [...e.stats, { stat:'attackSpeed', bucket:'direct', value:speed, source:'talent:fartth' }]);
    e.spRecovery += trait.sp / normal.attackInterval;
    assumptions.push('Y 模持续攻击同一存活目标，未击倒回技按空窗每次普攻折算，开技边界可能相差一次命中。');
  }
  if (slot === 3) assumptions.push('目标位于原攻击范围以外，在光羽箭直线内。');
  return { effects: e, idle: { body: { atk, speed } }, active: { effects: slot === 3 ? amplify(e, 'skill:fartth_3', s.damage_scale - 1) : e, body: { atk: atk + (s.atk ?? 0), speed: speed + (s.attack_speed ?? 0) },
    }, assumptions, breakpoints: [t.delay] };
});
