import { clauses, matchDescription } from './description.ts';
import type { Blackboard, DerivationStep } from '../types.ts';
import type { StatModifier } from '../stats.ts';
export interface RuleContext {
  kind: 'skill' | 'talent' | 'trait';
  source: string;
  prefabId: string | null;
  description: string;
  blackboard: Blackboard;
}
export type RuleEffect = 'atkPct' | 'speed' | 'attackScale' | 'hits' | 'defReductionPct' | 'resReductionPct' | 'resPenetrationFixed' | 'intervalPct' | 'intervalAdd' | 'intervalMul' | 'deployDuration' | 'ammoCount';
export interface BlackboardRule {
  key: string;
  effect: RuleEffect;
  prerequisite: string;
  evidence: string;
  applies(context: RuleContext): boolean;
}
export const plain = (text: string | null | undefined) => (text ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n');
const skill = (c: RuleContext) => c.kind === 'skill';
const prefab = (...ids: string[]) => (c: RuleContext) => skill(c) && ids.includes(c.prefabId ?? '');
// 规则只确认局部语义，不宣称整段描述已经建模；未覆盖的行为由 generic 单独报告。
export const rules: BlackboardRule[] = [
  { key: 'duration', effect: 'deployDuration', prerequisite: '技能明确部署后在{duration}秒内生效', evidence: 'skills.json skchr_utage_2 description：部署后…在{duration}秒内',
    applies: c => skill(c) && /部署后/.test(plain(c.description)) && /(?:部署后|在)\{duration\}秒内/.test(plain(c.description)) },
  ...['attack@trigger_time', 'trigger_time'].map((key): BlackboardRule => ({ key, effect: 'ammoCount', prerequisite: '技能描述明确装有{该键}发子弹/弹药；只确认初始弹数，不确认消耗条件', evidence: 'skills.json AMMO技能 description 与占位符对照',
    applies: c => skill(c) && (plain(c.description).includes(`装有{${key}}发子弹`) || plain(c.description).includes(`装有{${key}}发弹药`)) })),
  { key: 'atk', effect: 'atkPct', prerequisite: '技能中明确的自身攻击力 +{atk:0%}，非条件/叠层/衰减/友军加成',
    evidence: 'skills.json 各等级 description；例如 skchr_bluep_2 / skchr_surtr_2 的攻击力+{atk:0%}',
    applies: c => skill(c) && /(?:^|[，；：\n]|自身|内)攻击力\+\{atk:0%\}/.test(plain(c.description)) && !/叠加|衰减|逐渐|每.*攻击力|几率.*攻击力|友方.*攻击力/.test(plain(c.description).split('攻击力+{atk:0%}')[0]) },
  { key: 'attack_speed', effect: 'speed', prerequisite: '技能明确无条件攻击速度+{attack_speed}', evidence: 'skills.json description 攻击速度+{attack_speed}；PRTS 游戏数据基础',
    applies: c => skill(c) && /攻击速度\+\{attack_speed\}/.test(plain(c.description)) && !/叠加|逐渐|每次|几率/.test(plain(c.description).split('攻击速度')[0]) },
  { key: 'atk_scale', effect: 'attackScale', prerequisite: '技能明确本次攻击倍率，排除概率、条件、持续伤害、护盾和治疗', evidence: 'skills.json：skchr_surtr_1、skchr_bluep_1 等 description 的攻击力提升至/相当于攻击力',
    applies: c => skill(c) && /(?:攻击力提升至|攻击力提高至|攻击力|攻击力的)\{atk_scale:0%\}/.test(plain(c.description)) && !/几率|概率|若|如果.*攻击力|每秒|护盾|屏障|治疗|冻结|额外造成|受到攻击/.test(plain(c.description)) },
  { key: 'def', effect: 'defReductionPct', prerequisite: '仅 skchr_slbell_2 敌方百分比减防；负值是目标减益，非自身防御提升', evidence: 'skills.json skchr_slbell_2 description：所有敌人防御力-{-def:0%}', applies: prefab('skchr_slbell_2') },
  { key: 'magic_resistance', effect: 'resReductionPct', prerequisite: '仅 skchr_slbell_2 敌方百分比减抗', evidence: 'skills.json skchr_slbell_2 description：法术抗性-{-magic_resistance:0%}', applies: prefab('skchr_slbell_2') },
  { key: 'damage_scale', effect: 'attackScale', prerequisite: '仅 skchr_aglina_2：描述为相当于攻击力，属于基本伤害倍率，不是最终增伤', evidence: 'skills.json skchr_aglina_2 description：相当于攻击力{damage_scale:0%}的法术伤害', applies: prefab('skchr_aglina_2') },
  { key: 'times', effect: 'hits', prerequisite: '仅 archet_2 的对目标多次攻击、phatm2_1 的两次攻击；不含弹跳次数/护盾层数', evidence: 'skills.json skchr_archet_2 / skchr_phatm2_1 description 对照', applies: prefab('skchr_archet_2', 'skchr_phatm2_1') },
  { key: 'base_attack_time', effect: 'intervalAdd', prerequisite: '沙缚镣锁与明灭按秒加算基础攻击间隔',
    evidence: 'skills.json 两技能的 base_attack_time，单位见 https://prts.wiki/w/卡涅利安#沙缚镣锁 和 https://prts.wiki/w/薇薇安娜#“明灭”', applies: prefab('skchr_billro_2', 'skchr_vvana_3') },
  { key: 'base_attack_time', effect: 'intervalPct', prerequisite: '仅 skchr_aurora_2 的基础间隔百分比加算', evidence: 'https://prts.wiki/w/极光 及 skills.json skchr_aurora_2：间隔+25%（直接乘算区加算）；不是加0.25秒或乘0.25', applies: prefab('skchr_aurora_2') },
  { key: 'base_attack_time', effect: 'intervalMul', prerequisite: '仅 skchr_indigo_2 的间隔直接乘算', evidence: 'https://prts.wiki/w/深靛 光影迷宫7级：攻击间隔×0.65', applies: prefab('skchr_indigo_2') },
  { key: 'magic_resist_penetrate_fixed', effect: 'resPenetrationFixed', prerequisite: '天赋完整描述为无视攻击目标N法术抗性', evidence: 'operators.json 史尔特尔天赋熔火：无视攻击目标20法术抗性；https://prts.wiki/w/数值范围',
    applies: c => c.kind === 'talent' && /^无视攻击目标\d+(?:\.\d+)?法术抗性$/.test(plain(c.description)) },
];
export interface Effects {
  stats: StatModifier[];
  attackScale: number;
  hits: number;
  defReductionPct: number;
  resReductionPct: number;
  resPenetrationFixed: number;
  derivation: DerivationStep[];
}
export const emptyEffects = (): Effects => ({ stats: [], attackScale: 1, hits: 1, defReductionPct: 0, resReductionPct: 0, resPenetrationFixed: 0, derivation: [] });
export function consume(context: RuleContext, effects: Effects, consumed: Set<string>, parsed = clauses(context)) {
  for (const [key, rawValue] of Object.entries(context.blackboard.nums)) {
    // 旧表的三个通用模板仍优先，但不能越过子句的前置/后置条件；逐prefab规则原样保留。
    const conditionalKey = ['atk', 'atk_scale', 'attack_speed'].includes(key) && parsed.some(c => c.conditional && (c.raw.includes(`{${key}}`) || c.raw.includes(`{${key}:`)));
    const explicit = conditionalKey ? undefined : rules.find(r => r.key === key && r.applies(context));
    const matched = explicit ? undefined : matchDescription(context, key, parsed);
    const rule = explicit ?? matched;
    const value = matched?.value ?? rawValue;
    if (!rule) continue;
    const source = `${context.source}:${key}`;
    const stat = (name: StatModifier['stat'], bucket: StatModifier['bucket']) => effects.stats.push({ stat: name, bucket, value, source });
    switch (rule.effect) {
      case 'deployDuration': case 'ammoCount': break; // 生命周期使用，保留来源推导。
      case 'atkPct': stat('atk', 'pct'); break;
      case 'speed': stat('attackSpeed', 'direct'); break;
      case 'intervalAdd': stat('attackInterval', 'direct'); break;
      case 'intervalPct': stat('attackInterval', 'pct'); break;
      case 'intervalMul': stat('attackInterval', 'mul'); break;
      case 'attackScale': effects.attackScale *= value; break;
      case 'hits': effects.hits *= value; break;
      case 'defReductionPct': effects.defReductionPct = 1 - (1 - effects.defReductionPct) * (1 + value); break;
      case 'resReductionPct': effects.resReductionPct = 1 - (1 - effects.resReductionPct) * (1 + value); break;
      case 'resPenetrationFixed': effects.resPenetrationFixed += value; break;
    }
    consumed.add(key);
    effects.derivation.push({ label: `${key} → ${rule.effect}；依据：${rule.evidence}`, value, op: 'info', source });
  }
}
