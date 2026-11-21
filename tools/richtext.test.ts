import { expect, it } from 'vitest';
import type { Blackboard, OperatorData, SkillData, TalentData, TokenData } from '../src/engine/types.ts';
import { parseRich, plainText } from '../src/ui/lib/richtext.ts';
import operators from '../src/data/generated/operators.json';
import skills from '../src/data/generated/skills.json';
import tokens from '../src/data/generated/tokens.json';
import bonds from '../src/data/generated/bonds.json';
import bosses from '../src/data/generated/bosses.json';
import equips from '../src/data/generated/equips.json';
import garrisons from '../src/data/generated/garrisons.json';

it('全部生成描述经过界面解析后无游戏标记或缺失值', () => {
  const failures: string[] = [];
  let total = 0;
  function audit(id: string, text: string | null, bb?: Blackboard) {
    if (text == null) return;
    total++;
    const rendered = plainText(parseRich(text, bb));
    if (/[<>${}]|@ba|\\n|undefined|NaN/.test(rendered)) failures.push(`${id}: ${rendered}`);
  }
  function talents(id: string, data: { talents?: TalentData[]; trait?: TalentData | null }) {
    if (data.trait) audit(`${id}.trait`, data.trait.desc, data.trait.blackboard);
    for (const talent of data.talents ?? []) audit(`${id}.talent.${talent.index}`, talent.desc, talent.blackboard);
  }
  for (const op of operators as unknown as OperatorData[]) {
    for (const tier of Object.values(op.tiers)) {
      audit(tier.chessId, tier.chessDesc);
      talents(tier.chessId, tier);
    }
  }
  // skills.json 同时保存所有被引用的召唤物技能，包含单级技能。
  for (const skill of Object.values(skills) as SkillData[]) {
    for (const [lv, level] of Object.entries(skill.levels)) audit(`${skill.skillId}.${lv}`, level.description, level.blackboard);
  }
  for (const token of Object.values(tokens) as TokenData[]) {
    talents(token.tokenId, token);
    for (const [tier, state] of Object.entries(token.tiers)) talents(`${token.tokenId}.${tier}`, state);
  }
  for (const g of Object.values(garrisons)) audit(g.garrisonId, g.desc, g.blackboard as Blackboard);
  for (const b of bonds) audit(b.bondId, b.desc);
  for (const e of equips) audit(e.chessId, e.desc);
  for (const b of bosses) audit(b.bossId, b.description);
  expect(failures, `共审计 ${total} 条文本`).toEqual([]);
});

it('嵌套条件保留人数与强调样式，术语保留名称', () => {
  expect(parseRich('<在场<@autochess.dgreen>3</>名干员><$ba.overdrive>过载</>')).toEqual([
    { t: '〈在场', c: 'rt-cond' }, { t: '3', c: 'rt-key' },
    { t: '名干员〉', c: 'rt-cond' }, { t: '过载', c: 'rt-term' },
  ]);
});
