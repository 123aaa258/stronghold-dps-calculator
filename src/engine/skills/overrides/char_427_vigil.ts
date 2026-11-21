import { operatorRotation, companion } from './batches/phase-07-09.ts';
// 狼群攻击使用独立面板；弱点卫戍作用于伺夜，狼群仅享受狼群天性穿透。
export const override = operatorRotation('physical', ({ ctx, slot, skill: s, effects, trait, talent, blocked }) => {
  const wolf = companion(ctx, 'token_10028_vigil_wolf');
  const interval = wolf.talents![0]!.blackboard.nums.interval;
  const firstExtra = slot === 1 ? Math.min(interval, Math.max(0, ctx.level.spCost - ctx.level.initSp - effects.initSp) / (ctx.level.increment + effects.spRecovery)) : interval;
  const count = 2 + Number(ctx.elapsed >= firstExtra);
  const pierce = blocked ? talent(1).def_penetrate_fixed : 0;
  const e = { ...effects, defPenetrationFixed: effects.defPenetrationFixed + pierce };
  const scale = blocked ? trait.atk_scale ?? 1.5 : 1;
  const pack = { label: '狼群', strike: { hits: count }, token: wolf.attributes, defPenetrationFixed: pierce };
  const idle = { body: { scale }, extra: [pack] };
  const assumptions = ['部署起两只狼影阻挡同一 Boss，无致命伤；25 秒或领袖的呼唤先补至三只，狼群独立于本体触发装备。'];
  if (slot === 1) return { effects: e, idle, active: { body: { type: 'none' } }, lifecycle: 'instant', burst: true, breakpoints: [firstExtra], assumptions };
  if (slot === 2) {
    // 瞬时记录下一次狼群攻击相对普攻的增量需单独按防御结算，不能将攻击倍率直接减一。
    assumptions.push('馈赠的强化狼群攻击按开技时结算相对普通攻击的差额，实际发生在狼群下一次命中。');
    return { effects: e, idle, active: { body: { type: 'none' }, extra: [{ ...pack, label: '馈赠强化差额',
      strike: { hits: count, scale: s['vigil_wolf_s_2.atk_scale'] }, subtractScale: 1 }] },
      lifecycle: 'instant', burst: true, breakpoints: [firstExtra], assumptions };
  }
  return { effects: e, idle, active: { body: { scale, hits: 3 }, extra: [pack, ...(blocked ? [
    { label: '伺夜三连附伤', strike: { type: 'arts' as const, scale: s['attack@vigil_s_3.atk_scale'], hits: 3 } },
    { label: '狼影命中附伤', strike: { type: 'arts' as const, scale: s['attack@vigil_s_3.atk_scale'], hits: count, fixedInterval: wolf.attributes.baseAttackTime } }] : [])] },
    breakpoints: [firstExtra], assumptions };
});
