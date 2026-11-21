import type { RuleContext, RuleEffect } from './rules.ts';

export const CORE_KEYS = /^(?:attack@)?(?:atk|atk_scale|attack_speed|base_attack_time|damage_scale|times)$/;
// 根据游戏描述判断条件作用域：前置条件跨逗号延续，独立完整效果不传播条件；句号、分号或换行重置。
// “同时”不是条件；“持续时间”不是条件从句；计次触发与叠层仍拒绝。
export const CONDITION_WORDS = ['当', '若', '如果', '概率', '几率', '低于', '高于', '每', '对…的敌人', '周围', '范围内有', '阻挡', '被', '第…次', '期间受到', '击倒', '首次', '叠加', '最多', '至多', '时（条件从句）', '逐渐', '衰减', '蓄力'];
export const conditional = (text: string) => {
  // “时”用于识别条件从句，“每”用于识别计次或叠层；固定逐击描述不附加触发条件。
  const conditionText = text.replace(/相当于|同时|当前/g, '')
    .replace(/每次(?:攻击|射击)(?=造成|对目标造成|变为|的攻击力提升至|只能造成)/g, '攻击')
    .replace(/每次(?=造成(?:相当于|攻击力|\{|\d))/, '')
    .replace(/^(?:下次)?攻击时(?=攻击力|连续(?:攻击|射击))/, '攻击');
  return /当|若|如果|概率|几率|低于|高于|每|对[^，；。\n]*的敌人|周围|范围内有|阻挡|被|第[^，；。\n]*次|期间受到|击倒|首次|叠加|最多|至多|逐渐|衰减|蓄力/.test(conditionText) || /时(?!间)/.test(conditionText);
};
const plainText = (text: string) => (text ?? '').replace(/<[^>]*>/g, '').replace(/\\n/g, '\n');
export function render(description: string, context: RuleContext): string {
  return plainText(description).replace(/\{(-?)([^}:]+)(?::([^}]+))?\}/g, (all, sign: string, key: string, format: string | undefined) => {
    const value = context.blackboard.nums[key];
    if (value === undefined) return all;
    const n = value * (sign ? -1 : 1) * (format?.includes('%') ? 100 : 1);
    const decimals = format?.match(/\.(0+)/)?.[1].length ?? 0;
    return (format ? n.toFixed(decimals) : String(n)) + (format?.includes('%') ? '%' : '');
  });
}
export function clauses(context: RuleContext) {
  return plainText(context.description).split(/[。；;\n]/).flatMap(sentence => {
    let inherited = false;
    return sentence.split(/[，,]/).filter(Boolean).map(raw => {
      // “不会低于/高于”是独立保底/上限效果；裸阈值及明确当/若/时条件仍跨逗号传播。
      const front = /^(?:当(?!前)|若|如果)/.test(raw) || /时[：:]?$/.test(raw)
        || /低于|高于|范围内有|每击倒|每攻击/.test(raw.replace(/不会(?:低于|高于)/g, '')) && !/[+＋]|造成/.test(raw);
      const frontConditional = inherited || front;
      const isConditional = frontConditional || conditional(raw);
      // 仅明确前置条件跨逗号传播，完整效果的修饰词留在本子句。
      inherited = frontConditional;
      return { raw, text: render(raw, context), conditional: isConditional, frontConditional };
    });
  });
}
// 每项仅在下方确认己方/治疗语义后忽略；敌方承伤及防御转伤害绝不按名字忽略。
export const NON_DPS_KEYS: Record<string, string> = {
  def: '己方防御提升不改变单体攻击伤害',
  magic_resistance: '己方法抗提升只影响生存',
  max_hp: '己方生命上限只影响生存；生命转伤害除外',
  heal_scale: '治疗倍率不计扣血DPS',
  'hp_recovery_*': '生命回复只影响生存',
  block_cnt: '阻挡数量不改变单目标攻击；按阻挡数增伤除外',
  taunt_level: '嘲讽只改变敌方选取目标',
  move_speed: '移动速度不改变固定目标的单体伤害',
  cost: '部署费用不参与已部署干员DPS',
  damage_resistance: '己方减伤只影响生存',
  hp_ratio: '仅治疗/生存条件的生命比例，不含生命转伤害或攻速条件',
};
export function nonDps(context: RuleContext, key: string): boolean {
  const k = key.replace(/^attack@/, '');
  if (!(k in NON_DPS_KEYS) && !k.startsWith('hp_recovery_')) return false;
  const text = render(context.description, context);
  if (/脆弱|易伤|无视|穿透|防御.*(?:攻击|伤害)|生命.*(?:攻击力|攻击速度|造成)|阻挡数.*(?:攻击|伤害)/.test(text)) return false;
  if (k === 'move_speed') return /移动速度/.test(text);
  if (k === 'cost') return /费用/.test(text);
  if (k === 'taunt_level') return /容易受到|嘲讽/.test(text);
  if (k === 'block_cnt') return /阻挡数/.test(text);
  if (k === 'heal_scale' || k.startsWith('hp_recovery_') || k === 'hp_ratio') return /治疗|回复.*生命|恢复.*生命|生命.*回复|生命.*恢复|庇护|受到.*伤害.*降低/.test(text) && !/攻击力|攻击速度|造成.*伤害|流失/.test(text);
  if (k === 'damage_resistance') return /庇护|受到.*伤害.*降低/.test(text) && !/敌人|目标受到/.test(text);
  if (k === 'max_hp') return /生命/.test(text) && !/流失|造成/.test(text);
  return !/敌人|敌方|目标|降低|减少|削弱/.test(text) && /防御力|法术抗性/.test(text);
}
export function matchDescription(context: RuleContext, key: string, parsed = clauses(context)): { effect: RuleEffect; value: number; evidence: string } | undefined {
  if (!CORE_KEYS.test(key)) return;
  const value = context.blackboard.nums[key];
  if (!Number.isFinite(value)) return;
  const matches: { effect: RuleEffect; value: number; evidence: string }[] = [];
  for (const clause of parsed) {
    if (clause.conditional || /友方|友军|其他干员|额外|治疗|护盾|弹射|持续伤害/.test(clause.text)) continue;
    // 优先占位符归属；无占位符才按完整数值匹配，防止50误匹配150。
    const placeholders = [...clause.raw.matchAll(/\{(-?)([^}:]+)(?::[^}]+)?\}/g)];
    if (placeholders.length && !placeholders.some(m => m[2] === key)) continue;
    let marked = clause.raw.replace(/\{(-?)([^}:]+)(?::([^}]+))?\}/g, (all, sign: string, k: string, format: string | undefined) => k === key && !sign ? `§${format?.includes('%') ? '%' : ''}` : all);
    if (!placeholders.length) {
      marked = clause.text.replace(/(?<![\d.])-?\d+(?:\.\d+)?%?/g, token => {
        const n = Number(token.replace('%', '')) / (token.endsWith('%') ? 100 : 1);
        return Math.abs(n - value) < 1e-8 ? `§${token.endsWith('%') ? '%' : ''}` : token;
      });
      if (key.endsWith('times') && Number.isInteger(value) && value >= 1 && value <= 9) marked = marked.replace('一二三四五六七八九'[value - 1], '§').replace(value === 2 ? '两' : '\0', '§');
    }
    let effect: RuleEffect | undefined;
    let applied = value;
    if (/攻击力(?:(?:、防御力和生命上限|和防御力)各)?\+§%/.test(marked) && /^(?:attack@)?atk$/.test(key)) effect = 'atkPct';
    else if (/攻击速度\+§/.test(marked)) effect = 'speed';
    // “提升至”表示本次基础伤害倍率，放在damage.scale，不重复乘面板。
    else if (/攻击力(?:提升至|提高至|的)?§%|§%攻击力的.*伤害/.test(marked) && !/受到|减伤|增伤|脆弱|易伤/.test(marked)) effect = 'attackScale';
    else if (/(?:连续)?攻击§次|§次攻击|§连(?:击|射|发)/.test(marked) && Number.isInteger(value) && value > 0) effect = 'hits';
    else if (/攻击间隔/.test(marked)) {
      if (/[×x]§/.test(marked) && value > 0) effect = 'intervalMul';
      else if (/攻击间隔(?:延长|缩短|增加|减少|\+|-)§(?:%|秒)/.test(marked)) {
        effect = marked.includes('§%') ? 'intervalPct' : 'intervalAdd';
        applied = /缩短|减少|-§/.test(marked) ? -Math.abs(value) : value;
      }
    }
    if (effect && /生命/.test(marked) && !/攻击力、?防御力和生命上限各/.test(marked)) effect = undefined;
    if (effect) matches.push({ effect, value: applied, evidence: `同一对象描述：${clause.raw}；渲染：${clause.text}` });
  }
  // shortcut: 多处同值/同键语义不猜唯一归属，精建或增加明确模板后再消费。
  return matches.length === 1 ? matches[0] : undefined;
}
