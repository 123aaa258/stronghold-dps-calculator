import { battleEffects } from '../../effects/common.ts';
import { firstCrossing, renewalCurve, stockAfterCast } from '../../swift.ts';
import { integrate, type Segment } from '../../timeline.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import type { DamageType, PhaseResult } from '../../types.ts';
import type { StatModifier } from '../../stats.ts';
import type { SkillOverride } from './index.ts';
import { isBlocked, overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/丰川祥子 ：阻挡时发射的音符不吃远程折损；命中弹本身计入在场音符。
// 穿透按命中时存量直接加算；音符使用发射时面板，时间轴按近身静止目标假设使用连续伤害率。
export const oblvnsOverride: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const clock = new ShredClock(e);
  const bb = level.blackboard.nums;
  const notesTalent = tier.talents.find(t => t.index === 0)!.blackboard.nums;
  const feverTalent = tier.talents.find(t => t.index === 1)!.blackboard.nums;
  const source = `skill:${skill.skillId}`;
  const s1 = skill.skillId.endsWith('_1'), s2 = skill.skillId.endsWith('_2');
  const blocked = isBlocked(context.boss);
  const fullPowerSkill = tier.talents.some(talent => talent.desc.includes('技能期间远程攻击不再降低攻击力'));
  const attack = (type: DamageType, scale: number, hits: number, count: number, label: string,
    active: boolean, modifiers: StatModifier[] = [], ownerActions = 1): PhaseResult => {
    const stacks = Math.min(count, notesTalent.max_cnt!);
    // LOR-Y 强化后技能音符免远程折损；PRTS注明携带S2时两种音色均满足模组判定。
    const closeAttack = blocked || ((active || s2) && fullPowerSkill);
    const rangeScale = closeAttack ? 1 : tier.trait!.blackboard.nums.atk_scale!;
    const result = phase(context, { ...e,
      defPenetrationPct: Math.min(1, e.defPenetrationPct + stacks * notesTalent.def_penetrate_ratio!),
      resPenetrationPct: Math.min(1, e.resPenetrationPct + stacks * notesTalent.magic_resist_penetrate_ratio!),
      derivation: [...e.derivation, { label: '命中时在场音符', value: stacks, op: 'info', source: 'talent:oblvns:1' },
        { label: '领主攻击倍率', value: rangeScale, op: 'mul', source: 'trait:lord' }],
    }, { ownerActions, type, scale: rangeScale * scale, hits, active, damageEvents:clock.count, modifiers: [
      { stat: 'attackSpeed', bucket: 'direct', value: feverTalent.attack_speed!, source: 'talent:oblvns:2' }, ...modifiers,
    ] });
    result.components[0]!.label = label;
    return result;
  };
  const merge = (parts: PhaseResult[]): PhaseResult => ({ stats: parts[0]!.stats,
    components: parts.flatMap(p => p.components), dps: parts.reduce((total, p) => total + p.dps, 0) });
  const normalAt = () => attack('physical', 1, 1, 1, s2 ? '钢琴音符' : '普通音符', false, s2 ? [
    { stat: 'atk', bucket: 'pct', value: bb['attack@atk']!, source },
  ] : []);
  model.normal = normalAt();
  model.burst = model.passive = false;
  model.notes.push('近似：普攻取当前命中的1个音符。音符实际追踪路径依赖方向和站位；时间轴按命中频率积分，未模拟弹道。');
  if (!blocked) model.caveats.push(tier.uniEquipLevel === 1
    ? '已选择未阻挡阶段，一级模组的普通和技能音符均按领主远程倍率。'
    : '已选择未阻挡阶段，普通远程音符按领主倍率，三级模组的技能音符按完整面板。');
  model.caveats.push('毋畏遗忘的范围攻速作用于自身。单 Boss 不触发领主模组的双敌攻速，阻挡时钢琴穿过该敌人只伤害一次。');
  if (e.timedStats.length) model.notes.push('近似：限时外部面板取部署时数值，尚未按到期时刻重算。');
  const normal = model.normal;
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const initial = Math.max(0, level.initSp + e.initSp);
  const wait = (need: number) => Math.max(0, Math.ceil(need - 1e-10)) * normal.stats.attackInterval;
  const first = wait(cost - initial);

  if (s2) {
    // https://prts.wiki/w/卫戍协议/帮助 ：切换类在每次部署中只操作一次。没有其他乐队成员触发Fever。
    const organ = () => attack('arts', 1, 1, 1, '风琴音符', false, [
      { stat: 'attackSpeed', bucket: 'direct', value: bb['attack@attack_speed']!, source },
    ]);
    model.skill = organ();
    model.lifecycle = 'permanent';
    model.duration = Infinity;
    const prefix: Segment[] = [];
    clock.append(prefix,first,normalAt);
    clock.append(prefix,Infinity,organ);
    model.customTimeline = (t, hp) => ({ ...integrate(prefix, [], t, hp), cycle: null, notes: [], caveats: [] });
    model.caveats.push('卫戍每次部署只能切换一次，技力足够即从钢琴切成风琴。仅有祥子一名乐队成员，后续没有手动技能触发 Fever 二连击。');
    return model;
  }

  // ArkDPS 的单目标阻挡 S1 按同批8个音符和在途普攻取9→2层；Fever连奏按层数上限。
  // https://ark-dps.com/ 。S3 远格弹道层数不适用于阻挡；只计同批4个，物法等可能先命中。
  const s1Scales = Array.from({ length: 8 }, (_, i) => bb[i ? `atk_scale_${i + 1}` : 'atk_scale']!);
  const s1Volley = (fever: boolean) => merge(s1Scales.map((scale, i) =>
    attack('arts', scale, 1, fever ? notesTalent.max_cnt! : 9 - i, `第${i + 1}个音符`, true, [], i === 0 ? 1 : 0)));
  const skillAt = (fever = false) => s1 ? s1Volley(fever) : merge([4, 3, 2, 1].flatMap(count => [
    attack('physical', bb['attack@atk_scale']!, .5, count, '钢琴音符', true, [], count === 4 ? 1 : 0),
    attack('arts', bb['attack@atk_scale']!, .5, count, '风琴音符', true, [], 0),
  ]));
  model.skill = skillAt();
  model.lifecycle = s1 ? 'charge' : 'timed';
  model.duration = s1 ? model.skill.stats.attackInterval : level.duration;
  model.notes.push(s1
    ? '近似：S1逐个结算八档倍率；按 ArkDPS 的近身口径，普通施放含一枚在途普攻音符，Fever连奏取层数上限。一次施放占一个攻击间隔，够一充即开。'
    : '近似：S3两物理、两法术音符均追踪该 Boss；同批按四至一层逐次消失，两种音色在各命中顺序上等权。未计跨批在途音符。满血不受击，免死不触发。');

  const feverSkill = s1 ? s1Volley(true) : model.skill;
  const segments = (recovery: number, fever = false) => {
    if (!clock.cap) return [{duration:recovery,dps:normal.dps},...(fever?[{duration:feverDuration,dps:feverSkill.dps}]:[]),{duration:model.duration,dps:model.skill!.dps}];
    const parts: Segment[] = [];
    clock.append(parts,recovery,normalAt);
    if (fever) clock.append(parts,feverDuration,()=>skillAt(true));
    clock.append(parts,model.duration,()=>skillAt());
    return parts;
  };
  const prob = e.skillEndSp ? e.skillEndProbability : 0;
  // PRTS天赋释义：450点后下次手动技能启动20秒Fever，不消耗该次技力；结束后可接原本的付费施放。
  // 计数只包含已命中的音符；多段只回复一次技力。S1可留一充，S3免费演奏时已满一充。
  const feverDuration = 20, hitsNeeded = Math.ceil(450 / feverTalent.cnt!);
  const hitsPerCast = s1 ? s1Scales.length : 4 * Math.floor(model.duration / model.skill.stats.attackInterval);
  const normalHits = (seconds: number) => Math.round(seconds / normal.stats.attackInterval);
  const freeCasts = s1 ? Math.floor(feverDuration / model.duration) : 1;
  const curve = renewalCurve({ prefix: segments(first), stock: stockAfterCast(initial, cost, level.maxChargeTime, true),
    maxCharges: level.maxChargeTime, discreteSp: true, cost, wait, reward: e.skillEndSp,
    probability: prob, segments:seconds=>segments(seconds), skillDuration: model.duration,
    counter: { initial: Math.round(clock.count)*(hitsNeeded+1) + Math.min(hitsNeeded, normalHits(first) + hitsPerCast),
      afterCharge(previous, recovery, stock) {
        clock.reset(Math.floor(previous/(hitsNeeded+1)));
        const hits = previous % (hitsNeeded+1) + normalHits(recovery), parts = segments(recovery,hits >= hitsNeeded);
        const base = Math.round(clock.count)*(hitsNeeded+1);
        if (hits < hitsNeeded) return [{ count: base + Math.min(hitsNeeded, hits + hitsPerCast), stock, weight: 1, parts }];
        const count = base + Math.min(hitsNeeded, hitsPerCast);
        return [{ count, stock, weight: 1, parts, freeSkills: {
          count: freeCasts, firstEnd: recovery + Math.min(model.duration, feverDuration), interval: model.duration,
        } }];
      } },
  });
  model.notes.push(`近似：Fever从0点起，每次自身音符命中计${feverTalent.cnt}点，450点后在可施放时插入20秒免费演奏。按完整攻击次数累计，不计队友、前一回合或外部附伤。每条迅捷分支保留独立的命中数和剩余充能。`);
  model.customTimeline = (t, hp) => {
    const totalDamage = curve.at(t);
    const killTimeSec = firstCrossing(curve.at, hp, hp / curve.cycle.avgDps + first + feverDuration);
    curve.finishNotes();
    return { totalDamage, killTimeSec, cycle: curve.cycle, notes: prob ? curve.notes : [], caveats: [] };
  };
  return model;
};
