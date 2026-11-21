import type { BossData, BossMechanic, CalcInput, DamageComponent, DamageType, DerivationStep } from './types.ts';
/** 弱点判定的两个概率分支可命中不同伤害类型。 */
export function artsFraction(c: DamageComponent): number {
  return c.derivation.find(step => step.source === 'formula:artsFraction')?.value ?? Number(c.damageType === 'arts');
}
export interface CombatTarget extends BossData {
  enabledMechanics?: BossMechanic[];
  baseAttributes?: BossData['attributes'];
}

export function combatTarget(boss: BossData, switches: CalcInput['bossMechanics']): CombatTarget {
  const enabled = boss.mechanics?.filter(m => m.effect && (switches?.[m.id] ?? m.defaultOn));
  if (!enabled?.length) return boss;
  const attributes = boss.attributes && { ...boss.attributes };
  if (attributes) {
    // 目标自身面板先加固定值，再乘防御倍率；随后才结算我方减防、减抗和穿透。
    for (const { effect } of enabled) {
      attributes.def += effect!.defAdd ?? 0;
      attributes.magicResistance += effect!.resAdd ?? 0;
    }
    for (const { effect } of enabled) attributes.def *= effect!.defScale ?? 1;
  }
  return { ...boss, attributes, baseAttributes: boss.attributes, enabledMechanics: enabled };
}

export interface DamageModifier {
  group: string;
  kind: 'increase' | 'fragile' | 'reduction';
  value: number;
  types?: DamageType[];
  active?: boolean;
  source?: string;
}
export interface DamageInput {
  attack: number;
  type: DamageType;
  scale?: number;
  hits?: number;
  target?: CombatTarget;
  defense?: number;
  resistance?: number;
  epDamageResistance?: number;
  reductionFixed?: number;
  reductionPct?: number;
  penetrationFixed?: number;
  penetrationPct?: number;
  modifiers?: DamageModifier[];
  /** 每段有 probability 概率使该次攻击力 ×scale：逐段伤害取两种结算按成功占比加权。 */
  proc?: { probability: number; scale: number; source: string };
  /**
   * 弱点伤害结算：本段物理或法术伤害分别按物理、法术各走一遍完整流程，取较高者，并按实际取的类型记录。
   * byType 给出两种类型各自的减防/减抗与穿透（以及只对某一类型生效的攻击力加值），缺省沿用本输入。
   */
  weakness?: WeaknessSettlement;
}
export type WeaknessType = 'physical' | 'arts';
export type WeaknessParams = Partial<Pick<DamageInput, 'attack' | 'defense' | 'resistance' | 'reductionFixed' | 'reductionPct' | 'penetrationFixed' | 'penetrationPct'>>;
export interface WeaknessSettlement {
  source: string;
  byType?: Partial<Record<WeaknessType, WeaknessParams>>;
}
export interface DamageResult {
  perHit: number;
  total: number;
  derivation: DerivationStep[];
  /** 实际结算的伤害类型：弱点伤害为取到的那一种，其余与输入相同。 */
  type: DamageType;
}
const typeName: Record<WeaknessType, string> = { physical: '物理', arts: '法术' };
/**
 * 弱点伤害：把这一段伤害分别按物理伤害和法术伤害各算一遍（防御/法抗、穿透、减防/减抗、5% 保底、增伤与脆弱都按各自类型结算），
 * 造成其中更高的那一种；两者相等时保持原类型。规则来源：游戏内「弱点伤害」说明「根据敌人的防御力与法术抗性变换伤害类型」及玩家确认的取较高者口径。
 */
function weaknessDamage(input: DamageInput & { weakness: WeaknessSettlement; type: WeaknessType }): DamageResult {
  const { weakness, ...rest } = input;
  const as = (type: WeaknessType) => damage({ ...rest, ...weakness.byType?.[type], type });
  const physical = as('physical');
  const arts = as('arts');
  const gap = physical.perHit - arts.perHit;
  const pick = Math.abs(gap) <= 1e-9 * Math.max(1, Math.abs(physical.perHit)) ? (input.type === 'physical' ? physical : arts) : gap > 0 ? physical : arts;
  const chosen = pick.type as WeaknessType;
  const defense = input.target?.attributes?.def ?? weakness.byType?.physical?.defense ?? input.defense ?? 0;
  const resistance = input.target?.attributes?.magicResistance ?? weakness.byType?.arts?.resistance ?? input.resistance ?? 0;
  const derivation: DerivationStep[] = [
    { label: '弱点伤害：按物理伤害结算的单段伤害', value: physical.perHit, op: 'set', source: weakness.source },
    { label: '弱点伤害：按法术伤害结算的单段伤害', value: arts.perHit, op: 'set', source: weakness.source },
    { label: `目标防御 ${defense}、法抗 ${resistance}，本段造成${typeName[chosen]}伤害`, value: pick.perHit, op: 'set', source: weakness.source },
    ...pick.derivation,
  ];
  return { ...pick, derivation };
}
// 公式及5%保底依据 https://prts.wiki/w/游戏数据基础。
export function damage(input: DamageInput): DamageResult {
  const { attack, type, scale = 1, hits = 1, proc } = input;
  if (proc && proc.probability > 0 && type !== 'none' && type !== 'heal') {
    // 攻击力提升作用于防御之前，物理伤害不是线性放大，两种结算分别过防御后再按成功占比加权。
    const base = damage({ ...input, proc: undefined, hits: 1 });
    const boosted = damage({ ...input, proc: undefined, hits: 1, scale: scale * proc.scale });
    const p = Math.min(1, proc.probability);
    const perHit = (1 - p) * base.perHit + p * boosted.perHit;
    const derivation = [...base.derivation.slice(0, -2),
      ...(base.type !== boosted.type && perHit > 0 ? [{ label:'两个概率分支的实际法伤占比',
        value:((base.type === 'arts' ? (1 - p) * base.perHit : 0) + (boosted.type === 'arts' ? p * boosted.perHit : 0)) / perHit,
        op:'info' as const, source:'formula:artsFraction' }] : []),
      { label: `概率提升攻击力后的单段伤害（攻击力 ×${proc.scale}）`, value: boosted.perHit, op: 'info' as const, source: proc.source },
      { label: '提升攻击力的判定成功占比', value: p, op: 'info' as const, source: proc.source },
      { label: '单段最终伤害（按成功占比加权）', value: perHit, op: 'set' as const, source: proc.source },
      { label: '每次攻击段数', value: hits, op: 'mul' as const, source: 'rule:times' }];
    return { perHit, total: perHit * hits, derivation, type: base.type };
  }
  // 概率提升攻击力在前：成功与失败两种结算各自择弱，再按成功占比加权。
  if (input.weakness && (type === 'physical' || type === 'arts')) return weaknessDamage({ ...input, weakness: input.weakness, type });
  const derivation: DerivationStep[] = [];
  const step = (label: string, value: number, source = 'formula:damage', op: DerivationStep['op'] = 'set') => derivation.push({ label, value, op, source });
  const a = Math.max(0, attack * scale);
  step('面板攻击力', attack); step('本次攻击倍率（不进面板）', scale, 'rule:atk_scale', 'mul'); step('本次基本伤害 A', a);
  const target = input.target;
  const defense = type === 'physical' ? target?.attributes?.def ?? input.defense ?? 0
    : target?.attributes?.magicResistance ?? input.resistance ?? 0;
  const reduced = Math.max(0, (defense - (input.reductionFixed ?? 0)) * (1 - (input.reductionPct ?? 0)));
  const effective = (1 - (input.penetrationPct ?? 0)) * Math.max(0, reduced - (input.penetrationFixed ?? 0));
  step('目标基础防御/法抗', (type === 'physical' ? target?.baseAttributes?.def : target?.baseAttributes?.magicResistance) ?? defense);
  for (const m of target?.enabledMechanics ?? []) {
    const add = type === 'physical' ? m.effect!.defAdd : type === 'arts' ? m.effect!.resAdd : undefined;
    if (add !== undefined) step(m.name, add, `boss:${target!.bossId}:${m.id}`, 'add');
  }
  if (type === 'physical') for (const m of target?.enabledMechanics ?? []) {
    if (m.effect!.defScale !== undefined) step(m.name, m.effect!.defScale, `boss:${target!.bossId}:${m.id}`, 'mul');
  }
  step('目标固定减防/减抗', -(input.reductionFixed ?? 0), 'rule:target', 'add');
  step('目标百分比减防/减抗', 1 - (input.reductionPct ?? 0), 'rule:target', 'mul');
  step('目标减防/减抗后', reduced);
  step('攻击者固定穿透', -(input.penetrationFixed ?? 0), 'rule:penetration', 'add');
  step('攻击者百分比穿透', 1 - (input.penetrationPct ?? 0), 'rule:penetration', 'mul');
  step('穿透后有效防御/法抗', effective);
  let perHit = type === 'physical' ? Math.max(0.05 * a, a - effective) : type === 'arts' ? Math.max(0.05 * a, a * (1 - effective / 100)) : type === 'true' ? a : type === 'elemental' ? a * Math.max(0, 1 - (input.epDamageResistance ?? 0) / 100) : 0;
  step('逐段防御与5%保底后伤害', perHit);
  // PRTS 伤判效果：伤判修正在防御之后；同名脆弱仅取最高。https://prts.wiki/w/伤判效果
  const grouped = new Map<string, DamageModifier>();
  for (const modifier of input.modifiers ?? []) {
    if (modifier.active === false || (modifier.types && !modifier.types.includes(type))) continue;
    const key = `${modifier.kind}:${modifier.group}`;
    const old = grouped.get(key);
    grouped.set(key, old ? { ...modifier, value: modifier.kind === 'increase' ? old.value + modifier.value : Math.max(old.value, modifier.value) } : modifier);
  }
  for (const modifier of grouped.values()) {
    const factor = Math.max(0, 1 + (modifier.kind === 'reduction' ? -modifier.value : modifier.value));
    perHit *= factor; step(modifier.group, factor, modifier.source ?? 'formula:damage-groups', 'mul');
  }
  for (const m of target?.enabledMechanics ?? []) {
    const { damageTakenScale, damageTypes } = m.effect!;
    if (damageTakenScale !== undefined && (damageTypes ?? ['physical', 'arts', 'true']).includes(type)) {
      perHit *= damageTakenScale;
      step(m.name, damageTakenScale, `boss:${target!.bossId}:${m.id}`, 'mul');
    }
  }
  step('单段最终伤害', perHit); step('每次攻击段数', hits, 'rule:times', 'mul');
  return { perHit, total: perHit * hits, derivation, type };
}
