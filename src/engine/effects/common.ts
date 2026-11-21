import type { DamageModifier } from '../damage.ts';
import type { StatModifier } from '../stats.ts';
import type { DamageType, DerivationStep } from '../types.ts';

export interface StackEffect {
  trigger: 'skill' | 'attack' | 'second';
  max: number;
  modifier: StatModifier;
}
export interface BattleEffects {
  judgment?: { until: number; damage: number; probability: number };
  /** 六人卡西米尔：部署后与每次开技后 duration 秒内，每次本体攻击附带 scale 倍攻击力真伤。 */
  kazimierz?: { scale: number; duration: number };
  /** 以本单位当前攻击力为基数、每秒结算的持续伤害（伊比利亚持续法伤，按叠满层数折算后的倍率）。 */
  dots: { type: DamageType; scale: number; interval: number; source: string; label: string }[];
  /** 与本干员动作无关、从部署起按固定间隔结算的伤害（六人叙拉古异常状态真伤）。 */
  periodic: { type: DamageType; damage: number; interval: number; source: string; label: string }[];
  /** 界面展示用的假设说明：忽略、直接按上限、默认敌人状态等。 */
  assumptions: string[];
  quicksand?: { interval: number; firstDelay: number; damage: number; skillDamage: number };
  timedStats: { until: number; modifier: StatModifier }[];
  /**
   * 按部署后时间变化的伤害倍率（卡西米尔竞技旗）：[from, until) 秒内本单位造成的伤害 ×scale。
   * 与其他增伤分区相乘，由计算入口按时间过程折入总伤；面板快照不含。
   */
  timedDamageScale: { from: number; until: number; scale: number; source: string }[];
  /** 法术伤害附带的灼燃损伤：每造成 1 点法术伤害积累 ratio 点灼燃损伤（灼燃维式重锤）。 */
  burning?: { ratio: number; source: string };
  /** 侵蚀爆发后的冷却恢复速度增量，普通、精锐棋子的层数门槛不同。 */
  erosionRecoverySpeed?: number;
  /** 每次本体伤害有 probability 概率使该次攻击力 ×scale（动能单手弩）。 */
  atkProc?: { probability: number; scale: number; source: string };
  /**
   * 攻速叠层达到上限后，每次攻击有 probability 概率追加一段 scale 倍攻击力的伤害，两次之间至少间隔 cooldown 秒（动能轰击弩）。
   * fullAt：叠满时该来源的攻速加成合计。
   */
  splash?: { probability: number; scale: number; cooldown: number; type: DamageType; fullAt: number; source: string };
  /**
   * 本单位造成的物理和法术伤害转为弱点伤害（双模机械臂、卫戍特质「弱点伤害」）：每段按物理、法术各结算一遍取较高者。
   * 只作用于本体攻击及其附加伤害；持续伤害、地面与盟约独立结算的伤害保持原类型。
   */
  weakness?: { source: string };
  bondStacks?: { perDamage: number; max: number; source: string };
  resShred?: { perHit: number; max: number; source: string };
  stats: StatModifier[];
  skillStats: StatModifier[];
  modifiers: DamageModifier[];
  extraHits: { type: DamageType; scale: number; hits: number; source: string }[];
  defReductionFixed: number;
  resReductionFixed: number;
  defPenetrationPct: number;
  resPenetrationPct: number;
  defPenetrationFixed: number;
  resPenetrationFixed: number;
  attackScale: number;
  spRecovery: number;
  skillEndSp: number;
  skillEndProbability: number;
  initSp: number;
  spCostScale: number;
  spCostMin: number;
  stacks: StackEffect[];
  derivation: DerivationStep[];
  notes: string[];
  caveats: string[];
  ignoredKeys: string[];
}
export function battleEffects(): BattleEffects {
  return { dots: [], periodic: [], assumptions: [], timedStats: [], timedDamageScale: [], stats: [], skillStats: [], modifiers: [], extraHits: [], defReductionFixed: 0, resReductionFixed: 0,
    defPenetrationPct: 0, resPenetrationPct: 0, defPenetrationFixed: 0, resPenetrationFixed: 0,
    attackScale: 1, spRecovery: 0, skillEndSp: 0, skillEndProbability: 0, initSp: 0, spCostScale: 1, spCostMin: 0,
    stacks: [], derivation: [], notes: [], caveats: [], ignoredKeys: [] };
}
export type ModelStatus = '已建模' | '部分' | '未建模' | '与 DPS 无关';
export interface Coverage { status: ModelStatus; reason: string }
export function record(e: Pick<BattleEffects, 'derivation'>, source: string, label: string, value: number) {
  e.derivation.push({ source, label, value, op: 'info' });
}
