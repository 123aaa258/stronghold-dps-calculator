import { duel } from './single-boss.ts';
import { token, tokenEffects, triggerCount } from './duel-effects.ts';
import { swiftSucceeds } from '../../swift.ts';

// 鸿雪 S2 是三段立即攻击。打字机独立基础攻击、在场时长与减防来自 token 的 attributes 和 talents。
export const bgsnowOverride = duel(({ ctx, e, s, b, t, attack, add }) => {
  const machine = token(ctx, 'token_10026_bgsnow_subbow');
  const life = machine.talents?.[0]?.blackboard.nums.interval ?? 25;
  const gap = machine.attributes.respawnTime * (s === 2 ? b.respawn_time : 1);
  const cycle = gap + life;
  const age = ctx.elapsed % cycle;
  const activeMachine = age < life - 1e-8;
  const shred = machine.talents?.[1]?.blackboard.nums ?? {};
  const track = s === 1 ? triggerCount(e, 'bgsnow-attacks', 'attack', 360) : { count: 0, effects: e };
  const effects = { ...track.effects, defReductionFixed: e.defReductionFixed - (age < life + (shred.duration ?? 0) ? (shred['bgsnow_token[def_down]_2.def'] ?? 0) * (ctx.boss.attributes?.def ?? 0) : 0) };
  const make = (active: boolean) => {
    const crit = active && s === 1 && swiftSucceeds(track.count, b.prob, 1);
    const scale = active ? s === 3 ? b['bgsnow_s_3[atk_up].atk_scale'] : s === 2 || crit ? b.atk_scale : 1 : 1;
    let main = attack(active, 'physical', { effects, atk: active ? b.atk : 0, scale, hits: active && s === 2 ? 3 : 1, delay: active ? b.base_attack_time : 0 });
    if (activeMachine) {
      const fixed = machine.attributes.atk * (1 + (active ? b.atk ?? 0 : 0));
      main = add(main, { label: '打字机', type: 'physical', flat: fixed * scale, hits: active && s === 2 ? 3 : 1,
        interval: active && s === 2 ? main.stats.attackInterval : machine.attributes.baseAttackTime + (active ? b.base_attack_time ?? 0 : 0), independent: true }, tokenEffects(effects));
    }
    return main;
  };
  const breaks = Array.from({ length: Math.ceil(180 / cycle) }, (_, i) => [cycle * i, cycle * i + life, cycle * i + life + (shred.duration ?? 0)]).flat().filter(n => n > 0);
  return { normal: make(false), skill: make(true), battle: track.effects, breakpoints: breaks, lifecycle: s === 1 ? 'permanent' : s === 2 ? 'instant' : 'timed',
    duration: s === 1 ? Infinity : s === 2 ? 0 : ctx.level.duration, burst: s === 2, burstAttack: s === 2,
    assumptions: ['打字机在鸿雪旁朝向 Boss，部署即可命中并触发近邻减防，持续时间后开始再部署。打字机按自身面板与鸿雪同步开技，忽略两者攻击进度差；180 秒外沿用末段部署状态。', ...(s === 1 ? ['抑扬格按本体攻击动作的固定序列判定，打字机同步取值，前 360 次动作后沿用末次判定。'] : [])] };
});