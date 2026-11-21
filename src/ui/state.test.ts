import { describe, expect, it, vi } from 'vitest';
import { configSnapshot, defaultUniEquip, ensureAllBonds, ensureBonds, loadConfig, loadedConfig, resetBonds, resetBondsAndEquips, saveConfig, scheduleConfigSave, selectedUniEquip, setMech, applyInput, cfg, currentInput, rankInput, restoreCompare, selectOperator, setBond } from './state.svelte';
import { bondById, bosses, equips, opById } from './data';
import { headlineDelta } from './lib/headline';

describe('对比快照', () => {
  const input = currentInput();
  it('损坏的根节点或条目不会阻止后续有效条目恢复，上限 10', () => {
    for (const raw of ['{', '"string"', '{}', '[null,7]']) expect(restoreCompare(raw)).toEqual([]);
    const items = restoreCompare(JSON.stringify([null, { ...input, skillId: 'constructor' }, ...Array(12).fill(input)]));
    expect(items).toHaveLength(10);
    expect(items[0].skillId).toBe(input.skillId);
  });

  it('快照缺练度与潜能时按当前默认（精二 60 级、满潜）迁移，移除外来字段，无效装备和机制', () => {
    const old = { ...input, potential: 12, cultivation: undefined, diyShopLevel: null,
      durationSec: -1, share: 'old', equips: ['constructor'], bossMechanics: { unrelated: true },
      bonds: [null, { bondId: 'egirShip', stacks: 1500, activeChars: 3, devouredAtk: 123.9 },
        { bondId: 'siracusaShip', stacks: -10, activeChars: 6, bandId: 'band_siracusa' }] };
    const [saved] = restoreCompare(JSON.stringify([old]));
    expect(saved).toMatchObject({ potential: 5, cultivation: 2060, diyShopLevel: 6, durationSec: 180, equips: [] });
    expect(saved).not.toHaveProperty('share');
    expect(saved.bossMechanics ?? {}).not.toHaveProperty('unrelated');
    expect(saved.bonds).toEqual([{ bondId: 'egirShip', stacks: 999, activeChars: 3, devouredAtk: 123 },
      { bondId: 'siracusaShip', stacks: 0, activeChars: 6, bandId: 'band_siracusa' }]);
    applyInput(saved);
    expect(currentInput()).toMatchObject({ cultivation: 2060, potential: 5, durationSec: 180 });
    expect(currentInput().bonds).toEqual(expect.arrayContaining(saved.bonds));
  });
});

it('排行缓存随每项计算条件变化，显式未激活不会被切换干员重置', () => {
  const key = () => JSON.stringify(rankInput());
  const changes = [
    () => setBond({ bondId: 'egirShip', stacks: 0, activeChars: 3, devouredAtk: 450 }),
    () => setBond({ ...cfg.bonds.egirShip, devouredAtk: 451 }),
    () => setBond({ bondId: 'siracusaShip', stacks: 0, activeChars: 6 }),
    () => setBond({ ...cfg.bonds.siracusaShip, bandId: 'band_siracusa' }),
    () => cfg.cultivation = 2001, () => cfg.potential = 2,
    () => { cfg.bossId = bosses.find(b => b.bossId !== cfg.bossId && b.mechanics?.some(m => m.effect))!.bossId; },
    () => { const m = bosses.find(b => b.bossId === cfg.bossId)!.mechanics!.find(m => m.effect)!;
      cfg.bossMech[cfg.bossId] = { [m.id]: !m.defaultOn }; },
  ];
  for (const change of changes) { const before = key(); change(); expect(key()).not.toBe(before); }
  // 排行不计入自选干员：自选阶数不应让排行重算
  { const before = key(); cfg.diyShopLevel = cfg.diyShopLevel === 5 ? 6 : 5; expect(key()).toBe(before); }
  const op = opById.get(cfg.charId)!;
  setBond({ bondId: op.bondIds[0], stacks: 0, activeChars: 0 });
  selectOperator(op.charId);
  expect(cfg.bonds[op.bondIds[0]].activeChars).toBe(0);
});

it('从排行打开调和成员保留已激活的核心盟约；旧配置载入时清除上次的目标开关', () => {
  const op = [...opById.values()].find(o => o.bondIds.includes('maniShip'))!;
  const boss = bosses.find(b => b.mechanics?.some(m => m.effect))!;
  const mechanic = boss.mechanics!.find(m => m.effect)!;
  const input = { ...currentInput(), charId: op.charId, skillId: op.skillIds[0], bossId: boss.bossId,
    bossMechanics: undefined, durationSec: 0,
    bonds: [{ bondId: 'maniShip', activeChars: 1, stacks: 0 }, { bondId: 'yanShip', activeChars: 6, stacks: 10 }] };
  cfg.bossMech[boss.bossId] = { [mechanic.id]: !mechanic.defaultOn };
  applyInput(input);
  expect(currentInput().bonds).toEqual(expect.arrayContaining(input.bonds));
  expect(currentInput().bossMechanics?.[mechanic.id]).toBe(mechanic.defaultOn);
  expect(currentInput().durationSec).toBe(180);
});

it('精锐的默认、过期和自选模组经对比恢复后与计算一致；普通阶载入保留精锐偏好', () => {
  const op = opById.get('char_350_surtr')!;
  const base = { ...currentInput(), charId: op.charId, skillId: op.skillIds[0], tier: 'b' as const };
  const alt = op.uniEquips!.find(u => u.uniEquipId !== defaultUniEquip(op))!.uniEquipId;
  for (const id of [undefined, 'expired', alt]) {
    const [saved] = restoreCompare(JSON.stringify([{ ...base, uniEquipId: id }]));
    applyInput(saved);
    expect(saved.uniEquipId).toBe(id === alt ? alt : defaultUniEquip(op));
    expect(selectedUniEquip(op)).toBe(saved.uniEquipId);
    expect(currentInput().uniEquipId).toBe(saved.uniEquipId);
  }
  applyInput({ ...base, tier: 'a' });
  expect(currentInput().uniEquipId).toBeUndefined();
  cfg.tier = 'b';
  expect(currentInput().uniEquipId).toBe(alt);
  const diy = [...opById.values()].find(o => o.diy && o.uniEquips?.length)!;
  selectOperator(diy.charId);
  for (const level of [5, 6]) {
    cfg.diyShopLevel = level;
    expect(currentInput().uniEquipId).toBe((diy.diyVariants?.[level] ?? diy.tiers).b.uniEquipId);
  }
  selectOperator(op.charId);
  expect(currentInput().uniEquipId).toBe(alt);
});

it('配置损坏不部分恢复，刷新保留清零的盟约与其他 Boss 的开关，其他存储键不受影响', () => {
  const store = new Map([['gdps.guided', '1'], ['gdps.compare.v1', '[]']]);
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k), setItem: (k: string, v: string) => store.set(k, v) });
  try {
    const op = opById.get('char_350_surtr')!;
    selectOperator(op.charId);
    cfg.uniEquip = {};
    const before = configSnapshot();
    const alt = op.uniEquips!.find(u => u.uniEquipId !== defaultUniEquip(op))!.uniEquipId;
    for (const raw of ['{', JSON.stringify({ input: { ...currentInput(), charId: 'expired' }, uniEquip: { [op.charId]: alt } })]) {
      store.set('gdps.cfg.v1', raw);
      loadConfig();
      expect(configSnapshot()).toBe(before);
    }
    ensureAllBonds();
    resetBonds();
    const next = [...opById.values()].find(o => o.bondIds.some(id => !op.bondIds.includes(id)))!;
    const bond = next.bondIds.find(id => !op.bondIds.includes(id))!;
    const other = bosses.find(b => b.bossId !== cfg.bossId && b.mechanics?.some(m => m.effect))!;
    const m = other.mechanics!.find(m => m.effect)!;
    setMech(other.bossId, m.id, !m.defaultOn);
    saveConfig(configSnapshot());
    cfg.bossMech = {};
    loadConfig();
    expect(cfg.bossMech[other.bossId][m.id]).toBe(!m.defaultOn);
    selectOperator(next.charId);
    expect(cfg.bonds[bond].activeChars).toBe(0);
    expect(store.get('gdps.guided')).toBe('1');
    expect(store.get('gdps.compare.v1')).toBe('[]');
  } finally { vi.unstubAllGlobals(); }
});

it('计算器与排行显式重置全部盟约，切页、刷新和换成员都保持清零；只在计算器卸装', () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k), setItem: (k: string, v: string) => store.set(k, v) });
  try {
    const yan = [...opById.values()].find(o => o.bondIds.includes('yanShip') && o.tiers.b.equipSlotNum >= 2)!;
    const harmony = [...opById.values()].find(o => o.bondIds.includes('maniShip'))!;
    const gear = equips.filter(e => !/销毁/.test(e.desc ?? '')).slice(0, 2).map(e => e.chessId);
    const boss = bosses.find(b => b.hpByMode[cfg.modeId] > 0 && b.mechanics?.some(m => m.effect))!;
    const mechanic = boss.mechanics!.find(m => m.effect)!;
    const unchanged = { charId: yan.charId, tier: 'b' as const, skillId: yan.skillIds[0], bossId: boss.bossId,
      bossMechanics: { [mechanic.id]: !mechanic.defaultOn }, modeId: cfg.modeId, cultivation: 2001, potential: 2 };
    const activate = () => {
      setBond({ bondId: 'yanShip', stacks: 88, activeChars: 6 });
      setBond({ bondId: 'egirShip', stacks: 8, activeChars: 6, devouredAtk: 500 });
    };
    const checkZero = () => {
      expect(Object.keys(cfg.bonds)).toHaveLength(bondById.size);
      expect(Object.values(cfg.bonds).every(b => b.stacks === 0 && b.activeChars === 0 && b.devouredAtk === undefined && b.bandId === undefined)).toBe(true);
      for (const input of [rankInput(), currentInput()]) expect(input.bonds.every(b => b.stacks === 0 && b.activeChars === 0)).toBe(true);
    };
    for (const reset of [resetBonds, resetBondsAndEquips]) {
      applyInput({ ...currentInput(), ...unchanged, equips: gear });
      activate();
      expect(cfg.bonds.yanShip.activeChars).toBe(6);
      reset();
      const remaining = reset === resetBonds ? gear : [];
      ensureAllBonds();
      ensureBonds();
      checkZero();
      expect(currentInput()).toMatchObject({ ...unchanged, equips: remaining });
      saveConfig(configSnapshot());
      selectOperator(harmony.charId);
      activate();
      loadConfig();
      ensureBonds();
      checkZero();
      expect(currentInput()).toMatchObject({ ...unchanged, equips: remaining });
      selectOperator(harmony.charId);
      ensureAllBonds();
      checkZero();
      activate();
      expect(currentInput().bonds).toContainEqual({ bondId: 'maniShip', activeChars: 1, stacks: 0 });
      expect(cfg.bonds.yanShip.stacks).toBe(88);
    }
  } finally { vi.unstubAllGlobals(); }
});

it('整份载入重置涨跌基准；首次显示、口径变化或零基数均不报涨跌', () => {
  const rev = loadedConfig.revision;
  applyInput(currentInput());
  expect(loadedConfig.revision).toBe(rev + 1);
  const prev = { key: 'same', value: 100 };
  expect(headlineDelta(prev, { ...prev, value: 120 })).toBeCloseTo(0.2);
  expect(headlineDelta(prev, { ...prev, value: 0 })).toBe(-1);
  expect(headlineDelta(null, prev)).toBeNull();
  expect(headlineDelta(prev, { key: 'other', value: 120 })).toBeNull();
  expect(headlineDelta({ ...prev, value: 0 }, prev)).toBeNull();
});

it('快速修改只写最后的配置，400ms 内离开会提前保存且不重复写', () => {
  vi.useFakeTimers();
  const setItem = vi.fn();
  const page = new EventTarget();
  vi.stubGlobal('window', page);
  vi.stubGlobal('localStorage', { setItem });
  try {
    const cancel = scheduleConfigSave('old');
    vi.advanceTimersByTime(100);
    cancel();
    scheduleConfigSave('latest');
    expect(setItem).not.toHaveBeenCalled();
    page.dispatchEvent(new Event('pagehide'));
    expect(setItem).toHaveBeenCalledExactlyOnceWith('gdps.cfg.v1', 'latest');
    vi.advanceTimersByTime(400);
    page.dispatchEvent(new Event('pagehide'));
    expect(setItem).toHaveBeenCalledTimes(1);
    scheduleConfigSave('next');
    vi.advanceTimersByTime(400);
    expect(setItem).toHaveBeenLastCalledWith('gdps.cfg.v1', 'next');
  } finally {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
