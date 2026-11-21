import { judgmentHit } from '../effects/judgment.ts';
import { kazimierzHit, quicksandHits } from '../effects/skill-bonds.ts';
import { clauses, nonDps } from './description.ts';
import type { BossData, DamageType, OperatorData, OperatorTierData, PhaseResult, SkillData, SkillLevelData, SkillLifecycle } from '../types.ts';
import { battleEffects } from '../effects/common.ts';
import type { BattleEffects } from '../effects/common.ts';
import type { StatModifier } from '../stats.ts';
import { stats } from '../stats.ts';
import { damage } from '../damage.ts';
import { splashPerAttack, splashReady } from '../effects/equips.ts';
import { consume, emptyEffects, plain } from './rules.ts';
import type { Effects, RuleContext } from './rules.ts';
export interface GenericModel {
  assumptions?: string[];
  /** 部署后需要重算干员天赋的绝对时刻（秒）。 */
  breakpoints?: number[];
  nativeRotation?: boolean;
  ownsBurning?: boolean;
  defendSp?: { interval: number; gain: number };
  customTimeline?: (durationSec: number, hp: number) => import('../timeline.ts').TimelineResult;
  /** 固定战斗条件下，按迅捷每次整笔回技的概率精确计算窗口总伤。 */
  expectedSwiftDamage?: (durationSec: number) => number;
  /** 复用固定面板，从部署重新执行一条路径，只计算窗口内累计伤害。 */
  replayDamage?: (durationSec: number) => number;
  elemental?: import('../types.ts').CalcResult['elemental'];
  battle?: BattleEffects;
  rebuild?: (stackStats: StatModifier[], elapsed: number, damageEvents: number) => GenericModel;
  normal: PhaseResult;
  skill: PhaseResult | null;
  lifecycle: SkillLifecycle;
  duration: number;
  repeatDuration?: number; // 仅第二次及以后施放的持续时间与首次不同时填写
  /** 干员退场的时刻（秒，部署起算）；之后不再在场，与在场状态挂钩的盟约伤害停止。缺省为全程在场。 */
  leavesAt?: number;
  overcharge?: boolean;
  burst: boolean;
  burstAttack?: boolean;
  passive: boolean;
  notes: string[];
  caveats: string[];
  ignoredKeys: string[];
  unconsumed: { source: string; key: string }[];
}
export function lifecycle(skill: SkillData, level: SkillLevelData): Pick<GenericModel, 'lifecycle' | 'duration' | 'repeatDuration' | 'overcharge' | 'burst' | 'passive'> {
  const description = plain(level.description);
  // 卡涅利安与光影迅捷剑在一份技力时即可开启，第二份蓄力只改变额外效果。
  const extraAtFullCharge = skill.skillId.startsWith('skchr_billro_') || skill.skillId === 'skchr_vvana_1';
  const text = extraAtFullCharge ? description.split('蓄力额外效果')[0] : description;
  const result = (kind: SkillLifecycle, duration = 0, burst = false, passive = false) => ({ lifecycle: kind, duration, burst, passive });
  const repeatDuration = level.blackboard.nums.enhance_duration;
  if (skill.skillId === 'skchr_vvana_3' && level.duration > 0 && repeatDuration > 0) {
    return { ...result('timed', level.duration), repeatDuration };
  }
  // 描述明确的二次开启/切换/蓄力生命周期无法用单个固定周期表示。
  if (/第二次|切换|蓄力/.test(text)) return result('unknown');
  if (skill.durationType === 'AMMO') {
    const rendered = text.replace(/\{([\w.@\[\]]+)(?::[^}]+)?\}/g, (all, key: string) => String(level.blackboard.nums[key] ?? all));
    const ammo = rendered.match(/(?:装有|获得)(\d+)发(?:子弹|弹药)/);
    return ammo ? result('ammo', Number(ammo[1])) : result('unknown');
  }
  if (skill.durationType !== 'NONE') return result('unknown');
  if (skill.skillType === 'PASSIVE' || level.spType === 'PASSIVE') {
    // 执守阵线的解包描述省略了部署触发条件。https://prts.wiki/w/历阵锐枪芬#执守阵线
    if (/部署后/.test(text) || skill.skillId === 'skchr_fang2_2') {
      // duration 的语义只在明确“{duration}秒内”中确认，不将任意同名参数当技能持续。
      const duration = level.duration > 0 ? level.duration : /(?:部署后|在)\{duration\}秒内/.test(text) ? level.blackboard.nums.duration : undefined;
      return duration && duration > 0 ? result('on_deploy', duration) : result('unknown');
    }
    // 仅确认的无开启/终止条件被动技能；不能把未知PASSIVE一概当常驻。
    const permanentPassive = ['skchr_ethan_1', 'skchr_cathy_1', 'skchr_zumama_1'].includes(skill.skillId);
    return level.duration <= 0 && permanentPassive ? result('permanent', Infinity, false, true) : result('unknown');
  }
  if (/持续时间无限/.test(text)) return result('permanent', Infinity);
  const nextAttack = /下次攻击|下一次攻击变为|下次治疗/.test(text);
  if (extraAtFullCharge) return { ...result(nextAttack ? 'instant' : 'timed', Math.max(0, level.duration)), overcharge: true };
  const burst = !nextAttack && level.duration <= 0 && /立即.*(?:攻击|造成)/.test(text);
  // 可充能只改变技力库存上限；下次攻击、瞬发与持续技仍按各自的时机施放。
  if (level.duration > 0) return result('timed', level.duration);
  if (nextAttack || burst) return result('instant', 0, burst);
  return result('unknown');
}
function attackType(operator: OperatorData, tier: OperatorTierData, active: boolean): DamageType {
  const trait = plain(tier.trait?.desc ?? '');
  // ‘不攻击时装填’是条件句；解放者/阵法术师仅非技能期不攻击。
  if (/通常(?:时)?不攻击/.test(trait)) {
    if (!active) return 'none';
  } else if (/不进行攻击|不攻击(?!时)|不造成伤害/.test(trait)) return 'none';
  if (operator.profession === 'MEDIC') return operator.subProfessionId === 'incantationmedic' ? 'arts' : 'heal';
  if (/攻击造成法术伤害/.test(trait) || operator.profession === 'CASTER' || (operator.profession === 'SUPPORT' && operator.subProfessionId !== 'craftsman')) return 'arts';
  return 'physical';
}
type RuleNotes = Pick<GenericModel, 'notes' | 'ignoredKeys' | 'unconsumed'>;
function apply(context: RuleContext, effects: Effects, { notes, ignoredKeys, unconsumed }: RuleNotes, consumed = new Set<string>()) {
  const parsed = clauses(context);
  consume(context, effects, consumed, parsed);
  for (const key of [...Object.keys(context.blackboard.nums), ...Object.keys(context.blackboard.strs ?? {})]) {
    if (consumed.has(key) && !(key in (context.blackboard.strs ?? {}))) continue;
    if (nonDps(context, key) && !(key in (context.blackboard.strs ?? {}))) {
      ignoredKeys.push(`${context.source}:${key}`);
      continue;
    }
    unconsumed.push({ source: context.source, key });
    notes.push(`忽略了 ${key}（键，${context.source}；语义或适用条件未确认）`);
  }
  const allKeys = Object.keys(context.blackboard.nums);
  const onlySurvival = allKeys.length > 0 && allKeys.every(k => nonDps(context, k)) && !/攻击力|攻击速度|攻击间隔|造成|技力|停止攻击|撤退/.test(plain(context.description));
  for (const clause of parsed) {
    if (onlySurvival) continue;
    // 纯阻挡容量描述不修改固定单目标伤害，不等同于‘攻击阻挡的敌人’条件。
    if (/^能够阻挡[一二三四五六七八九十\d]+个敌人$/.test(clause.text)) continue;
    if (clause.conditional) {
      notes.push(`条件效果未建模：${clause.raw}`);
      continue;
    }
    // 只承认完整的简单行为；不能因一个键已消费就掩盖同句的无键多段/持续伤害。
    const known = consumed.size > 0 && /^(?:自身(?:与浮游单元的)?|下次攻击的?|本次攻击的?)?(?:攻击力(?:和防御力各)?\+\d+(?:\.\d+)?%|攻击速度\+\d+(?:\.\d+)?|攻击力(?:提升至|提高至)\d+(?:\.\d+)?%)$/.test(clause.text)
      || consumed.has('base_attack_time') && /^攻击间隔(?:较大幅度缩短|延长)$/.test(clause.text)
      || /^(?:攻击造成法术伤害|无视攻击目标\d+(?:\.\d+)?法术抗性|持续时间无限)$/.test(clause.text)
      || /^(?:防御力|法术抗性|最大生命值)\+\d+(?:\.\d+)?%?$/.test(clause.text) && allKeys.some(k => nonDps(context, k));
    if (!known) notes.push(`忽略了 ${context.source} 描述中规则未覆盖的行为（机制，尚未逐条确认：${clause.raw}）`);
  }
}

function prepareTier(operator: OperatorData, tier: OperatorTierData) {
  const base = emptyEffects();
  const info: RuleNotes = { notes: [], ignoredKeys: [], unconsumed: [] };
  for (const talent of [...(tier.trait ? [tier.trait] : []), ...tier.talents]) {
    const kind = talent === tier.trait ? 'trait' : 'talent';
    // 候选正文和黑板已经含潜能加成，talpu 括注仅说明与上档的差值。
    const description = talent.desc.replace(/<@ba\.talpu>[（(][+＋−-]?\d+(?:\.\d+)?(?:%|秒)?[）)]<\/>/g, '');
    apply({ kind, source: `${kind}:${operator.charId}:${talent.index}:${talent.prefabKey ?? ''}`, prefabId: talent.prefabKey, description, blackboard: talent.blackboard }, base, info);
  }
  return { base, info };
}

function prepareSkill({ base, info: tierInfo }: ReturnType<typeof prepareTier>, skillData: SkillData, level: SkillLevelData) {
  const info = { notes: [...tierInfo.notes], ignoredKeys: [...tierInfo.ignoredKeys], unconsumed: [...tierInfo.unconsumed] };
  const active: Effects = { ...base, stats: [...base.stats], derivation: [...base.derivation] };
  const life = lifecycle(skillData, level);
  apply({ kind: 'skill', source: `skill:${skillData.skillId}`, prefabId: level.prefabId, description: level.description, blackboard: level.blackboard }, active, info,
    life.repeatDuration === undefined ? undefined : new Set(['enhance_duration']));
  return { base, active, info, life };
}

// calculate 的干员阶级与技能等级来自只读的生成表；描述规则与 Boss 和盟约无关。
const tierRules = new WeakMap<OperatorTierData, {
  tier: ReturnType<typeof prepareTier>;
  skills: Map<SkillLevelData, ReturnType<typeof prepareSkill>>;
}>();
export function staticRules(operator: OperatorData, tier: OperatorTierData, skillData: SkillData, level: SkillLevelData) {
  let entry = tierRules.get(tier);
  if (!entry) {
    entry = { tier: prepareTier(operator, tier), skills: new Map() };
    tierRules.set(tier, entry);
  }
  let prepared = entry.skills.get(level);
  if (!prepared) {
    prepared = prepareSkill(entry.tier, skillData, level);
    entry.skills.set(level, prepared);
  }
  return prepared;
}

export function generic(operator: OperatorData, tier: OperatorTierData, skillData: SkillData, level: SkillLevelData, boss: BossData, external: BattleEffects = battleEffects(), prepared = prepareSkill(prepareTier(operator, tier), skillData, level)): GenericModel {
  const { base, active, info, life } = prepared;
  const notes = [...external.notes, ...info.notes];
  const ignoredKeys = [...external.ignoredKeys, ...info.ignoredKeys];
  const unconsumed = [...info.unconsumed];
  const caveats: string[] = ['近似：普攻类型优先按特性，缺少明确类型时按职业/分支判定（工匠为物理）；未实现特殊普攻行为，来源：通用模型分类假设'];
  if (life.lifecycle === 'unknown') notes.push('忽略了 未识别的技能生命周期（机制）；时间过程仅计非技能期');
  if (life.lifecycle === 'ammo') notes.push('近似：弹药持续时间按描述中的弹药数 × 技能攻击间隔估算，不提前停止');
  const text = plain(level.description);
  const burstAttack = life.burst && /立即[^。；\n]*攻击(?!力|速度|间隔)/.test(text);
  // 领袖的馈赠只强化狼群下次攻击，沿用通用技能占用的间隔时不送本体攻击。
  const skillCanTriggerJudgment = skillData.skillId !== 'skchr_vigil_2' && (!life.burst || burstAttack);
  const phaseType = (isSkill: boolean) => {
    let type = attackType(operator, tier, isSkill);
    if (isSkill && /(?:伤害类型变为|攻击造成|攻击变为)法术/.test(text)) type = 'arts';
    if (isSkill && /(?:伤害类型变为|攻击造成)真实/.test(text) && !/阻挡|若|当|时伤害/.test(text)) type = 'true';
    if (isSkill && /停止攻击/.test(text)) type = 'none';
    if (!isSkill && /技能未开启时无法普通攻击/.test(text)) type = 'none';
    if (isSkill && type === 'none' && /技能未开启时无法普通攻击/.test(text)) type = 'arts';
    return type;
  };
  const normalType = phaseType(false);
  const skillType = phaseType(true);
  const phase = (effects: Effects, isSkill: boolean, stackStats: StatModifier[] = [], elapsed = 0, damageEvents = 0, fixedPanel?: PhaseResult['stats']): PhaseResult => {
    const panel = fixedPanel ?? stats(tier.attributes, [...effects.stats, ...external.stats, ...(isSkill ? external.skillStats : []), ...stackStats, ...external.timedStats.filter(t => elapsed < t.until).map(t => t.modifier)]);
    const type = isSkill ? skillType : normalType;
    const params = (damageType: DamageType) => ({
      reductionPct: damageType === 'physical' ? effects.defReductionPct : effects.resReductionPct,
      reductionFixed: damageType === 'physical' ? external.defReductionFixed : external.resReductionFixed + Math.min(external.resShred?.max ?? 0, damageEvents * (external.resShred?.perHit ?? 0)),
      penetrationPct: damageType === 'physical' ? external.defPenetrationPct : external.resPenetrationPct,
      penetrationFixed: damageType === 'arts' ? effects.resPenetrationFixed + external.resPenetrationFixed : external.defPenetrationFixed,
    });
    // 弱点伤害只转换本体攻击及附加伤害；持续伤害保持原类型。
    const weakness = external.weakness && { source: external.weakness.source, byType: { physical: params('physical'), arts: params('arts') } };
    const hit = (damageType: DamageType, scale: number, hits: number, proc?: BattleEffects['atkProc'], weak = true) => damage({ attack: panel.atk, scale, hits, type: damageType, proc,
      target: boss, ...params(damageType), modifiers: external.modifiers, weakness: weak ? weakness : undefined });
    const result = hit(type, effects.attackScale * external.attackScale, effects.hits, external.atkProc);
    const countsTowardDps = type === 'physical' || type === 'arts' || type === 'true';
    const hitsPerSec = effects.hits / panel.attackInterval;
    const dps = countsTowardDps ? result.perHit * hitsPerSec : 0;
    const components: PhaseResult['components'] = [{ label: isSkill ? '技能攻击' : '普攻', source: isSkill ? `skill:${skillData.skillId}` : 'attack', damageType: result.type, perHit: result.perHit,
      hitsPerAttack: effects.hits, hitsPerSec, dps, countsTowardDps,
      derivation: [...effects.derivation, ...external.derivation, ...result.derivation, { label: '每秒段数', value: hitsPerSec, op: 'mul', source: 'formula:frequency' }, { label: '分项DPS', value: dps, op: 'set', source: 'formula:dps' }] }];
    if (countsTowardDps) for (const extra of external.extraHits) {
      const extraResult = hit(extra.type, extra.scale, extra.hits);
      const frequency = hitsPerSec * extra.hits;
      components.push({ label: '附加伤害', source: extra.source, damageType: extraResult.type, perHit: extraResult.perHit, hitsPerAttack: effects.hits * extra.hits, hitsPerSec: frequency, dps: extraResult.perHit * frequency, countsTowardDps: true, derivation: [{ label: '附加伤害倍率', value: extra.scale, source: extra.source, op: 'mul' }, ...external.derivation, ...extraResult.derivation] });
    }
    const splash = external.splash;
    if (splash && countsTowardDps && splashReady(external, [...external.stats, ...stackStats])) {
      const splashHit = hit(splash.type, splash.scale, 1);
      const perAttack = splashPerAttack(panel.attackInterval, splash.probability, splash.cooldown);
      const frequency = perAttack / panel.attackInterval;
      components.push({ label: '满层追加物理伤害', source: splash.source, damageType: splashHit.type, perHit: splashHit.perHit, hitsPerAttack: perAttack, hitsPerSec: frequency,
        dps: splashHit.perHit * frequency, countsTowardDps: true, derivation: [...external.derivation, ...splashHit.derivation,
          { label: '每次攻击触发次数（概率与冷却）', value: perAttack, op: 'mul', source: splash.source }] });
    }
    if (external.judgment && countsTowardDps && (!isSkill || skillCanTriggerJudgment)) {
      const proc = judgmentHit(external, boss, panel.attackInterval, elapsed);
      if (proc) components.push(proc);
    }
    if (external.kazimierz && countsTowardDps && (!isSkill || skillCanTriggerJudgment)) {
      components.push(kazimierzHit(external, boss, panel)!);
    }
    if (countsTowardDps) for (const dot of external.dots) {
      const tick = hit(dot.type, dot.scale, 1, undefined, false);
      components.push({ label: dot.label, source: dot.source, damageType: dot.type, perHit: tick.perHit, hitsPerAttack: 1, hitsPerSec: 1 / dot.interval,
        dps: tick.perHit / dot.interval, countsTowardDps: true, derivation: [...external.derivation, ...tick.derivation, { label: '结算间隔（秒）', value: dot.interval, op: 'info', source: dot.source }] });
    }
    if (external.quicksand && isSkill && !life.passive && life.lifecycle !== 'unknown') {
      const sand = quicksandHits(external, boss, damageEvents);
      // “下次攻击”占用的攻击间隔用于技力时间轴，瞬发动作本身不产生技能持续秒数。
      components.push(...((life.lifecycle === 'instant' || life.lifecycle === 'charge') && level.duration <= 0 ? sand.slice(0, 1) : sand));
    }
    return { stats: panel, dps: components.reduce((sum, c) => sum + (c.countsTowardDps ? c.dps : 0), 0), components };
  };
  const normal = phase(base, false);
  const skillPhase = phase(active, true);
  let duration = life.duration;
  if (life.lifecycle === 'ammo') duration *= skillPhase.stats.attackInterval;
  if ((life.lifecycle === 'instant' || life.lifecycle === 'charge') && duration === 0 && !life.burst) {
    // shortcut: 下次攻击按一个完整攻击间隔替换普攻，精建时改为帧级攻击事件。
    duration = skillPhase.stats.attackInterval;
    notes.push('近似：下次攻击技能占用一个技能攻击间隔，忽略攻击前摇与重置攻击计时（机制）');
  }
  if (operator.tokenIds.length || tier.talents.some(t => t.tokenKey)) caveats.push('忽略了 召唤物伤害（通用技能模型）');
  caveats.push(...external.caveats);
  if (external.extraHits.length) caveats.push('附加伤害只由原攻击伤害各段触发一次，不递归触发附加伤害；同击各段按同一时点结算');
  const model: GenericModel = { normal: life.passive ? skillPhase : normal, skill: life.passive || life.lifecycle === 'unknown' ? null : skillPhase, ...life, duration, notes, caveats, ignoredKeys, unconsumed, battle: external, burstAttack };
  if (external.stacks.length || external.timedStats.length || external.resShred || external.bondStacks || external.judgment) {
    const fixedStats = !external.stacks.length && !external.timedStats.length;
    // 只有逐击减抗变化时，复用不受影响的面板和非术伤阶段。
    const rebuildPhase = (effects: Effects, isSkill: boolean, initial: PhaseResult, stackStats: StatModifier[], elapsed: number, damageEvents: number) => {
      const reusePanel = fixedStats && stackStats.length === 0;
      // 弱点伤害可能随减抗改取法术，不能按初始类型判断是否受逐击减抗影响。
      if (reusePanel && !external.judgment && (!external.resShred || !external.weakness && !initial.components.some(c => c.damageType === 'arts'))) return initial;
      return phase(effects, isSkill, stackStats, elapsed, damageEvents, reusePanel ? initial.stats : undefined);
    };
    model.rebuild = (stackStats, elapsed, damageEvents) => {
      const normalPhase = rebuildPhase(base, false, normal, stackStats, elapsed, damageEvents);
      const activePhase = rebuildPhase(active, true, skillPhase, stackStats, elapsed, damageEvents);
      const updatedDuration = life.lifecycle === 'ammo' ? life.duration * activePhase.stats.attackInterval
        : (life.lifecycle === 'instant' || life.lifecycle === 'charge') && life.duration === 0 && !life.burst ? activePhase.stats.attackInterval : duration;
      return { ...model, normal: life.passive ? activePhase : normalPhase, skill: model.skill ? activePhase : null, duration: updatedDuration };
    };
  }
  return model;
}
