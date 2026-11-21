import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BossData, GameDataMeta, OperatorData, BondData, EquipData } from '../../src/engine/types.ts';
import { root } from '../fetch-gamedata.ts';

interface ExtractionReport { commit: string; diy: string[]; targets: string[]; spTypeRaw: string[]; issues: string[]; keys: Record<string, string[]> }
interface AssetReport {
  missing: { kind: string; id: string; name: string; reason: string }[];
  sources: unknown;
}
const inferenceNotes = [
  '基础面板用游戏属性曲线线性插值并保留小数。天赋、卫戍特质、盟约及装备道具的战斗加成在计算时单独处理。',
  'favorPoint 先用 favor_table.favorFrames 不超过该点数的帧取 battlePhase，再插值 favorKeyFrames。当前固定棋子两阶 favorPoint 全为 0，故信赖加成为 0。',
  '潜能缺省取 shop.backupCharPotRank，目前全部为 0。potentialSteps 逐阈值保存固定属性增量和实际生效的天赋、特性字段。费用和再部署时间的潜能变动不参与输出。模组等级取 status.equipLevel。',
  '天赋 candidate 按精英化/等级/潜能选择最高满足项；TALENT/TRAIT 为新增或替换，DATA_ONLY 按键覆盖而不相加；DISPLAY 仅合并描述。',
  'isToken 有 tokenKey 时精确匹配，无 tokenKey 时应用于实际关联召唤物（多召唤物情形逐项报告）；不把召唤物修正加到主人。',
  '模组部件带 validInMapTag 或 validInGameTag 限定时跳过该部件，例如机械师的 rogue_6 部件。根级模组属性仍按数据叠加。',
  '召唤物的原始空技能槽不生成引用；只有一个 levels 的固定技能保留真实等级 1，各阶通过 skillLevels[skillId] 指向它，多级技能跟随主人技能等级。',
  '召唤物的曲线以自身阶段和等级上限截断，依据主人潜能选择召唤物自己的候选及模组部件。TokenData 顶层天赋与范围使用默认费用阶下的最高已提取阶级。',
  'spType 原值 8 映射 PASSIVE，依据同仓 skill_table 的被动技能记录（例如宴落地技能），保留 spTypeRaw；1/2/4 为位标记对应自动/攻击/受击回复，未知值标 UNKNOWN。',
  'Boss 等级按 enemy_database level 0→目标等级继承；只有 m_defined=true 的上层字段覆盖。底层未定义的元素/免疫序列化默认值语义待核对，相关 Boss verified=false。',
  'Boss attributes.maxHp 为关卡敌人面板；hpByMode 为模式血条，两者分开保留。缺部分模式关卡时可保留已解析面板但不视为验证通过。',
  '提取流程保留盟约和装备的原始参数。伤害模型覆盖范围见引擎覆盖报告。',
];

export async function writeReport(): Promise<void> {
  const read = async <T>(path: string): Promise<T> => JSON.parse(await readFile(resolve(root, path), 'utf8')) as T;
  const meta = await read<GameDataMeta>('src/data/generated/meta.json');
  let extraction: ExtractionReport;
  let previousReport: string | null = null;
  try { extraction = await read<ExtractionReport>('.cache/extract-report.json'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    // 新克隆可直接给已提交的 JSON 下载图片，无需先下载原始数据；保留既有提取审计。
    previousReport = await readFile(resolve(root, 'docs/data-report.md'), 'utf8');
    if (!previousReport.includes(meta.commit)) throw new Error('既有数据报告与生成数据版本不一致，请先运行 npm run data');
    extraction = { commit: meta.commit, diy: [], targets: [], spTypeRaw: [], issues: [], keys: {} };
  }
  if (extraction.commit !== meta.commit) throw new Error('提取报告与生成数据版本不一致');
  const operators = await read<OperatorData[]>('src/data/generated/operators.json');
  const bosses = await read<BossData[]>('src/data/generated/bosses.json');
  const bonds = await read<BondData[]>('src/data/generated/bonds.json');
  const equips = await read<EquipData[]>('src/data/generated/equips.json');
  let assets: AssetReport | null = null;
  try { assets = await read<AssetReport>('.cache/assets-report.json'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const lines = [
    '# 数据提取报告', '',
    `来源：[${meta.source}](https://github.com/${meta.source}/tree/${meta.commit}/zh_CN/gamedata)`, '',
    `锁定 commit：\`${meta.commit}\`；数据版本：\`${meta.dataVersion}\`；活动：\`${meta.activityId}/V3_1\`。`, '',
    `运行 \`npm run data\` 提取数据，运行 \`npm run assets\` 获取素材。`, '',
    '## 数据数量', '', '| 数据 | 数量 |', '|---|---:|',
  ];
  for (const name of ['operators', 'garrisons', 'tokens', 'ranges', 'skills', 'bonds', 'equips', 'bosses', 'modes']) {
    const data = await read<unknown[] | Record<string, unknown>>(`src/data/generated/${name}.json`);
    lines.push(`| ${name} | ${Array.isArray(data) ? data.length : Object.keys(data).length} |`);
  }
  const options = operators.flatMap(op => op.uniEquips ?? []);
  lines.push('', `DIY/空槽共 ${extraction.diy.length} 个，包括 ${extraction.diy.map(id => `\`${id}\``).join('、')}。`, '',
    `自选干员包括${operators.filter(op => op.diy).map(op => op.name).join('、')}。五费与六费自选分别取对应的棋子状态，精锐模组分别为 1 级与 3 级。`, '',
    '五费阿米娅的 tmplId 指向医疗模板 char_1037_amiya3，职业、属性、技能和素材都使用该模板。四档练度倍率来自 autoChessData.cultivateEffectList 关联的 char_attribute_mul 黑板，见 meta.json。', '',
    '## 精锐模组自选', '',
    `从 uniequip_table.charEquip 按模板和游戏顺序读取，排除 INITIAL。共 ${options.length} 个选项，${operators.filter(op => op.uniEquips).length} 名干员有模组，其中 ${operators.filter(op => (op.uniEquips?.length ?? 0) > 1).length} 名有多个。ISW-A 与 RA-A 共 ${options.filter(option => option.attrOnly).length} 个，仅使用干员和召唤物的属性黑板。`, '',
    '先取当前费用阶的精锐状态，再取 uniEquipVariants[模组 ID]。属性按键覆盖为绝对值，特性与天赋槽按字段覆盖（blackboard 整体替换，null 删除）。同一补丁的天赋槽全部合并后再移除空槽。potentialSteps 存在时整表替换，再按所选潜能执行。缺省字段继承本费用阶的默认模组。召唤物使用相同规则。普通阶没有模组覆盖。', '',
    '仅属性模组的特性、天赋及潜能覆盖用于还原无模组状态。空弦精锐 1 级模组的攻击均为 427 + (528 − 427) × 59 / 89 + 32 ≈ 525.9551。ISW-A 攻速 106，MAR-X 攻速 100、生命额外 +90。', '',
    '## Boss 属性与映射', '',
    `通过 autoChessData.bossInfoDict[bossId].enemyId 映射；有面板 ${bosses.filter(b => b.attributes !== null).length}/${bosses.length}，verified=true ${bosses.filter(b => b.verified).length}/${bosses.length}。`, '',
    '| Boss | 敌人 | 面板 | verified |', '|---|---|---|---|');
  for (const boss of bosses) lines.push(`| ${boss.bossId} ${boss.name} | ${boss.enemyId ?? '缺失'} | ${boss.attributes ? `DEF ${boss.attributes.def} / RES ${boss.attributes.magicResistance}` : 'null（缺关卡或映射）'} | ${boss.verified} |`);
  lines.push('', '完整来源见 bosses.json.attributeSource；每个模式的缺关卡、修饰器和差异列在下文。', '',
    '## 装备、模组和技力', '',
    '装备名称取 character_table[trapId].name（profession=TRAP），缺失时取 effectInfoDataDict[effectId].effectName 并报告；当前使用的来源与覆盖数见问题列表。', '',
    `实际应用模组 target：${extraction.targets.map(t => `\`${t}\``).join('、')}。`, '',
    '- TALENT：talentIndex≥0 替换对应天赋；负数为新增运行时天赋，保留 prefabKey。',
    '- TRAIT：合并特性描述、替换参数；保留未改的 prefabKey/rangeId。',
    '- TALENT_DATA_ONLY / TRAIT_DATA_ONLY：按键替换参数，保留未提供的原始字段，不进行数值相加。',
    '- DISPLAY：仅合并显示描述，不把空 blackboard 覆盖运行时参数。',
    '- isToken：修正对应召唤物，tiers 分别保存。', '',
    `技能 spType 原值：${extraction.spTypeRaw.map(v => `\`${v}\``).join('、')}。`, '',
    '| 原值 | SpType |', '|---|---|',
    '| INCREASE_WITH_TIME / 1 | INCREASE_WITH_TIME |',
    '| INCREASE_WHEN_ATTACK / 2 | ON_ATTACK |',
    '| INCREASE_WHEN_TAKEN_DAMAGE / 4 | ON_DEFEND |',
    '| 8 / PASSIVE | PASSIVE |', '| 其他 | UNKNOWN（报告） |', '',
    '## 图片来源、覆盖率与缺图', '');
  const config = await read<{ sources: unknown }>('tools/assets.config.json');
  lines.push('来源配置（锁定资源 commit 和路径模板）：', '', '```json', JSON.stringify(config.sources, null, 2), '```', '',
    '| 类别 | 有图 / 总数 | 缺失 |', '|---|---:|---:|');
  const coverage = [
    ['干员头像', operators.filter(op => op.images.avatar).length, operators.length],
    ['干员立绘', operators.filter(op => op.images.portrait).length, operators.length],
    ['Boss', bosses.filter(b => b.image).length, bosses.length],
    ['盟约', bonds.filter(b => b.image).length, bonds.length],
    ['装备', equips.filter(e => e.image).length, equips.length],
  ] as const;
  for (const [kind, available, total] of coverage) lines.push(`| ${kind} | ${available} / ${total} | ${total - available} |`);
  lines.push('', '缺图逐条清单：', '');
  const missing: { kind: string; id: string; name: string }[] = [];
  for (const op of operators) {
    if (!op.images.avatar) missing.push({ kind: 'avatar', id: op.charId, name: op.name });
    if (!op.images.portrait) missing.push({ kind: 'portrait', id: op.charId, name: op.name });
  }
  for (const b of bosses) if (!b.image) missing.push({ kind: 'boss', id: b.bossId, name: b.name });
  for (const b of bonds) if (!b.image) missing.push({ kind: 'bond', id: b.bondId, name: b.name });
  for (const e of equips) if (!e.image) missing.push({ kind: 'equip', id: e.chessId, name: e.name });
  for (const item of missing) {
    const failure = assets?.missing.find(m => m.kind === item.kind && m.id === item.id);
    const reason = failure?.reason === '所有明确候选图片均为 HTTP 404/410' ? failure.reason
      : failure ? '素材获取失败，详情见 .cache/assets-report.json' : '素材脚本尚未成功获取';
    lines.push(`- ${item.kind} \`${item.id}\` ${item.name}：${reason}`);
  }
  lines.push('', '## 缺字段、待核对项与跨模式差异', '');
  for (const issue of extraction.issues) lines.push(`- ${issue}`);
  lines.push('', '## 尚未识别语义的 blackboard key', '', '仅清点盟约/装备参数；不声称任何 key 已有伤害模型。', '');
  for (const [group, keys] of Object.entries(extraction.keys)) lines.push(`### ${group}`, '', keys.map(k => `\`${k}\``).join('、'), '');
  lines.push('## 面板手算抽查', '',
    '蓝毒 b：精二 55 级基础 ATK = 438 + (535 − 438) × (55 − 1) / (80 − 1) = 504.3037974683544；信赖 0 → +0；潜能 0 → +0；uniequip_002_bluep 等级 1 → +20；合计 **524.3037974683544**。', '',
    '逻各斯 b：精二 60 级基础 ATK = 556 + (671 − 556) × 59 / 89 = 632.2359550561798；信赖 +0、潜能 +0、uniequip_003_logos 等级 3 +60；合计 **692.2359550561798**。', '',
    '## 推断清单', '', ...inferenceNotes.map(note => `- ${note}`), '',
    '## 缓存与素材获取', '',
    '- fetch-gamedata.ts 通过解析 JSON 校验缓存，下载成功后原子替换失效文件。',
    '- npm run assets 使用 sharp 转码，缺图路径保留为 null。', '',
  );
  let content = lines.join('\n');
  if (previousReport !== null) {
    const section = /^## 图片来源、覆盖率与缺图\n[\s\S]*?(?=^## )/m;
    const imageSection = content.match(section)?.[0];
    if (!imageSection || !section.test(previousReport)) throw new Error('既有报告缺少图片段落，不能安全更新');
    content = previousReport.replace(section, () => imageSection);
  }
  await writeFile(resolve(root, 'docs/data-report.md'), content);
}
