import { effectsCoverage } from './effects-coverage.ts';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import operatorsJson from '../src/data/generated/operators.json' with { type: 'json' };
import skillsJson from '../src/data/generated/skills.json' with { type: 'json' };
import meta from '../src/data/generated/meta.json' with { type: 'json' };
import { calculate } from '../src/engine/index.ts';
import { CORE_KEYS, CONDITION_WORDS, NON_DPS_KEYS } from '../src/engine/skills/description.ts';
import { rules } from '../src/engine/skills/rules.ts';
import type { OperatorData, SkillData } from '../src/engine/types.ts';
const operators = operatorsJson as unknown as OperatorData[];
const skills = skillsJson as unknown as Record<string, SkillData>;
const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const keys = new Map<string, number>();
const reasons = new Map<string, number>();
const counts = { exact: 0, approx: 0 };
const rows: string[] = [];
const showcase: string[] = [];
const core = { skill: 0, talentTrait: 0 };
const coreRows = { skill: 0, talentTrait: 0 };
const conditions = new Map<string, number>();
for (const operator of operators) for (const tier of ['a', 'b'] as const) for (const skillId of operator.skillIds) {
  const result = calculate({ charId: operator.charId, tier, skillId, equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10' });
  if (!Number.isFinite(result.totalDamage.value) || result.totalDamage.value < 0 || Number.isNaN(result.killTimeSec)) throw new Error(`计算结果无效：${operator.charId}/${tier}/${skillId}`);
  counts[result.accuracy]++;
  if (result.model === 'override') showcase.push(`| ${escape(operator.name)} | ${tier} | ${escape(skills[skillId].name)} | ${result.accuracy} | ${escape([...result.caveats, ...result.notes].join('；'))} |`);
  const unused = result.notes.flatMap(note => { const match = note.match(/^忽略了 (.+?)（键，(.+?)；/); return match ? [{ key: match[1], source: match[2] }] : []; });
  if (unused.some(item => item.source.startsWith('skill:') && CORE_KEYS.test(item.key))) coreRows.skill++;
  if (unused.some(item => !item.source.startsWith('skill:') && CORE_KEYS.test(item.key))) coreRows.talentTrait++;
  for (const item of unused) if (CORE_KEYS.test(item.key)) core[item.source.startsWith('skill:') ? 'skill' : 'talentTrait']++;
  for (const note of result.notes) if (note.startsWith('条件效果未建模：')) {
    const kind = note.slice('条件效果未建模：'.length).replace(/\{[^}]+\}/g, 'N').replace(/\d+(?:\.\d+)?/g, 'N');
    conditions.set(kind, (conditions.get(kind) ?? 0) + 1);
  }
  for (const key of new Set(unused.map(item => item.key))) keys.set(key, (keys.get(key) ?? 0) + 1);
  const categories = new Set(result.notes.map(note => {
    if (note.startsWith('条件效果未建模：')) return '条件效果未建模';
    if (note.includes('（键，')) return '未消费的 blackboard 键';
    if (note.includes('Boss关卡')) return 'Boss关卡属性/修饰器尚未核实';
    if (note.includes('Boss特殊')) return 'Boss特殊机制未建模';
    if (note.includes('卫戍特质')) return '卫戍特质未覆盖的条件/机制';
    if (note.includes('连续DPS')) return '连续积分，未模拟帧/前摇/弹道';
    if (note.includes('描述中规则未覆盖')) return '描述中的行为未完整确认';
    if (note.includes('手动/自动')) return '技力满即开、技能期间停止回复的通用假设';
    if (note.includes('召唤物')) return '召唤物未建模';
    if (note.includes('未识别的技能生命周期')) return '未识别的技能生命周期';
    if (note.includes('下次攻击')) return '下次攻击按完整攻击间隔替换';
    if (note.includes('攻击回复')) return '攻击回复连续折算';
    if (note.includes('受击回复')) return '受击回复按 Boss 持续攻击、攻击间隔连续折算';
    if (note.includes('弹药')) return '弹药按弹数×间隔估时';
    return note;
  }));
  for (const reason of categories) reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
  rows.push(`| ${operator.charId} ${escape(operator.name)} | ${tier} | ${skillId} ${escape(skills[skillId].name)} | ${result.model} | ${result.accuracy} | ${result.lifecycle} | ${unused.map(i => `\`${escape(i.source)}:${escape(i.key)}\``).join('、') || '—'} |`);
}
// 次数相同按字符编码排序（不用 localeCompare，避免不同系统语言环境排出不同顺序）
const sorted = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
const expected = operators.reduce((sum, op) => sum + op.skillIds.length * 2, 0);
if (rows.length !== expected || counts.exact + counts.approx !== expected) throw new Error('覆盖报告条目数不一致');
const report = `# 引擎覆盖报告\n\n由 \`npm run coverage\` 生成；数据 commit：\`${meta.commit}\`。\n\n${operators.length} 名干员 × 各自技能 × 两阶；目标 \`boss_1\` / \`mode_single_10\`；无盟约、无装备，计算窗口180秒（循环平均 = 180 秒总伤 ÷ 180）。\n\n未消费键按“每个计算输入出现一次”统计；来源单列保留。exact 仅反映本干员/技能：DPS键与描述行为已覆盖且生命周期已识别。全局注意事项在 caveats，非DPS键在 ignoredKeys，不影响 accuracy。\n\n## 规则及依据\n\n| 键 | 作用 | 适用前提 | 来源 |\n|---|---|---|---|\n${rules.map(r => `| \`${r.key}\` | ${r.effect} | ${escape(r.prerequisite)} | ${escape(r.evidence)} |`).join('\n')}\n\n生命周期仅按元数据和明确描述识别；\`duration\` 仅在规则确认的部署持续语句中消费，弹药数取描述的“装有/获得N发子弹/弹药”（可引用blackboard）。未识别的二次开启、切换、蓄力、弹药数量等均标 unknown，不模拟技能期。\n\n## 时间过程与范围\n\n- 自然回复使用 increment。迅捷以部署后180秒内代表时间轴的开技次数选择计算方式。开技不超过10次时，分别按成功、失败后的实际技力和施放时刻计算窗口伤害，再按各分支概率加权；超过10次时，按均匀确定序列逐次判定，取这条轨迹的窗口总伤。通用模型对第10次判定之后的额外分支采样并在结果中注明，专用模型可继续精确累加。平均DPS取窗口总伤除以时长，击杀用时沿用代表时间轴。 零时长技能续开至少间隔一个攻击间隔；攻击回复按完整普攻次数计算，技能期间停止回复。\n- 初始技力按 spCost × max(1,maxChargeTime) 封顶；每次只消耗一份 spCost，足够即开，不等待充满。\n- 受击回复默认 Boss 持续攻击该干员：攻击间隔取 enemy_database 的 baseAttackTime ÷ (attackSpeed/100)（攻速未定义按 100），每次受击回复技能数据的 increment 点，按连续速率折算；技力自然回复加成不作用于受击回复。\n- 连续阶段积分保留首轮初始技力、瞬时伤害、阶段切换与末尾不足一个周期；击杀按相同分段过程求解。未模拟帧、前摇与弹道，这些共同限制列入 caveats，不强制全量近似。\n- 无限持续不等于可永久存活；退场、生命流失、条件伤害、局部机制在 notes；开启的 Boss 机制写入伤害分项的 derivation，说明性机制与召唤物限制在 caveats 中报告；卫戍特质已确认战斗增益计入，未支持部分在 notes 报告。\n- 常见但未确认的 atk_scale（概率/条件）、attack@times、prob、duration、范围、额外伤害及sp恢复等键不凭名字套公式。\n\n## 未消费核心键\n\n按计算输入统计条数，同一输入在每类中最多计一次。键次数包含每个输入内的各条未消费记录。\n\n| 来源 | 计算条数 | 键次数 |\n|---|---:|---:|\n| 技能 | ${coreRows.skill} | ${core.skill} |\n| 天赋/特性 | ${coreRows.talentTrait} | ${core.talentTrait} |\n\n## 描述匹配边界\n\n条件词（依据游戏描述）：${CONDITION_WORDS.join('、')}。前置条件跨逗号保留，独立完整效果不传播条件，句号/分号/换行重置；这是保守作用域推断。“相当于/当前”的当、“同时”的时不作条件；“每次攻击造成/变为”的固定逐击模板不作累计计次条件，计次触发/叠层仍拒绝。专用规则优先。通用模板检查子句条件，并要求攻击间隔有明确的单位或倍率。攻击力+百分比进入面板百分比区；攻击力提升至/相当于攻击力的伤害进入攻击倍率（不重复乘面板）；攻速+数值直接加算；带秒数的间隔直接加算、带百分比的间隔百分比加算、显式×的间隔乘算；明确连续攻击次数进入多段。\n\nNON_DPS_KEYS（仍需描述确认，敌方承伤/属性转伤害不忽略）：\n\n${Object.entries(NON_DPS_KEYS).map(([key, why]) => '- ' + key + '：' + why).join('\n')}\n\n典型无法判定：深靛1“攻击间隔大幅度缩短”（-0.8无单位）；霜叶天赋“攻击间隔略微增大”（未说明秒数/比例）；蓝毒2 attack@times（描述为额外攻击2个目标，不能当同目标多段）；极光2“若目标已经处于冻结状态…”（条件倍率）；耀骑士临光2 times=3（护盾层数）；弹射技能 times（不保证同目标多段）。未覆盖的机制记录在各结果的 notes 中。\n\n## 条件效果未建模 Top 20\n\n按结果内去重的条件子句出现次数统计；占位符和阿拉伯数字统一为N，保留其他原文作为类型。\n\n| 子句类型 | 次数 |\n|---|---:|\n${sorted(conditions).slice(0, 20).map(([clause, count]) => '| ' + escape(clause) + ' | ' + count + ' |').join('\n')}\n\n## 精建干员\n\n以下包含两阶全部技能；accuracy 保留概率期望、无法确认的机制及外部效果限制，不以 override 代替 exact。\n\n| 干员 | 阶级 | 技能 | accuracy | 主要假设与限制 |\n|---|---|---|---|---|\n${showcase.join('\n')}\n\n## 全量明细\n\n| 干员 | 阶级 | 技能 | model | accuracy | 生命周期 | 未消费的键（含来源） |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}\n\n## 汇总\n\n共 ${rows.length} 条：exact **${counts.exact}**；approx **${counts.approx}**。\n\n### approx 原因（同一输入每类最多计一次，可重叠）\n\n| 原因 | 次数 |\n|---|---:|\n${sorted(reasons).map(([reason, count]) => `| ${escape(reason)} | ${count} |`).join('\n')}\n\n### 未消费键 Top 30\n\n| 键 | 次数 |\n|---|---:|\n${sorted(keys).slice(0, 30).map(([key, count]) => `| \`${escape(key)}\` | ${count} |`).join('\n')}\n`;
await writeFile(fileURLToPath(new URL('../docs/engine-coverage.md', import.meta.url)), report + effectsCoverage());
console.log(`覆盖 ${rows.length}/${expected} 条，exact=${counts.exact}，approx=${counts.approx}；docs/engine-coverage.md`);
console.log('核心键未消费条数/键次数：', coreRows, core);
console.log('近似原因Top5：', sorted(reasons).slice(0, 5));
