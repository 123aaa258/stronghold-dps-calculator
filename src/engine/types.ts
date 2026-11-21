/**
 * 引擎与数据的对外接口。
 * 工程侧可以修改，但必须在汇报「偏离说明」里写明改了什么、为什么。
 *
 * 两部分：
 *  A. 生成数据的形状：src/data/generated/*.json 必须符合这些类型
 *  B. 计算接口：calculate(input) → CalcResult
 */

// ───────────────────────── A. 生成数据 ─────────────────────────

/** 富文本：保留游戏原始标记（如 <@ba.vup>+20%</>），界面负责渲染。 */
export type RichText = string;

/** 游戏 blackboard 的扁平化：key → number（valueStr 非空的放 strs）。 */
export interface Blackboard {
  nums: Record<string, number>;
  strs?: Record<string, string>;
}

export type Profession =
  | 'PIONEER' | 'WARRIOR' | 'TANK' | 'SNIPER' | 'CASTER' | 'MEDIC' | 'SUPPORT' | 'SPECIAL';

export type DamageType = 'physical' | 'arts' | 'true' | 'elemental' | 'heal' | 'none';

/** 天赋 / 特性（已按阶级的精英化、等级、潜能选好 candidate，并合并模组修正） */
export interface TalentData {
  index: number;                   // 天赋序号（特性用 -1）
  name: string;
  desc: RichText;
  prefabKey: string | null;
  rangeId: string | null;
  /** 召唤物关联（天赋 tokenKey） */
  tokenKey: string | null;
  blackboard: Blackboard;
  /** 模组修正记录：新增 / 覆盖 / 仅数据修正（TALENT_DATA_ONLY），便于核对 */
  equipMods: { equipId: string; mode: 'add' | 'override' | 'data_only'; target: string }[];
}

/** 卫戍特质（garrisonDataDict 原样保留，语义建模在引擎） */
export interface GarrisonData {
  garrisonId: string;
  desc: RichText;
  eventType: string;
  effectType: string;
  battleRuneKey: string | null;
  blackboard: Blackboard;
}

/** 显式选择潜能时，从棋子面板开始依次应用不超过目标 rank 的阈值。 */
export interface PotentialStep {
  rank: number;
  attributes?: Partial<AttributeSet>; // 相对于上一步的固定属性增量
  /** 键是数组位置，模组新增的多个天赋可共用 index=-1。字段覆盖，blackboard 整体替换。 */
  talents?: Record<number, Partial<TalentData> | null>;
  trait?: Partial<TalentData> | null;
}

export interface TokenTierData {
  /** 精锐非默认模组相对本费用阶默认状态的覆盖。属性为绝对值，天赋按数组槽覆盖（null 删除），潜能阈值整表替换。 */
  uniEquipVariants?: Record<string, Pick<PotentialStep, 'attributes' | 'talents' | 'trait'> & { potentialSteps?: PotentialStep[]; maxDeckStackCnt?: number; maxDeployCount?: number }>;
  attributes: AttributeSet;
  /** 陷阱的待部署库存上限，取召唤物自己的属性曲线。 */
  maxDeckStackCnt?: number;
  /** 模组涉及召唤物同时部署上限时保存曲线与模组之和。 */
  maxDeployCount?: number;
  skillLevel: number;
  /** 按主人阶级选择并应用 isToken 模组修正；顶层字段保留进阶阶级以兼容调用方。 */
  talents?: TalentData[];
  trait?: TalentData | null;
  rangeId?: string | null;
  /** 单级召唤物技能保持真实等级 1，其余按主人等级。 */
  skillLevels?: Record<string, number>;
  potentialSteps?: PotentialStep[];
}

/** 召唤物（只提取被干员实际引用的） */
export interface TokenData {
  tokenId: string;
  name: string;
  ownerCharIds: string[];
  /** 按主人阶级的面板（与主人同精英化/等级取值，含模组 tokenAttributeBlackboard） */
  tiers: Partial<Record<ChessTier, TokenTierData>>;
  /** 仅保存和默认费用阶有差异的召唤物状态；缺省回退到 tiers。 */
  diyVariants?: Partial<Record<number, Partial<Record<ChessTier, TokenTierData>>>>;
  skillIds: string[];
  talents: TalentData[];
  rangeId: string | null;
}

export interface RangeData {
  rangeId: string;
  grids: { row: number; col: number }[];
}

/** 棋子阶级：a = 普通，b = 进阶（金色） */
export type ChessTier = 'a' | 'b';

export interface AttributeSet {
  maxHp: number;
  atk: number;
  def: number;
  magicResistance: number;
  attackSpeed: number;      // 通常 100
  baseAttackTime: number;   // 秒
  cost: number;
  blockCnt: number;
  respawnTime: number;
}

/** 一个棋子阶级下的干员状态（已把精英化/等级/信赖/潜能/模组算进 attributes） */
export interface OperatorTierData {
  /** 精锐非默认模组相对本费用阶默认状态的覆盖。属性为绝对值，天赋按数组槽覆盖（null 删除），潜能阈值整表替换。 */
  uniEquipVariants?: TokenTierData['uniEquipVariants'];
  chessId: string;                 // chess_char_x_xx_a / _b
  evolvePhase: number;             // 0/1/2
  level: number;
  skillLevel: number;              // 1..10（7 以上为专精 1..3）
  potentialRank: number;           // 0..5
  potentialSteps?: PotentialStep[];
  favorPoint: number;
  uniEquipId: string | null;
  uniEquipLevel: number;           // 0 = 未装备
  /** 已含 精英化插值 + 信赖 + 潜能 + 模组属性 的面板（不含天赋、盟约、装备、技能） */
  attributes: AttributeSet;
  rangeId: string | null;
  /** 本阶级下的特性与天赋（不同阶级可能不同，如蓝毒精一/精二） */
  trait: TalentData | null;
  talents: TalentData[];
  /** 棋子自带描述（chess desc） */
  chessDesc: RichText | null;
  /** 卫戍特质，完整数据见 garrisons.json */
  garrisonIds: string[];
  equipSlotNum: number;
}

export interface OperatorData {
  charId: string;                  // char_xxx
  name: string;
  appellation: string;             // 英文名
  rarity: number;                  // 1..6
  profession: Profession;
  subProfessionId: string;
  /**
   * 可部署位置：MELEE 仅近战位 / RANGED 仅远程位 / ALL 两者皆可（如温蒂、歌蕾蒂娅）。依据 character_table.position 与「可放置于远程位」类特质。
   * 「所有远程干员」类效果按 RANGED 或 ALL 判定。
   */
  position: 'MELEE' | 'RANGED' | 'ALL';
  /** 卫戍协议中的费用阶（chessLevel，1..6） */
  shopLevel: number;
  bondIds: string[];
  defaultSkillIndex: number;
  skillIds: string[];              // 本模式可选技能（按游戏顺序）
  /** 关联召唤物 id（tokens.json） */
  tokenIds: string[];
  tiers: Record<ChessTier, OperatorTierData>;
  /** 素材相对路径（相对 public/），由 fetch-assets 生成；缺图时为 null */
  images: { avatar: string | null; portrait: string | null };
  /**
   * 自选干员（卫戍协议 DIY 棋子，diyChessDict）：不在商店池里，由玩家带入。界面单独打「自选干员」标签。
   * 盟约按势力取（如【炎】），无对应盟约的落到 constData.fallbackBondId（协防干员 emptyShip）。
   */
  diy?: boolean;
  /**
   * 自选干员在其他费用阶棋子下的两阶状态，键为 shopLevel（目前只有 5：chess_char_5_diy1，精锐模组 1 级）。
   * `tiers` 仍是默认的 6 阶。结构与 tiers 相同。
   */
  diyVariants?: Partial<Record<number, Record<ChessTier, OperatorTierData>>>;
  /**
   * 精锐阶本模式可选的模组（按游戏顺序，不含证章）。默认 = tiers.b.uniEquipId。
   * 每个模组的阶级状态由工程定义存储结构（如 uniEquipTiers），界面只用这个列表。
   */
  uniEquips?: UniEquipOption[];
}

export interface UniEquipOption {
  uniEquipId: string;              // uniequip_003_logos
  typeIcon: string;                // 大写，如 CCR-Y / ISW-A
  name: string;                    // 《语义范式百科》
  /** 集成战略（ISW-A）/ 生息演算（RA-A）模组：在卫戍协议只计属性加成，特性与天赋更新无效（玩家口径） */
  attrOnly?: boolean;
}

/** 归一化后的技力类型（原表部分为数字，如 8） */
export type SpType = 'INCREASE_WITH_TIME' | 'ON_ATTACK' | 'ON_DEFEND' | 'PASSIVE' | 'UNKNOWN';

export interface SkillLevelData {
  description: RichText;
  spType: SpType;
  spTypeRaw: string | number;
  spCost: number;
  initSp: number;
  maxChargeTime: number;           // 充能次数，通常 1
  increment: number;               // 技力回复速度
  duration: number;                // -1/0 表示特殊（弹药等），具体见 durationType
  rangeId: string | null;
  prefabId: string | null;
  blackboard: Blackboard;
}

export interface SkillData {
  skillId: string;
  name: string;
  skillType: string;               // PASSIVE / MANUAL / AUTO
  durationType: string;            // NONE / AMMO ...
  iconId: string | null;
  /** 只保留本模式会用到的等级；键为 skillLevel（1..10） */
  levels: Record<string, SkillLevelData>;
}

export interface BondData {
  bondId: string;
  name: string;
  desc: RichText;
  iconId: string;
  activeCount: number;             // 激活所需不同干员数（通常 3）
  /** 强化阈值（如 6 名不同干员），来自 power_bond_char_cnt；无则 null */
  powerCount: number | null;
  effectId: string;
  /** effectBuffInfoDataDict[effectId] 原样扁平化 */
  buffs: { key: string; blackboard: Blackboard }[];
  chessIds: string[];
  image: string | null;
  /**
   * 被某个初始策略（band）替换后的效果版本。目前只提取叙拉古：
   * 「裁度」band_siracusa 用 aceffect_band_65 的 auto_chess_effect_replace 把 bondeffect_siracusa_2 换成 bondeffect_siracusa。
   */
  variants?: BondVariant[];
}

export interface BondVariant {
  bandId: string;                  // band_siracusa
  bandName: string;                // 裁度（bandInfoDict 里的名字）
  effectId: string;                // bondeffect_siracusa
  /** 替换后的强化效果说明，可直接展示（不含 {0:0} 这类占位符） */
  desc: RichText;
  buffs: { key: string; blackboard: Blackboard }[];
}

export interface EquipData {
  chessId: string;                 // chess_item_x_xx_e_a / _b
  tier: ChessTier;
  name: string;
  desc: RichText;
  trapId: string;
  effectId: string;
  shopLevel: number;
  giveBondId: string | null;
  buffs: { key: string; blackboard: Blackboard }[];
  image: string | null;
}

export interface ModeData {
  modeId: string;                  // mode_single_1 ...
  name: string;                    // 规程等级1 ...
  difficulty: string;              // FUNNY / NORMAL / HARD / ABYSS / FAST
  sortId: number;
}

export interface BossData {
  /** 敌人身份，沿数据库等级与关卡显式覆盖提取；无法确认时为 null。 */
  levelType: 'NORMAL' | 'ELITE' | 'BOSS' | null;
  bossId: string;
  name: string;
  enemyId: string | null;          // 对应 enemy_database 的敌人
  description: RichText | null;
  /** modeId → 生命值 */
  hpByMode: Record<string, number>;
  /** 基础属性（取自 enemy_database / 关卡覆盖），取不到为 null */
  attributes: {
    def: number;
    magicResistance: number;
    maxHp: number;
    level: number;
    /** 元素抗性 / 元素损伤抗性 */
    epResistance: number;
    epDamageResistance: number;
    /** 免疫类属性：stunImmune / silenceImmune / sleepImmune / frozenImmune / levitateImmune ... */
    immunities: Record<string, boolean>;
  } | null;
  /** 影响伤害的特殊机制（减伤、护盾、阶段等）文本与 blackboard；引擎按需使用 */
  abilities: { text: RichText; key?: string; blackboard?: Blackboard }[];
  /** 属性的解析来源（enemy_database 等级 / 关卡 overwrittenData / runes），便于核对 */
  attributeSource: string[];
  /** 数据提取是否确信（false 时界面显示「数据待核对」） */
  verified: boolean;
  image: string | null;
  /** 隐秘核心形态（bossInfoDict.isHidingBoss）：同名 Boss 的强化版，敌人 id 通常带 _2。 */
  hidden?: boolean;
  /** 影响输出计算的 Boss 机制（减伤、加防等），已整理成自然语言 + 可量化效果。 */
  mechanics?: BossMechanic[];
}

/** 一条 Boss 机制。界面逐条展示 desc；effect 非空的可开关并由引擎计入。 */
export interface BossMechanic {
  /** 在该 Boss 内唯一，如 'core_damage_scale' */
  id: string;
  /** 界面短名，如「本体减伤」 */
  name: string;
  /** 自然语言纯文本（不含 <@..> 标记）：触发条件、数值、对输出的影响、本计算器怎么处理 */
  desc: string;
  /** 引擎可量化的效果；null 表示只作说明（如召唤、位移、对单体输出无直接影响） */
  effect: BossMechanicEffect | null;
  /** 缺省是否计入计算；CalcInput.bossMechanics 可逐条覆盖 */
  defaultOn: boolean;
  /** 数据来源（enemy_database 键 / 关卡文件 / 社区资料）。非游戏数据须注明并在结果 notes 标「近似」 */
  source: string;
}

export interface BossMechanicEffect {
  /** 受到伤害乘数（0.2 = 减伤 80%）；damageTypes 缺省时作用于物理、法术、真实 */
  damageTakenScale?: number;
  damageTypes?: DamageType[];
  defAdd?: number;
  defScale?: number;
  resAdd?: number;
}

export interface GameDataMeta {
  source: string;                  // 仓库
  commit: string;                  // 锁定 commit
  dataVersion: string;             // data_version.txt 中的版本号
  activityId: string;              // act3autochess
  generatedAt: string;             // ISO 时间
  /** cultivateNum → char_attribute_mul 解包倍率，未提供的属性为 1。 */
  cultivation: Record<string, Pick<AttributeSet, 'atk' | 'def' | 'maxHp'>>;
}

// ───────────────────────── B. 计算接口 ─────────────────────────

export interface BondSetting {
  bondId: string;
  stacks: number;                  // 层数
  /** 场上该盟约的不同干员数（决定 3/6 阈值是否满足） */
  activeChars: number;
  /**
   * 本干员不是该盟约成员时，是否处于成员的站位覆盖范围内（目前只有灵巧：周围 4 格 / 40 层后 8 格）。
   * 缺省 false。成员自身不看这个字段。
   */
  inRange?: boolean;
  /**
   * 阿戈尔（egirShip）：本干员战斗开始时吞噬的所有干员的基础攻击力之和，由用户填写，
   * 与特质、技能等百分比加攻同一乘区加算：攻击力 = 基础 ×(1+Σ百分比) + 吞噬值（不被百分比放大，玩家实测口径）。盟约激活（≥3 人）且本干员是成员时生效，缺省 0。
   */
  devouredAtk?: number;
  /**
   * 选用的策略版本：取 BondData.variants[].bandId。目前只有叙拉古「裁度」band_siracusa：
   * 6 人效果换成裁度版（与默认 6 人效果互斥）；3 人效果不变。缺省用默认效果。
   */
  bandId?: string;
}

export interface CalcInput {
  charId: string;
  tier: ChessTier;
  skillId: string;
  /** 装备的 EquipData.chessId，长度 ≤ equipSlotNum */
  equips: string[];
  bonds: BondSetting[];
  bossId: string;
  modeId: string;
  /**
   * 计算窗口（秒），缺省 180：模拟部署后这段时间；总伤、循环平均（总伤 ÷ 窗口时长）都按此窗口。
   * 击杀用时仍按时间过程求，可超过窗口。
   */
  durationSec?: number;
  /** Boss 机制开关：mechanic.id → 是否计入；缺省按 BossMechanic.defaultOn。 */
  bossMechanics?: Record<string, boolean>;
  /** 自选干员取哪个费用阶的棋子（5 / 6）；缺省 6。非自选干员忽略。 */
  diyShopLevel?: number;
  /**
   * 携带终极维式重锤时，场上有哪些带特殊效果的维式重锤（装备名，如「灼燃维式重锤」）。
   * 每种使终极维式重锤攻击力额外提升，并继承其特殊效果；缺省按 5 种都在场。未携带终极维式重锤时忽略。
   */
  fieldHammers?: string[];
  /**
   * 自身练度映射（cultivateEffectList.cultivateNum：1 未精英化 / 1001 精一 / 2001 精二 / 2060 精二 60 级）。
   * 缺省不加成（保持旧行为）；界面显式传 2060。
   */
  cultivation?: number;
  /** 自身潜能 0..5（0 = 1 潜，5 = 满潜）。缺省取棋子数据；界面显式传 5。 */
  potential?: number;
  /** 精锐阶模组（OperatorData.uniEquips[].uniEquipId）；缺省或无效取棋子默认，普通阶忽略。 */
  uniEquipId?: string | null;
}

/** 一个数值的推导步骤，用于界面展开「为什么是这个数」 */
export interface DerivationStep {
  label: string;                   // 例如「盟约·炎 攻击力 +27.5%（层数 5）」
  value: number;
  /** 'add' 固定加算 | 'pct' 百分比加算 | 'mul' 独立乘区 | 'set' 赋值 | 'info' 仅说明 */
  op: 'add' | 'pct' | 'mul' | 'set' | 'info';
  source: string;                  // 数据来源，例如 'bond:yanShip' / 'skill:skchr_xxx_2' / 'approx:社区实测'
}

export interface StatResult {
  atk: number;
  attackSpeed: number;
  attackInterval: number;          // 实际攻击间隔（秒）
  derivation: Record<'atk' | 'attackSpeed' | 'attackInterval', DerivationStep[]>;
}

/** 一个伤害分项：普攻、附加法伤、持续伤害、召唤物、元素损伤…… */
export interface DamageComponent {
  label: string;                   // 例如「普攻」「附加法术伤害」「召唤物·浮游弓」
  source: string;                  // 'attack' | 'talent:xxx' | 'skill:xxx' | 'token:xxx' ...
  damageType: DamageType;
  /** 单次伤害（已过防御/法抗/保底/增伤，elemental 的扣血/损伤由 countsTowardDps 区分） */
  perHit: number;
  hitsPerAttack: number;
  /** 每秒触发次数（攻击频率、DoT 频率等） */
  hitsPerSec: number;
  dps: number;
  /** 元素损伤为 false；元素扣血（包括灼燃爆发）为 true。 */
  countsTowardDps: boolean;
  derivation: DerivationStep[];
}

export interface PhaseResult {
  stats: StatResult;
  components: DamageComponent[];
  /**
   * 阶段 DPS。计算结果里的 normal / skill 有时间过程时为区间积分（非技能期 = 第一次开技前的伤害 ÷ 时长，
   * 技能期 = 第一轮技能起止区间的伤害 ÷ 时长），此时可与分项之和（开技时快照）不同；否则为 Σ countsTowardDps 的分项。
   */
  dps: number;
}

export type SkillLifecycle = 'timed' | 'instant' | 'on_deploy' | 'ammo' | 'permanent' | 'charge' | 'unknown';

export interface CalcResult {
  input: CalcInput;
  normal: PhaseResult;             // 非技能期：第一次开技能前一刻的面板（从不开技能时为部署时）
  skill: PhaseResult | null;       // 技能期：第一次开技能时的面板（真正常驻、无技能期的为 null）
  lifecycle: SkillLifecycle;
  /**
   * 技能循环：技力回复所需时间 + 技能持续（弹药技能按打完弹药的时间）。
   * avgDps 是计算窗口内总伤 ÷ 窗口时长（标题 DPS），不是稳态单循环的平均。
   * 一次性技能（只开一次）时 spRecoverSec 为第一次开技的时刻。
   */
  cycle: { spRecoverSec: number; skillDurationSec: number; avgDps: number } | null;
  /** 按时间过程（初始技力 → 技能 → 循环）积分，不由平均 DPS 换算 */
  totalDamage: { durationSec: number; value: number };
  /** 以当前模式 Boss 血量、按时间过程计的击杀用时（秒），无法击杀给 Infinity */
  killTimeSec: number;
  /** 元素损伤（不计入 DPS），单独展示 */
  elemental: { perSec: number; note: string } | null;
  /** 仅反映本干员、本技能的建模完整度；全局限制见 caveats。 */
  accuracy: 'exact' | 'approx';
  /** 全局注意事项，不影响 accuracy。 */
  caveats: string[];
  /** 被忽略的非 DPS 键（含来源），不影响 accuracy。 */
  ignoredKeys: string[];
  /** 为什么是 approx：被忽略的机制、推测值来源 */
  notes: string[];
  /**
   * 对本干员生效的假设说明（忽略 / 直接按上限 / 默认敌人……），每条形如「【谢拉格】默认敌人始终处于寒冷或冻结」，
   * 供界面列出。对应的推导写在计算过程里，notes 里另有以「近似：」开头的详细说明。
   */
  assumptions?: string[];
  model: 'generic' | 'override';
}

export type Calculate = (input: CalcInput) => CalcResult;

// ───────────────────────── C. DPS 排行 ─────────────────────────

/** 排行的公共条件：一套阵容的盟约设置 + Boss。不带装备。 */
export interface RankInput {
  bonds: BondSetting[];
  bossId: string;
  modeId: string;
  durationSec?: number;
  bossMechanics?: Record<string, boolean>;
  /** 同 CalcInput，透传到每一行 */
  diyShopLevel?: number;
  cultivation?: number;
  potential?: number;
}

/** 排行的一行 = 一名干员 × 阶级 × 技能 × 该阶级的模组。 */
export interface RankRow {
  charId: string;
  tier: ChessTier;
  skillId: string;
  /** 本行精锐阶模组；普通阶为 null。 */
  uniEquipId?: string | null;
  /** 本行实际送进 calculate 的输入（界面「在计算器中打开」直接用它） */
  input: CalcInput;
  result: CalcResult;
}

/** 返回全部行，不排序（界面按所选指标排序） */
export type RankAll = (input: RankInput) => RankRow[];
