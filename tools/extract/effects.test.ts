import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractEffects } from './effects.ts';

// 与下载脚本一致：按 tools/gamedata.lock.json 的锁定提交取缓存目录
const root = resolve(import.meta.dirname, '../..');
const lock = JSON.parse(readFileSync(resolve(root, 'tools/gamedata.lock.json'), 'utf8'));
const cache = resolve(root, `.cache/gamedata/${lock.commit}`);
let result: Awaited<ReturnType<typeof extractEffects>>;
let referencedIds: string[];

beforeAll(async () => {
  const table = JSON.parse(await readFile(resolve(cache, 'excel/activity_table.json'), 'utf8'));
  const mode = table.activity.AUTOCHESS.act3autochess.V3_1;
  const fixedIds = new Set(Object.values(mode.charShopChessDatas)
    .filter((shop: any) => shop.chessType !== 'DIY' && shop.charId)
    .flatMap((shop: any) => [shop.chessId, shop.goldenChessId]));
  referencedIds = [...new Set<string>(Object.values(mode.charChessDataDict)
    .filter((chess: any) => fixedIds.has(chess.chessId))
    .flatMap((chess: any) => chess.garrisonIds ?? []))];
  result = await extractEffects(cache, referencedIds);
}, 60_000);

describe('真实卫戍协议效果数据', () => {
  it('炎盟约保留攻击加成、强化门槛与全部 buff 的字符串参数', () => {
    const yan = result.bonds.find((bond) => bond.bondId === 'yanShip');
    expect(yan?.name).toBe('炎');
    expect(yan?.activeCount).toBe(3);
    expect(yan?.powerCount).toBe(6);
    // 锁定版本 bondeffect_yan_2 的首个 buff，不从描述推算。
    expect(yan?.buffs[0]?.blackboard).toEqual({
      nums: { atk_base: 0.23, atk_per_stack: 0.009, ex_atk_scale_base: 0.06,
        ex_atk_scale_per_stack: 0, ex_atk_scale_max: 10, power_bond_char_cnt: 6 },
      strs: { key: 'act3autochess_bond_eff_yan' },
    });
    expect(yan?.buffs[1]?.blackboard.strs?.key).toBe('act3autochess_bond_eff_yan[enemy]');
    expect(result.bonds).toHaveLength(26);
  });

  it('保留原表全部装备阶级，并从 trap 数据取实际名称和商店等阶', () => {
    expect(result.equips).toHaveLength(116);
    expect(result.equips.filter((equip) => equip.tier === 'a')).toHaveLength(70);
    expect(result.equips.filter((equip) => equip.tier === 'b')).toHaveLength(46);
    expect(result.equips.find((equip) => equip.chessId === 'chess_item_1_01_e_a')).toMatchObject({
      name: '维式重锤', trapId: 'trap_1041_acarm041', shopLevel: 1, tier: 'a',
      giveBondId: 'victoriaShip', image: null,
      buffs: [{ key: 'env_gbuff_new_with_verify', blackboard: {
        nums: { atk: 0.15 }, strs: { key: 'attr_common_global_buff' },
      } }],
    });
    expect(result.equips.find((equip) => equip.chessId === 'chess_item_1_01_e_b'))
      .toMatchObject({ name: '维式重锤', tier: 'b', shopLevel: 1 });
    expect(result.equips.every((equip) => equip.image === null && equip.name.length > 0)).toBe(true);
  });

  it('卫戍特质只输出引用到的条目，并保留字符串 blackboard', () => {
    expect(Object.keys(result.garrisons).sort()).toEqual([...referencedIds].sort());
    expect(result.garrisons.garrison_01_a).toMatchObject({
      eventType: 'IN_BATTLE', effectType: 'ADD_BOND', battleRuneKey: 'char_dynamic_ability_new',
      blackboard: { nums: { kill_count: 1 }, strs: { bond_id: 'lethaniaShip' } },
    });
  });

  it('汇总未建模的数值与字符串键，缺引用时报告且不伪造特质', async () => {
    expect(result.keys.bonds).toContain('atk_base');
    expect(result.keys.bonds).toContain('key');
    expect(result.keys.equips).toContain('atk');
    expect(result.keys.equips).toContain('big_hammer');
    const missing = await extractEffects(cache, ['missing_garrison']);
    expect(missing.garrisons).toEqual({});
    expect(missing.issues.some((issue) => issue.includes('missing_garrison'))).toBe(true);
  }, 60_000);
});

it('仅叙拉古提取裁度替换效果与原始黑板', () => {
  const variants = result.bonds.filter(b => b.variants);
  expect(variants.map(b => b.bondId)).toEqual(['siracusaShip']);
  expect(variants[0].variants).toHaveLength(1);
  const v = variants[0].variants![0];
  expect(v).toMatchObject({ bandId: 'band_siracusa', bandName: '裁度', effectId: 'bondeffect_siracusa' });
  expect(v.desc).not.toMatch(/[{}]/);
  expect(v.buffs[0].blackboard.nums).toEqual({ base_duration: 32, duration_per_stack: .4,
    base_attack_speed: 25, attack_speed_per_stack: .8, power_bond_char_cnt: 6, ex_bond_char_cnt: 6,
    end_duration: 10, prob: .03, base_damage: 5000, damage_per_stack: 50, fear: 3 });
});
