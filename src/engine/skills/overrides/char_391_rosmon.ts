import { duel } from './single-boss.ts';
import { token } from './duel-effects.ts';
import { isBlocked } from './shared.ts';

// 特性 attack@times 包含主攻击，S2 额外余震叠加；S3 的装备减防来自技能描述固定文本。
export const rosmonOverride = duel(({ ctx, s, b, t, trait, e, attack, add }) => {
  const blocked = isBlocked(ctx.boss);
  const make = (active: boolean) => {
    const effects = { ...e, defPenetrationFixed: e.defPenetrationFixed + t(0, 'def_penetrate_fixed'),
      defReductionFixed: e.defReductionFixed + (active && s === 3 && blocked ? -(token(ctx,'token_10012_rosmon_shield').talents?.[0]?.blackboard.nums.def ?? 0) : 0) };
    if (active && s === 3 && !blocked) return attack(true, 'none');
    const hit = attack(active, 'physical', { effects, atk: t(1, 'atk') + (active ? b.atk ?? 0 : 0), delay: active ? b.base_attack_time : 0 });
    const shock = add(hit, { label: '余震', type: 'physical', scale: trait('attack@append_atk_scale'),
      hits: trait('attack@times', 2) - 1 + (active && s === 2 ? b.add_times : 0) }, effects);
    return active && s === 1 ? add(shock, { label: '思维膨大法伤', type: 'arts', scale: b.extra_atk_scale }, effects) : shock;
  };
  return { normal: make(false), skill: make(true), assumptions: ['迷迭香与一名术师同时在场，感知稳定加攻生效。', ...(s === 3 ? ['目标被阻挡时由一个战术装备阻挡，减防 160 取自如你所愿的技能描述。'] : [])] };
});