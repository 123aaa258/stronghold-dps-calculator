import { judgmentHit } from '../../effects/judgment.ts';
import { isDotSource, kazimierzHit } from '../../effects/skill-bonds.ts';
import type { DamageType, PhaseResult } from '../../types.ts';
import type { OverrideContext } from './index.ts';
import type { GenericModel } from '../generic.ts';
import type { BattleEffects } from '../../effects/common.ts';
import type { StatModifier } from '../../stats.ts';
import { stats } from '../../stats.ts';
import { damage, type CombatTarget } from '../../damage.ts';
import { splashPerAttack, splashReady } from '../../effects/equips.ts';

/** 默认按目标被阻挡计算；未阻挡护盾和移动明力开关单独指定状态。 */
export function isBlocked(boss: CombatTarget): boolean {
  return !boss.enabledMechanics?.some(m => m.id === 'unblocked_shield' || m.id === 'moving_might');
}

// 盟约说明与PRTS：独立的本体伤害可以触发奥术；逐击行为尚无模式内实测。不继承普攻装备触发器。
export function arcaneOnly(effects: BattleEffects): BattleEffects {
  return { ...effects, extraHits: effects.extraHits.filter(hit => hit.source === 'bond:arcaneShip') };
}

export interface PhaseOptions {
  ownerActions?: number; // 每个建模攻击间隔内，本体对敌执行的攻击动作数。
  active?: boolean;
  modifiers?: StatModifier[];
  type?: DamageType;
  scale?: number;
  hits?: number;
  interval?: number;
  fixedInterval?: number;
  resReductionFixed?: number;
  resReductionPct?: number;
  resPenetrationFixed?: number;
  resPenetrationPct?: number;
  elapsed?: number;
  damageEvents?: number;
  attackAdd?: number;
  artsHitAdd?: number;
  /** 六人卡西米尔附带真伤是否计入本阶段（缺省计入，由时间轴按窗口结算）。 */
  kazimierzActive?: boolean;
}
/** 精建只替换干员机制；外部乘区与逐击装备沿用同一公式。 */
export function phase(context: OverrideContext, external: BattleEffects, options: PhaseOptions = {}): PhaseResult {
  const { tier, boss, skill } = context;
  const panel = stats({ ...tier.attributes, baseAttackTime: options.interval ?? tier.attributes.baseAttackTime }, [
    ...external.stats, ...(options.active ? external.skillStats : []),
    ...external.timedStats.filter(t => (options.elapsed ?? 0) < t.until).map(t => t.modifier), ...options.modifiers ?? [],
  ]);
  if (options.fixedInterval !== undefined) {
    panel.attackInterval = options.fixedInterval;
    panel.derivation.attackInterval.push({label:'固定伤害间隔（不受攻速影响）',value:options.fixedInterval,op:'set',source:`skill:${skill.skillId}`});
  }
  const type = options.type ?? 'arts';
  const hits = options.hits ?? 1;
  const params = (kind: DamageType, scale: number, add: number) => ({
    attack: panel.atk * scale + add + (kind === 'arts' ? options.artsHitAdd ?? 0 : 0),
    reductionFixed: kind === 'physical' ? external.defReductionFixed : external.resReductionFixed + (options.resReductionFixed ?? 0) + Math.min(external.resShred?.max ?? 0, (options.damageEvents ?? 0) * (external.resShred?.perHit ?? 0)),
    reductionPct: kind === 'arts' ? options.resReductionPct : 0,
    penetrationFixed: kind === 'physical' ? external.defPenetrationFixed : external.resPenetrationFixed + (options.resPenetrationFixed ?? 0),
    penetrationPct: kind === 'physical' ? external.defPenetrationPct : 1 - (1 - external.resPenetrationPct) * (1 - (options.resPenetrationPct ?? 0)),
  });
  // 弱点伤害（双模机械臂等）只转换本体攻击及附加伤害，持续伤害保持原类型。
  const hit = (kind: DamageType, scale: number, add = 0, proc?: BattleEffects['atkProc']) => damage({ proc,
    type: kind, ...params(kind, scale, add),
    target: boss,
    epDamageResistance: boss.attributes?.epDamageResistance ?? 0,
    modifiers: external.modifiers,
    weakness: external.weakness && { source: external.weakness.source, byType: { physical: params('physical', scale, add), arts: params('arts', scale, add) } },
  });
  const components: PhaseResult['components'] = [];
  const add = (kind: DamageType, scale: number, count: number, source: string, label: string, flat = 0, proc?: BattleEffects['atkProc']) => {
    const result = hit(kind, scale, flat, proc);
    const countsTowardDps = ['physical','arts','true','elemental'].includes(kind);
    const frequency = kind === 'none' ? 0 : count / panel.attackInterval;
    components.push({label, source, damageType:result.type,perHit:result.perHit,hitsPerAttack:count,hitsPerSec:frequency,
      dps: countsTowardDps ? result.perHit * frequency : 0,countsTowardDps,
      derivation:[...external.derivation,...result.derivation]});
  };
  add(type,(options.scale ?? 1)*external.attackScale,hits,options.active ? `skill:${skill.skillId}` : 'attack',options.active?'技能攻击':'普攻',options.attackAdd,external.atkProc);
  if (components[0].countsTowardDps) for (const extra of external.extraHits) add(extra.type,extra.scale,hits*extra.hits,extra.source,'附加伤害');
  // 动能轰击弩满层后每次攻击的追加伤害；分段重建时叠层已并入静态面板。
  const splash = external.splash;
  if (splash && components[0].countsTowardDps && splashReady(external, [...external.stats, ...options.modifiers ?? []])) {
    add(splash.type, splash.scale, splashPerAttack(panel.attackInterval, splash.probability, splash.cooldown), splash.source, '满层追加物理伤害');
  }
  if (external.judgment && options.ownerActions) {
    const proc = judgmentHit(external, boss, panel.attackInterval, options.elapsed ?? 0);
    if (proc) {
      const count = options.ownerActions;
      components.push({ ...proc, hitsPerAttack: count, hitsPerSec: proc.hitsPerSec * count, dps: proc.dps * count });
    }
  }
  if (external.kazimierz && options.ownerActions && options.kazimierzActive !== false) {
    // 盟约真伤独立结算，只继承公共伤判修正。时间窗口由时间轴按开技时刻结算。
    const modifiers = context.effectsAt?.(options.damageEvents ?? 0).modifiers ?? external.modifiers;
    components.push(kazimierzHit({ ...external, modifiers }, boss, panel, options.ownerActions)!);
  }
  // 伊比利亚持续法伤挂在本体造成伤害的目标上，按本单位当前攻击力每秒结算一次。
  if (options.ownerActions && components[0]!.countsTowardDps) for (const dot of external.dots) {
    const tick = damage({ attack: panel.atk, scale: dot.scale, type: dot.type, target: boss,
      reductionFixed: external.resReductionFixed + (options.resReductionFixed ?? 0) + Math.min(external.resShred?.max ?? 0, (options.damageEvents ?? 0) * (external.resShred?.perHit ?? 0)),
      reductionPct: options.resReductionPct, penetrationFixed: external.resPenetrationFixed + (options.resPenetrationFixed ?? 0),
      penetrationPct: 1 - (1 - external.resPenetrationPct) * (1 - (options.resPenetrationPct ?? 0)), modifiers: external.modifiers });
    components.push({ label: dot.label, source: dot.source, damageType: dot.type, perHit: tick.perHit, hitsPerAttack: 1,
      hitsPerSec: 1 / dot.interval, dps: tick.perHit / dot.interval, countsTowardDps: true, derivation: [...external.derivation, ...tick.derivation] });
  }
  return {stats:panel,components,dps:components.reduce((sum,c)=>sum+c.dps,0)};
}

export function overrideBase(model: GenericModel, tracksShred = false): GenericModel {
  const e = model.battle;
  const notes = [...e?.notes ?? []];
  if (e?.stacks.length || e?.bondStacks) notes.push('近似：装备叠层及临时盟约层数尚未逐事件重建');
  if (e?.resShred && !tracksShred) notes.push('近似：逐击减抗沿用此技能时间轴的伤害阶段，同一动作内的结算顺序未逐击验证');
  return {...model,rebuild:undefined,notes,unconsumed:[],ignoredKeys:[...e?.ignoredKeys ?? []],
    caveats:[...e?.caveats ?? [],'精建场景：单 Boss 静止于范围内、被阻挡；干员满血且不受击，额外目标不重复命中 Boss。',
      '近似：按时间分段连续伤害率积分，忽略逐帧攻击、前摇、弹道与切换重置；技能可用即开。']};
}

/** 一次动作本身造成的伤害：本次动作各伤害分项的单次伤害 × 段数，不含按独立每秒时钟结算的持续伤害（伊比利亚）。 */
export function actionDamage(phase: PhaseResult): number {
  return phase.components.reduce((sum, c) => sum + (c.countsTowardDps && !isDotSource(c.source) ? c.perHit * c.hitsPerAttack : 0), 0);
}
/** 阶段中按独立每秒时钟结算的持续伤害秒伤（伊比利亚）。 */
export function dotDps(phase: PhaseResult): number {
  return phase.components.reduce((sum, c) => sum + (c.countsTowardDps && isDotSource(c.source) ? c.dps : 0), 0);
}

/** 专属时间轴的首轮技能起止：时间轴自身已给出时保留，否则补上由技能机制推出的起止。 */
export function withFirstSkill(model: GenericModel, first: (result: import('../../timeline.ts').TimelineResult) => import('../../timeline.ts').FirstSkill | undefined): GenericModel {
  const inner = model.customTimeline;
  if (!inner) return model;
  model.customTimeline = (duration, hp) => {
    const result = inner(duration, hp);
    return result.firstSkill ? result : { ...result, firstSkill: first(result) };
  };
  return model;
}
