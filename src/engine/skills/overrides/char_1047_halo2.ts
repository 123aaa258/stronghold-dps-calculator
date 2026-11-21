import { operatorRotation, amplify } from './batches/phase-07-09.ts';
import { stats } from '../../stats.ts';
// 先施加停顿再叠速；用逐次变化的完整普攻间隔安排初始十八层。
export const override = operatorRotation('arts', ({ ctx, effects, slot, skill: s, talent }) => {
  const gain = talent(0), weak = talent(1);
  const breakpoints = [], delay = weak['halo2_t_1[weak].interval'];
  let time = 0;
  for (let n = 0; n < gain.max_stack_cnt; n++) {
    time += stats(ctx.tier.attributes, [...effects.stats, { stat: 'attackSpeed', bucket: 'direct', value: n * gain.attack_speed, source: 'talent:halo2' }]).attackInterval;
    breakpoints.push(time);
  }
  const count = breakpoints.filter(t => t <= ctx.elapsed + 1e-8).length;
  const value = weak[ctx.elapsed >= delay ? 'halo2_t_1[weak].damage_scale_max' : 'halo2_t_1[weak].damage_scale'];
  const speed = count * gain.attack_speed;
  const assumptions = ['Boss 持续停留范围内，只有一个链接目标；叠速按各层普通攻击间隔，技能三改变间隔和盟约临时攻速时层数到达时点有偏差。'];
  return { effects: amplify(effects, 'talent:halo2', value - 1, true), idle: { body: { speed } }, active: {
    body: { speed, atk: s.atk, scale: s.atk_scale, delay: s.base_attack_time } },
    lifecycle: slot === 2 ? 'instant' : 'timed', breakpoints: [...breakpoints, delay], assumptions };
});
