import type { BondSetting, BossMechanic, CalcInput, ChessTier, OperatorData, RankInput } from '../engine/types';
import { memberBondIds as engineMemberBondIds } from '../engine/index';
import { ATK_MAX, STACK_MAX, bondTiers, currentTier } from './lib/bondTiers';
import { bondById, bosses, equips as equipList, modes, operators, opById } from './data';

/**
 * 对所有干员（不只成员）都有输出相关效果的盟约。界面在「全场盟约」区对任意干员开放设置，
 * 引擎对非成员只应用其中的全场部分。默认在场 0 人 = 未激活，不会凭空加成。
 */
export const TEAM_BONDS = ['arcaneShip', 'steadShip', 'swiftShip', 'skillfulShip', 'raidShip', 'preciShip', 'suntShip'] as const;

/** 10 个核心势力盟约（调和干员能享受全部核心盟约） */
export const CORE_BONDS = ['yanShip', 'sargonShip', 'victoriaShip', 'kjeragShip', 'egirShip', 'siracusaShip', 'kazimierzShip', 'ursusShip', 'iberiaShip', 'lethaniaShip'] as const;
/** 与 DPS 无关、不在任何盟约区出现的盟约 */
export const HIDDEN_BONDS = new Set(['deputShip', 'miraShip', 'docShip']);
/** 只对特定干员的伤害有影响的盟约：计算器里只在这些干员页面显示，排行页照常列出 */
const ONLY_FOR: Record<string, string> = { visiShip: 'char_4133_logos', investShip: 'char_322_lmlee', indomShip: 'char_4010_etlchi' };

/**
 * 计算器里给当前干员显示的成员盟约：去掉与 DPS 无关的；调和干员（如魔王）再加上全部核心盟约。
 */
export function shownMemberBonds(op: OperatorData, equipIds: string[]): string[] {
  const ids = memberBondIds(op, equipIds).filter((id) => !HIDDEN_BONDS.has(id) && (!ONLY_FOR[id] || ONLY_FOR[id] === op.charId));
  if (ids.includes('maniShip')) for (const id of CORE_BONDS) if (!ids.includes(id)) ids.push(id);
  return ids;
}

/** 干员实际的盟约成员身份：自身盟约 + 变形同构体按另一件装备赠送的盟约（规则在引擎，界面只复用） */
export function memberBondIds(op: OperatorData, equipIds: string[]): string[] {
  return engineMemberBondIds(op, equipIds, equipList);
}

const first = opById.get('char_350_surtr') ?? operators[0];

/** 带特殊效果的维式重锤（终极维式重锤按场上有几种来加攻并继承效果） */
export const SPECIAL_HAMMERS = ['灼燃维式重锤', '坚固维式重锤', '加速维式重锤', '战栗维式重锤', '电流维式重锤'] as const;
export const ULTIMATE_HAMMER = '终极维式重锤';
export const hasUltimateHammer = (equipIds: string[]) => equipIds.some((id) => equipList.find((e) => e.chessId === id)?.name === ULTIMATE_HAMMER);
const validHammers = (v: unknown) => Array.isArray(v) ? SPECIAL_HAMMERS.filter((h) => v.includes(h)) : [...SPECIAL_HAMMERS];

/** 全局配置状态（Svelte 5 runes）。 */
export const cfg = $state({
  charId: first.charId,
  tier: 'b' as ChessTier,
  skillId: first.skillIds[first.defaultSkillIndex] ?? first.skillIds[0],
  equips: [] as string[],
  bonds: {} as Record<string, BondSetting>,
  bossId: bosses[0].bossId,
  modeId: modes[9]?.modeId ?? modes[0].modeId,
  /** 模拟窗口：部署后 180 秒（循环平均 = 180 秒总伤 ÷ 180） */
  durationSec: 180,
  /** Boss 机制开关：bossId → mechanic.id → 是否计入（未设置的按 defaultOn） */
  bossMech: {} as Record<string, Record<string, boolean>>,
  /** 自身练度映射（cultivateNum），默认精二 60 级；计算器与排行共用。 */
  cultivation: 2060,
  /** 自身潜能 0..5，默认满潜。 */
  potential: 5,
  /** 自选干员按几阶棋子计（5 / 6），只影响精锐阶模组等级。 */
  diyShopLevel: 6,
  /** 终极维式重锤：场上带特殊效果的维式重锤（默认 5 种都在场） */
  fieldHammers: [...SPECIAL_HAMMERS] as string[],
  /** 每名干员精锐阶选的模组（charId → uniEquipId）；未选的用棋子默认。 */
  uniEquip: {} as Record<string, string>,
});

/** 干员精锐阶的默认模组（棋子自带，按当前费用阶） */
export function defaultUniEquip(op: OperatorData): string | null {
  return opTiers(op).b.uniEquipId ?? null;
}
/** 干员精锐阶当前选的模组：用户选过且仍有效就用它，否则默认 */
export function selectedUniEquip(op: OperatorData): string | null {
  const sel = cfg.uniEquip[op.charId];
  return sel && op.uniEquips?.some((u) => u.uniEquipId === sel) ? sel : defaultUniEquip(op);
}
export function setUniEquip(op: OperatorData, id: string) {
  if (id === defaultUniEquip(op)) delete cfg.uniEquip[op.charId];
  else cfg.uniEquip[op.charId] = id;
}

/** 自身练度档位（cultivateEffectList，act3autochess） */
export const CULTIVATIONS = [
  { value: 1, label: '未精英化' },
  { value: 1001, label: '精英一' },
  { value: 2001, label: '精英二' },
  { value: 2060, label: '精二 60 级' },
] as const;
const CULT_VALUES: number[] = CULTIVATIONS.map((c) => c.value);
export const DIY_LEVELS = [5, 6] as const;

/** 当前设置下干员的两阶状态：自选干员选 5 阶时取 diyVariants[5]（精锐模组 1 级），其余取 tiers */
export function opTiers(op: OperatorData) {
  return (op.diy && cfg.diyShopLevel !== op.shopLevel && op.diyVariants?.[cfg.diyShopLevel]) || op.tiers;
}
/** 当前设置下干员显示的费用阶 */
export function opShopLevel(op: OperatorData, level = cfg.diyShopLevel) {
  return op.diy && op.diyVariants?.[level] ? level : op.shopLevel;
}

/** 送进引擎的练度、潜能和自选阶数（排行与计算器共用） */
function trainingInput() {
  return { cultivation: cfg.cultivation, potential: cfg.potential, diyShopLevel: cfg.diyShopLevel };
}

export function selectOperator(charId: string) {
  const op = opById.get(charId);
  if (!op) return;
  cfg.charId = charId;
  cfg.skillId = op.skillIds[op.defaultSkillIndex] ?? op.skillIds[0];
  cfg.equips = cfg.equips.slice(0, opTiers(op)[cfg.tier].equipSlotNum);
  ensureBonds();
}

/** 以「不激活」默认值自动建出的盟约设置（非成员时建的） */
const autoDefaults = new Set<string>();

/** 每次整份载入配置时重新建立结果卡的比较基准。 */
export const loadedConfig = $state({ revision: 0 });

/**
 * 为当前干员涉及的盟约准备默认值：成员盟约刚好激活所需人数、0 层；全场盟约 0 人（未激活）。
 * 已有设置不覆盖。换装备（同构体赠送盟约）后也要调用。
 */
export function ensureBonds() {
  const op = opById.get(cfg.charId);
  if (!op) return;
  const members = memberBondIds(op, cfg.equips);
  for (const id of shownMemberBonds(op, cfg.equips)) {
    // 调和干员额外显示的核心盟约默认不激活，由玩家自己设置
    if (!members.includes(id)) { if (!cfg.bonds[id]) { cfg.bonds[id] = { bondId: id, stacks: 0, activeChars: 0 }; autoDefaults.add(id); } continue; }
    const cur = cfg.bonds[id];
    // 作为「全场盟约 / 排行」默认值建出来、没被改动过（0 档 0 层）的设置，成为成员时也按默认激活
    const untouchedDefault = cur && autoDefaults.has(id) && cur.activeChars === 0 && cur.stacks === 0;
    if (!cur || untouchedDefault) cfg.bonds[id] = { bondId: id, stacks: 0, activeChars: bondById.get(id)?.activeCount ?? 3 };
    autoDefaults.delete(id);
  }
  for (const id of TEAM_BONDS) {
    if (!cfg.bonds[id] && bondById.has(id)) { cfg.bonds[id] = { bondId: id, stacks: 0, activeChars: 0 }; autoDefaults.add(id); }
  }
}

export function setBond(setting: BondSetting) {
  autoDefaults.delete(setting.bondId);
  cfg.bonds[setting.bondId] = setting;
  // 从显式清零重新组起核心盟约时，恢复调和成员自动享受核心加成的规则。
  if (cfg.bonds.maniShip?.activeChars === 0 && !autoDefaults.has('maniShip') && CORE_BONDS.some(id => id === setting.bondId)
    && setting.activeChars >= (bondById.get(setting.bondId)?.activeCount ?? Infinity)) {
    cfg.bonds.maniShip = { bondId: 'maniShip', stacks: 0, activeChars: bondById.get('maniShip')!.activeCount };
  }
}

/** 排行页：为全部盟约准备设置（未设置过的默认不激活） */
export function ensureAllBonds() {
  for (const b of bondById.values()) {
    if (!cfg.bonds[b.bondId]) { cfg.bonds[b.bondId] = { bondId: b.bondId, stacks: 0, activeChars: 0 }; autoDefaults.add(b.bondId); }
  }
}

/** 自动生效、不给用户设档位的盟约：调和只需 1 名【调和】干员在场，干员本人在场即激活 */
export const AUTO_BONDS = new Set(['maniShip']);

/**
 * 玩家口径：灵巧只要激活，默认本干员就在灵巧覆盖范围内（无需手动勾选站位）；
 */
export function withDefaults(b: BondSetting): BondSetting {
  const { inRange: _ignored, ...rest } = b;
  if (b.bondId === 'skillfulShip') return { ...rest, inRange: true };
  return { ...rest };
}

/** 把所有盟约明确设为零，切页或切换干员时也保留这个选择。 */
export function resetBonds() {
  autoDefaults.clear();
  cfg.bonds = Object.fromEntries([...bondById.keys()].map(id => [id, { bondId: id, stacks: 0, activeChars: 0 }]));
}

export function resetBondsAndEquips() {
  cfg.equips = [];
  resetBonds();
}

/** 某条 Boss 机制当前是否计入 */
export function mechOn(bossId: string, m: BossMechanic): boolean {
  return cfg.bossMech[bossId]?.[m.id] ?? m.defaultOn;
}
export function setMech(bossId: string, id: string, on: boolean) {
  cfg.bossMech[bossId] = { ...(cfg.bossMech[bossId] ?? {}), [id]: on };
}
/** 送进引擎的机制开关（只含可量化的机制；该 Boss 没有机制时为 undefined） */
export function bossMechInput(bossId: string): Record<string, boolean> | undefined {
  const ms = bosses.find((b) => b.bossId === bossId)?.mechanics?.filter((m) => m.effect);
  return ms?.length ? Object.fromEntries(ms.map((m) => [m.id, mechOn(bossId, m)])) : undefined;
}

/** 调和与按激活数结算的装备需要整套阵容的盟约。 */
export function currentInput(): CalcInput {
  const op = opById.get(cfg.charId)!;
  const members = memberBondIds(op, cfg.equips);
  return {
    charId: cfg.charId,
    tier: cfg.tier,
    skillId: cfg.skillId,
    equips: [...cfg.equips],
    bonds: Object.values(cfg.bonds).filter(b => !AUTO_BONDS.has(b.bondId) || b.activeChars === 0 || members.includes(b.bondId)).map(withDefaults),
    bossId: cfg.bossId,
    modeId: cfg.modeId,
    durationSec: cfg.durationSec,
    bossMechanics: bossMechInput(cfg.bossId),
    ...trainingInput(),
    ...(cfg.tier === 'b' && op.uniEquips?.length ? { uniEquipId: selectedUniEquip(op) ?? undefined } : {}),
    ...(hasUltimateHammer(cfg.equips) ? { fieldHammers: [...cfg.fieldHammers] } : {}),
  };
}

/** 排行输入：全部盟约（没设置过的按不激活）+ 当前 Boss / 规程 / 机制。不改动 cfg，可在任何时候调用 */
export function rankInput(): RankInput {
  const bonds = [...bondById.values()].map(b => {
    const setting = cfg.bonds[b.bondId];
    if (AUTO_BONDS.has(b.bondId) && (!setting || autoDefaults.has(b.bondId))) {
      return { bondId: b.bondId, stacks: 0, activeChars: b.activeCount };
    }
    return withDefaults(setting ?? { bondId: b.bondId, stacks: 0, activeChars: 0 });
  });
  return { bonds, bossId: cfg.bossId, modeId: cfg.modeId, durationSec: cfg.durationSec, bossMechanics: bossMechInput(cfg.bossId), cultivation: cfg.cultivation, potential: cfg.potential };
}

/** 把一个引擎输入写回当前配置（用于对比栏「载入」与排行「在计算器中打开」） */
export function applyInput(input: CalcInput) {
  const op = opById.get(input.charId);
  if (!op) return false;
  cfg.charId = op.charId;
  cfg.tier = input.tier === 'a' ? 'a' : 'b';
  cfg.skillId = op.skillIds.includes(input.skillId) ? input.skillId : op.skillIds[op.defaultSkillIndex] ?? op.skillIds[0];
  // 排行行不含自选干员，也不带阶数：缺省时保留当前设置
  cfg.diyShopLevel = input.diyShopLevel === 5 || input.diyShopLevel === 6 ? input.diyShopLevel : cfg.diyShopLevel;
  // 快照缺少练度或潜能时，使用精二 60 级、满潜
  cfg.cultivation = input.cultivation ?? 2060;
  cfg.potential = input.potential ?? 5;
  cfg.bonds = {};
  autoDefaults.clear();
  cfg.equips = input.equips.slice(0, opTiers(op)[cfg.tier].equipSlotNum);
  // 模组：快照/排行行带了有效模组就记下，否则回到默认
  if (cfg.tier === 'b') {
    if (input.uniEquipId && op.uniEquips?.some((u) => u.uniEquipId === input.uniEquipId)) setUniEquip(op, input.uniEquipId);
    else delete cfg.uniEquip[op.charId];
  }
  // 载入的配置是明确选择：不再被「成员盟约默认激活」改写
  for (const b of input.bonds) if (bondById.has(b.bondId)) cfg.bonds[b.bondId] = { ...b };
  // 补齐旧快照没有保存的盟约，缺省为未激活。
  for (const id of [...memberBondIds(op, cfg.equips), ...TEAM_BONDS]) {
    cfg.bonds[id] ??= { bondId: id, stacks: 0, activeChars: 0 };
  }
  cfg.bossId = input.bossId;
  cfg.modeId = input.modeId;
  cfg.durationSec = 180;
  if (input.fieldHammers) cfg.fieldHammers = validHammers(input.fieldHammers);
  cfg.bossMech[cfg.bossId] = { ...input.bossMechanics };
  loadedConfig.revision++;
  return true;
}

// ───────── 对比栏：最多 10 个配置，保存在本机 ─────────
const KEY = 'gdps.compare.v1';
export const COMPARE_MAX = 10;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function integer(value: unknown, max: number) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(0, Math.floor(value))) : 0;
}

function restoreInput(raw: unknown): CalcInput | undefined {
  if (!record(raw) || typeof raw.charId !== 'string') return;
  const op = opById.get(raw.charId);
  const boss = bosses.find(b => b.bossId === raw.bossId);
  const mode = modes.find(m => m.modeId === raw.modeId);
  const tier = raw.tier;
  if (!op || !boss || !mode || !(boss.hpByMode[mode.modeId] > 0) || (tier !== 'a' && tier !== 'b')) return;
  if (typeof raw.skillId !== 'string' || !op.skillIds.includes(raw.skillId)) return;
  if (!Array.isArray(raw.equips) || !Array.isArray(raw.bonds)) return;

  const diyShopLevel = raw.diyShopLevel === 5 ? 5 : 6;
  const tiers = op.diyVariants?.[diyShopLevel] ?? op.tiers;
  const equips = raw.equips.filter((id): id is string => equipList.some(e => e.chessId === id && !/销毁/.test(e.desc ?? ''))).slice(0, tiers[tier].equipSlotNum);
  const settings = new Map<string, BondSetting>();
  for (const item of raw.bonds) {
    if (!record(item) || typeof item.bondId !== 'string') continue;
    const b = bondById.get(item.bondId);
    if (!b) continue;
    const tiers = bondTiers(b);
    const activeChars = integer(item.activeChars, operators.length);
    const setting: BondSetting = { bondId: b.bondId, stacks: integer(item.stacks, STACK_MAX), activeChars };
    if (b.bondId === 'egirShip' && item.devouredAtk !== undefined) setting.devouredAtk = integer(item.devouredAtk, ATK_MAX);
    if (typeof item.bandId === 'string' && tiers.some(t => t.value === currentTier(tiers, activeChars) && t.bandId === item.bandId)) setting.bandId = item.bandId;
    settings.set(b.bondId, withDefaults(setting));
  }
  const flags = record(raw.bossMechanics) ? raw.bossMechanics : {};
  const mechanics = boss.mechanics?.filter(m => m.effect);
  return {
    charId: op.charId, tier, skillId: raw.skillId, equips, bonds: [...settings.values()],
    bossId: boss.bossId, modeId: mode.modeId,
    // 统一按 180 秒窗口计算，旧快照保存的时长不再沿用
    durationSec: 180,
    bossMechanics: mechanics?.length ? Object.fromEntries(mechanics.map(m => {
      const value = flags[m.id];
      return [m.id, typeof value === 'boolean' ? value : m.defaultOn];
    })) : undefined,
    cultivation: typeof raw.cultivation === 'number' && CULT_VALUES.includes(raw.cultivation) ? raw.cultivation : 2060,
    potential: typeof raw.potential === 'number' && Number.isInteger(raw.potential) && raw.potential >= 0 && raw.potential <= 5 ? raw.potential : 5,
    diyShopLevel,
    ...(raw.fieldHammers !== undefined ? { fieldHammers: validHammers(raw.fieldHammers) } : {}),
    ...(tier === 'b' && op.uniEquips?.length ? { uniEquipId: op.uniEquips.find(u => u.uniEquipId === raw.uniEquipId)?.uniEquipId ?? tiers.b.uniEquipId ?? undefined } : {}),
  };
}

export function restoreCompare(json: string): CalcInput[] {
  const items: CalcInput[] = [];
  try {
    const raw: unknown = JSON.parse(json);
    if (!Array.isArray(raw)) return items;
    for (const entry of raw) {
      const input = restoreInput(entry);
      if (input) items.push(input);
      if (items.length === COMPARE_MAX) break;
    }
  } catch { /* 损坏的 JSON */ }
  return items;
}

function load() {
  try { return restoreCompare(localStorage.getItem(KEY) ?? '[]'); } catch { return []; }
}
export const compare = $state({ items: load() });
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(compare.items)); } catch { /* 隐私模式忽略 */ }
}
export function addCompare(input: CalcInput) {
  const key = JSON.stringify(restoreInput(input));
  if (compare.items.some((x) => JSON.stringify(restoreInput(x)) === key)) return 'dup';
  if (compare.items.length >= COMPARE_MAX) return 'full';
  compare.items = [...compare.items, input];
  save();
  return 'ok';
}
export function removeCompare(i: number) {
  compare.items = compare.items.filter((_, j) => j !== i);
  save();
}

// ───────── 记住上次的配置（刷新 / 关闭页面后恢复；同样按当前数据校验） ─────────
const CFG_KEY = 'gdps.cfg.v1';
/** 当前完整配置的快照字符串（在 $effect 里调用即订阅全部相关状态） */
export function configSnapshot(): string {
  const input = { ...currentInput(), bonds: Object.values(cfg.bonds).map(withDefaults) };
  return JSON.stringify({ input, uniEquip: cfg.uniEquip, autoDefaults: [...autoDefaults], bossMech: cfg.bossMech });
}
export function saveConfig(snapshot: string) {
  try { localStorage.setItem(CFG_KEY, snapshot); } catch { /* 隐私模式忽略 */ }
}
/** 切换设置时合并写入，刷新或关闭时立即写完尚在等待的快照。 */
export function scheduleConfigSave(snapshot: string) {
  const timer = setTimeout(flush, 400);
  window.addEventListener('pagehide', flush);
  function cancel() {
    clearTimeout(timer);
    window.removeEventListener('pagehide', flush);
  }
  function flush() {
    cancel();
    saveConfig(snapshot);
  }
  return cancel;
}

export function loadConfig() {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null');
    if (!record(raw)) return;
    const input = restoreInput(raw.input);
    if (!input) return;
    applyInput(input);
    if (Array.isArray(raw.autoDefaults)) {
      for (const id of raw.autoDefaults) {
        if (typeof id === 'string' && cfg.bonds[id]?.activeChars === 0 && cfg.bonds[id].stacks === 0) autoDefaults.add(id);
      }
    }
    if (record(raw.bossMech)) {
      for (const boss of bosses) {
        const flags = raw.bossMech[boss.bossId];
        if (boss.bossId === input.bossId || !record(flags)) continue;
        for (const m of boss.mechanics ?? []) {
          const value = flags[m.id];
          if (m.effect && typeof value === 'boolean') setMech(boss.bossId, m.id, value);
        }
      }
    }
    if (record(raw.uniEquip)) {
      for (const [charId, id] of Object.entries(raw.uniEquip)) {
        const op = opById.get(charId);
        if (input.tier === 'b' && charId === input.charId) continue;
        if (op && typeof id === 'string' && op.uniEquips?.some((u) => u.uniEquipId === id)) cfg.uniEquip[charId] = id;
      }
    }
  } catch { /* 损坏的存档：用默认配置 */ }
}

selectOperator(cfg.charId);
loadConfig();
