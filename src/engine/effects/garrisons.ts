import data from '../../data/generated/garrisons.json' with { type: 'json' };
import type { BondSetting, GarrisonData } from '../types.ts';
import type { BattleEffects } from './common.ts';
import { record } from './common.ts';
const garrisons = new Map((Object.values(data) as unknown as GarrisonData[]).map(g => [g.garrisonId, g]));
export function applyGarrisons(e: BattleEffects, ids: string[], bonds: BondSetting[]) {
  const presentBonds = bonds.filter(bond => bond.activeChars > 0);
  // 部署壳负责触发，引用项仅提供效果数据；预先收集，避免受 ids 顺序影响。
  const deploymentEffects = new Set(ids.flatMap(id => {
    const strings = garrisons.get(id)?.blackboard.strs;
    return strings?.garrison_type === 'garrison_trigger_buff' && strings.key === 'act2autochess_gar_event_onstart'
      ? [strings.garrison_trigger_buff_garrison_key] : [];
  }));
  for (const id of ids) {
    if (deploymentEffects.has(id)) continue;
    const g = garrisons.get(id);
    if (!g) { e.notes.push(`近似：卫戍特质 ${id} 数据缺失`); continue; }
    // “<战斗中>造成的伤害变为弱点伤害（根据敌人的防御力与法术抗性变换伤害类型）”：与同一特质里的击倒叠层无关，先单独结算。
    if (g.eventType === 'IN_BATTLE' && g.blackboard.strs?.key === 'act1autochess_gar_eff_chaos') {
      const source = `garrison:${id}`;
      e.weakness ??= { source };
      record(e, source, '卫戍特质：战斗中造成的物理和法术伤害转为弱点伤害（逐段按物理、法术各结算一遍，取较高者）', 1);
    }
    if (g.effectType === 'ADD_BOND' || g.effectType.startsWith('SERVER_') || g.eventType.startsWith('SERVER_')) {
      e.caveats.push('卫戍特质中的叠层效果请直接体现在盟约层数输入里');
      if (!/^garrison_92_[ab]$/.test(id)) continue;
    }
    if (g.eventType !== 'IN_BATTLE' || (g.effectType !== 'GAIN_BUFF' && !/^garrison_92_[ab]$/.test(id))) continue;
    if (g.blackboard.strs?.key === 'act1autochess_gar_eff_chaos') continue;
    const source = `garrison:${id}`;
    let n = g.blackboard.nums;
    let strings = g.blackboard.strs ?? {};
    let key = strings.key;
    // 部署触发器引用另一个特质的数据；其他触发器不能当部署时常驻处理。
    if (strings.garrison_type === 'garrison_trigger_buff' && key === 'act2autochess_gar_event_onstart') {
      const linked = garrisons.get(strings.garrison_trigger_buff_garrison_key);
      if (linked) { n = linked.blackboard.nums; strings = linked.blackboard.strs ?? {}; key = strings.key; }
    }
    if (key === 'act1autochess_gar_eff_attrByBond' || key === 'act2autochess_gar_eff_attrByBond_add_onstart' || key === 'act3autochess_gar_effect_attrbybond_inrange') {
      // “【A】【B】每叠加N层”：各盟约先取完整N层再相加；有成员在场就取层数，无需达到激活人数。
      const layers = (strings.bond_id ?? '').split(',').map(bond => presentBonds.find(b => b.bondId === bond)?.stacks ?? 0);
      const divisor = n.divide_num ?? n.denominator;
      const count = id === 'garrison_92_b' ? Math.floor(layers.reduce((sum, value) => sum + value, 0) / divisor)
        : layers.reduce((sum, value) => sum + Math.floor(value / divisor), 0);
      const until = n.duration ?? n.attr_duration;
      const add = (stat: 'atk' | 'attackSpeed', value: number, bucket: 'pct' | 'direct') => {
        const modifier = { stat, bucket, value: value * count, source };
        if (until !== undefined) e.timedStats.push({ until, modifier }); else e.stats.push(modifier);
      };
      if (n.atk !== undefined || n.atk_base !== undefined) add('atk', n.atk ?? n.atk_base, key === 'act2autochess_gar_eff_attrByBond_add_onstart' ? 'direct' : 'pct');
      if (n.attack_speed !== undefined || n.attack_speed_base !== undefined) add('attackSpeed', n.attack_speed ?? n.attack_speed_base, 'direct');
      if (n.sp_recovery_per_sec !== undefined) { e.spRecovery += n.sp_recovery_per_sec * count; record(e, source, '技力自然回复加算/秒', n.sp_recovery_per_sec * count); }
      if (id !== 'garrison_92_b' && layers.length > 1 && layers.some(value => value > 0)) e.notes.push(`近似：${source} 多盟约层数按各自整除后相加；来源：描述“每叠加”及divide_num的解释，待游戏验证`);
      if (n.max_hp !== undefined) e.ignoredKeys.push(`${source}:max_hp`);
    } else if (/^garrison_(149|195)_[ab]$/.test(id)) {
      // 原文“攻击力和生命上限+20%/40%/60%/120%”，board atk=1.2/1.4/1.6/2.2表示含基数倍率。
      e.stats.push({ stat: 'atk', bucket: 'pct', value: n.atk - 1, source });
      e.ignoredKeys.push(`${source}:max_hp`);
    } else if (key === 'act3autochess_gar_effect_block_eprecoverspeed_inrange' && strings.ep_type === 'WATER') {
      const stacks = presentBonds.find(b => b.bondId === strings.bond_id)?.stacks ?? 0;
      const bonus = Math.floor(stacks / n.denominator!) * n.ep_break_recover_speed_base!;
      if (bonus > 0) {
        e.erosionRecoverySpeed = (e.erosionRecoverySpeed ?? 0) + bonus;
        record(e, source, '阿戈尔每满一档层数，提高侵蚀爆发后的冷却恢复速度', bonus);
      }
    } else if (/attackslow|eprecoverspeed|minus_respawn/.test(key ?? '') || /^garrison_(70|59|171|150)_/.test(id)) {
      e.ignoredKeys.push(...Object.keys(n).map(k => `${source}:${k}`));
    } else if (/^garrison_(44|233)_/.test(id)) {
      e.caveats.push(`${source} 身前一格其他干员技力不计入自身`);
    } else {
      e.notes.push(`近似：卫戍特质 ${source} 未建模：${g.desc ?? '触发条件不明'}（条件、控制或召唤机制）`);
    }
  }
}
