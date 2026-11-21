import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { GameDataMeta, OperatorData, TokenData, GarrisonData, SkillData } from '../../src/engine/types.ts';

const root = resolve(import.meta.dirname, '../..');
function generated<T>(name: string, fallback: T): T {
  const path = resolve(root, 'src/data/generated', `${name}.json`);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) as T : fallback;
}
const operators = generated<OperatorData[]>('operators', []);
const tokens = generated<Record<string, TokenData>>('tokens', {});
const garrisons = generated<Record<string, GarrisonData>>('garrisons', {});
const skills = generated<Record<string, SkillData>>('skills', {});
const lock = JSON.parse(readFileSync(resolve(root, 'tools/gamedata.lock.json'), 'utf8'));
const activity = JSON.parse(readFileSync(resolve(root, `.cache/gamedata/${lock.commit}/excel/activity_table.json`), 'utf8'));
const shops = Object.values(activity.activity.AUTOCHESS.act3autochess.V3_1.charShopChessDatas) as { chessType: string; charId: string | null; tmplId: string | null }[];
const fixedIds = new Set(shops.filter(s => s.chessType !== 'DIY' && s.charId).map(s => s.tmplId ?? s.charId));
const operator = (name: string) => operators.find(op => op.name === name)!;

describe('真实生成干员数据', () => {
  it('覆盖固定棋子所有非空唯一 charId，均有两阶及可解析卫戍特质', () => {
    const fixed = operators.filter(op => !op.diy);
    expect(new Set(fixed.map(op => op.charId))).toEqual(fixedIds);
    // 摘要覆盖阿米娅医疗模板之外的 142 名固定棋子，省略图片、模组选项、潜能与模组覆盖。
    const baseline = fixed.filter(op => op.charId !== 'char_1037_amiya3').map(({ images, uniEquips, ...op }) => ({
      ...op, tiers: Object.fromEntries(Object.entries(op.tiers).map(([key, { potentialSteps, uniEquipVariants, ...tier }]) => [key, tier])),
    })).sort((a, b) => a.charId < b.charId ? -1 : 1);
    expect(createHash('sha256').update(JSON.stringify(baseline)).digest('hex'))
      .toBe('38e6c920d4b135d41b165256d3c5b16593864cfe02bb2b0769d25fcdf5b005f7');
    for (const op of operators) for (const tier of ['a', 'b'] as const) {
      expect(op.tiers[tier].chessId.endsWith(`_${tier}`)).toBe(true);
      for (const id of op.tiers[tier].garrisonIds) expect(garrisons[id]).toBeDefined();
    }
  });

  it('配置的四名自选干员共享六费棋子，两阶可用全部三个技能', () => {
    const diy = operators.filter(op => op.diy);
    expect(diy.map(op => op.name).sort()).toEqual(['赤刃明霄陈', '望', '丰川祥子', '维什戴尔'].sort());
    for (const op of diy) {
      expect(op.shopLevel).toBe(6);
      expect(op.bondIds).toEqual([['望', '赤刃明霄陈'].includes(op.name) ? 'yanShip' : 'emptyShip']);
      expect(op.defaultSkillIndex).toBe(2);
      expect(op.skillIds).toHaveLength(3);
      for (const tier of ['a', 'b'] as const) {
        const state = op.tiers[tier];
        expect(state).toMatchObject({ chessId: `chess_char_6_diy1_${tier}`, evolvePhase: 2, level: tier === 'a' ? 1 : 60,
          skillLevel: tier === 'a' ? 4 : 7, uniEquipLevel: tier === 'a' ? 0 : 3, favorPoint: 0, potentialRank: 0,
          equipSlotNum: 2, garrisonIds: [], chessDesc: null });
        const five = op.diyVariants?.[5]?.[tier];
        expect(five).toMatchObject({ chessId: `chess_char_5_diy1_${tier}`, uniEquipLevel: tier === 'a' ? 0 : 1 });
        if (tier === 'a') expect(five).toEqual({ ...state, chessId: 'chess_char_5_diy1_a' });
        for (const id of op.skillIds) expect(skills[id]?.levels[state.skillLevel]).toBeDefined();
        for (const id of op.tokenIds) expect(tokens[id]?.tiers[tier]).toBeDefined();
      }
    }
  });

  it('按游戏顺序列出全部非证章模组，普通阶没有模组覆盖', () => {
    const catalog = JSON.parse(readFileSync(resolve(root, `.cache/gamedata/${lock.commit}/excel/uniequip_table.json`), 'utf8'));
    for (const op of operators) {
      const ids = (catalog.charEquip[op.charId] ?? []).filter((id: string) => catalog.equipDict[id].type !== 'INITIAL') as string[];
      expect(op.uniEquips?.map(e => e.uniEquipId)).toEqual(ids.length ? ids : undefined);
      for (const option of op.uniEquips ?? []) {
        const raw = catalog.equipDict[option.uniEquipId];
        expect(option.typeIcon).toBe(raw.typeIcon.toUpperCase());
        expect(option.name).toBe(raw.uniEquipName);
        expect(option.attrOnly === true).toBe(['ISW-A', 'RA-A'].includes(option.typeIcon));
      }
      for (const tiers of [op.tiers, ...Object.values(op.diyVariants ?? {})]) {
        expect(tiers!.a.uniEquipVariants).toBeUndefined();
        expect(Object.keys(tiers!.b.uniEquipVariants ?? {})).toEqual(ids.filter(id => id !== tiers!.b.uniEquipId));
      }
    }
  });

  it('空弦 ISW-A 与 MAR-X 面板手算，ISW-A 还原无模组特性及天赋', () => {
    const base = operator('空弦').tiers.b;
    const isw = base.uniEquipVariants!.uniequip_004_archet!;
    const mar = base.uniEquipVariants!.uniequip_003_archet!;
    const atk = 427 + (528 - 427) * 59 / 89 + 32;
    expect(isw.attributes?.atk).toBeCloseTo(atk, 10);
    expect(mar.attributes?.atk).toBeCloseTo(atk, 10);
    expect(isw.attributes?.attackSpeed).toBe(106);
    expect(mar.attributes?.attackSpeed).toBe(100);
    expect(isw.attributes?.maxHp).toBeUndefined();
    expect(mar.attributes?.maxHp).toBeCloseTo(base.attributes.maxHp + 90, 10);
    expect({ ...base.trait, ...isw.trait }).toMatchObject({ desc: '优先攻击空中单位', blackboard: { nums: {} }, equipMods: [] });
    expect(isw.talents).toEqual({ 2: null });
    expect(base.talents.slice(0, 2).map(t => t.equipMods)).toEqual([[], []]);
    expect(isw.potentialSteps).toBeUndefined();
    expect(operator('佩佩').uniEquips).toContainEqual(expect.objectContaining({ typeIcon: 'RA-A', attrOnly: true }));
    expect(operator('佩佩').tiers.b.uniEquipVariants!.uniequip_003_pepe!.trait?.equipMods).toEqual([]);
  });

  it('召唤物按模组覆盖属性、isToken 天赋及潜能阈值', () => {
    const dusk = tokens.token_10015_dusk_drgn!.tiers.b!;
    expect(dusk.uniEquipVariants!.uniequip_003_dusk).toMatchObject({
      attributes: { atk: 423 }, talents: { 1: { blackboard: { nums: { interval: 1.5, sp: 1 } } } },
    });
    // 夕的 ISW-A 没有召唤物属性加成，和默认 SPC-X 的小自在相同。
    expect(dusk.uniEquipVariants!.uniequip_004_dusk).toBeUndefined();
    const pile = tokens.token_10027_ironmn_pile1!.tiers.b!;
    expect(pile.maxDeckStackCnt).toBe(1);
    expect(pile.uniEquipVariants!.uniequip_003_ironmn!.maxDeckStackCnt).toBe(0);
    const seaborn = tokens.token_10017_skadi2_dedant!.tiers.b!;
    expect(seaborn.uniEquipVariants!.uniequip_003_skadi2!.potentialSteps?.[0]).toMatchObject({
      rank: 4, talents: { 1: { blackboard: { nums: { 'skadi2_e_003_t_2[atk][1].atk': 0.12 } } } },
    });
  });

  it('五费阿米娅按医疗模板取职业、两项技能和模组', () => {
    const amiya = operator('阿米娅');
    expect(amiya).toMatchObject({ charId: 'char_1037_amiya3', profession: 'MEDIC', subProfessionId: 'incantationmedic',
      defaultSkillIndex: 1, skillIds: ['skchr_amiya3_1', 'skchr_amiya3_2'], tiers: { b: { uniEquipId: 'uniequip_002_amiya3' } } });
    for (const id of amiya.skillIds) expect(skills[id]?.levels[amiya.tiers.b.skillLevel]).toBeDefined();
  });

  it('练度倍率和潜能阈值使用实际黑板，保留主人潜能改变的召唤物天赋', () => {
    expect(generated<GameDataMeta | null>('meta', null)?.cultivation).toEqual({
      1: { atk: 1, def: 1, maxHp: 1 }, 1001: { atk: 1.05, def: 1.05, maxHp: 1 },
      2001: { atk: 1.1, def: 1.05, maxHp: 1.05 }, 2060: { atk: 1.1, def: 1.1, maxHp: 1.1 },
    });
    const steps = operator('艾雅法拉').tiers.b.potentialSteps;
    expect(steps?.map(step => step.rank)).toEqual([2, 3, 5]);
    expect(steps?.[0]?.talents?.[1]?.blackboard?.nums).toEqual({ sp_min: 10, sp_max: 20 });
    expect(steps?.[1]?.attributes).toEqual({ atk: 27 });
    expect(steps?.[2]?.talents?.[0]?.blackboard?.nums.atk).toBe(0.16);
    const stone = tokens.token_10064_wang_stone1!.tiers.b!;
    expect(stone.potentialSteps?.find(step => step.rank === 2)?.talents?.[0]?.blackboard?.nums.max_deck_stack_cnt).toBe(1);
  });

  it('部署位置覆盖所有干员，近战特质允许远程部署的棋子归为 ALL', () => {
    expect(operators.every(op => ['MELEE', 'RANGED', 'ALL'].includes(op.position))).toBe(true);
    expect(operators.filter(op => op.position === 'ALL').map(op => op.name).sort()).toEqual(['温蒂', '歌蕾蒂娅'].sort());
    expect(operator('缪尔赛思').position).toBe('RANGED');
    expect(operator('艾丝黛尔').position).toBe('MELEE');
  });

  it('蓝毒两阶分别选精一/精二神经毒素', () => {
    expect(operator('蓝毒')?.tiers.a.talents[0]?.blackboard.nums.poison_damage).toBe(30);
    expect(operator('蓝毒')?.tiers.b.talents[0]?.blackboard.nums.poison_damage).toBe(75);
  });

  it('鸿雪关联打字机并保留 b 阶召唤物属性', () => {
    expect(operator('鸿雪')?.tokenIds).toContain('token_10026_bgsnow_subbow');
    // token 精二 60：666 + (866 - 666) * (60 - 1) / (90 - 1)，该模组无 token 属性加成。
    expect(tokens.token_10026_bgsnow_subbow?.tiers.b?.attributes.atk).toBeCloseTo(666 + 200 * 59 / 89, 10);
  });

  it('召唤物空技能槽不生成 null 引用，固定单级技能保留真实等级', () => {
    expect(Object.values(tokens).every(token => token.skillIds.every(id => typeof id === 'string' && id.length > 0))).toBe(true);
    // 战车技能在原表仅有 level 1，不能读取主人 level 7 后得到空 levels。
    expect(skills.sktok_mitm_trshrb_1?.levels['1']).toMatchObject({
      description: '作为小车形态存在时被击败后会在周围四格生成残骸', spType: 'PASSIVE', prefabId: null,
    });
    expect(tokens.token_10037_mitm_trshrb?.tiers.b?.skillLevels?.sktok_mitm_trshrb_1).toBe(1);
  });

  it('逻各斯 TALENT_DATA_ONLY 用新参数覆盖而不相加', () => {
    // 普通精二 atk_scale=0.60；uniequip_003_logos 三级、潜能0 candidate 为0.65，非0.60+0.65。
    const talent = operator('逻各斯')?.tiers.b.talents.find(t => t.index === 0);
    expect(talent?.blackboard.nums.atk_scale).toBe(0.65);
    expect(talent?.blackboard.nums.emit_count).toBe(2);
    expect(talent?.equipMods).toContainEqual({ equipId: 'uniequip_003_logos', mode: 'data_only', target: 'TALENT_DATA_ONLY' });
  });

  it('机械师 rogue_6 限定模组部件不作用于卫戍或召唤物', () => {
    // uniequip_002_mcnist parts 的 validInMapTag=rogue_6；原 token 精二持续30秒。
    expect(operator('机械师')?.tiers.b.talents.every(t => t.equipMods.length === 0)).toBe(true);
    expect(tokens.token_10069_mcnist_mcgraf?.tiers.b?.talents?.[0]?.blackboard.nums['skill@duration']).toBe(30);
  });

  it('技能 blackboard 字符串参数只放 strs，不作为数值零导出', () => {
    const bb = skills.skchr_sbell2_2!.levels['7']!.blackboard;
    expect(bb.strs?.['talent@token_key']).toBeTruthy();
    expect(bb.nums['talent@token_key']).toBeUndefined();
  });

  it('蓝毒 b 阶 atk 等于基础插值加信赖/潜能/模组', () => {
    // 精二55级：438+(535-438)*(55-1)/(80-1)；favorPoint=0→+0；pot0→+0；模组1级+20。
    expect(operator('蓝毒')?.tiers.b.attributes.atk).toBeCloseTo(438 + 97 * 54 / 79 + 0 + 0 + 20, 10);
  });

  it('逻各斯 b 阶 atk 等于基础插值加信赖/潜能/模组', () => {
    // 精二60级：556+(671-556)*(60-1)/(90-1)；favorPoint=0→+0；pot0→+0；模组3级+60。
    expect(operator('逻各斯')?.tiers.b.attributes.atk).toBeCloseTo(556 + 115 * 59 / 89 + 0 + 0 + 60, 10);
  });
});
