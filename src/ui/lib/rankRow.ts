import type { CalcInput, ChessTier, OperatorData, RankInput, RankRow } from '../../engine/types';
import { iterateRankRows } from '../../engine/rank';
import operatorsJson from '../../data/generated/operators.json';
import { headlineOf } from './headline';

/** 排行不计入自选干员（玩家自带的 DIY 棋子，强度取决于玩家自己的配置，不参与排名） */
const DIY = new Set((operatorsJson as unknown as OperatorData[]).filter((o) => o.diy).map((o) => o.charId));

/** 逐行精简，同时允许后台线程不可用时在两行之间让出界面。 */
export function* iterateRankLite(input: RankInput): Generator<RankLite> {
  for (const row of iterateRankRows(input, DIY)) yield toLite(row);
}

/**
 * 排行一行的精简版：只带界面要显示和排序的数。完整 CalcResult 带大量推导步骤，
 * 跨线程传回主线程的结构化克隆会卡住界面（实测 720 行约 0.5 秒），所以在 Worker 里先压缩。
 */
export interface RankLite {
  charId: string;
  tier: ChessTier;
  skillId: string;
  /** 精锐阶模组；普通阶或无模组为 null */
  uniEquipId: string | null;
  input: CalcInput;
  /** 标题 DPS（headlineOf） */
  head: number;
  /** 技能期 DPS；无技能期或瞬发技能为 null */
  skill: number | null;
  normal: number;
  killTimeSec: number;
}
/** 输入已按所选指标由优到劣排列。两项都勾选时，每个阶级只留第一行。 */
export function bestRankRows(rows: RankLite[], bestSkill: boolean, bestMod: boolean) {
  if (!bestSkill && !bestMod) return rows;
  const seen = new Set<string>();
  return rows.filter(row => {
    const key = bestSkill ? `${row.charId}|${row.tier}` : `${row.charId}|${row.tier}|${row.skillId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function toLite(r: RankRow): RankLite {
  return {
    charId: r.charId, tier: r.tier, skillId: r.skillId, uniEquipId: r.uniEquipId ?? r.input.uniEquipId ?? null, input: r.input,
    head: headlineOf(r.result).value,
    // 瞬发技能（如强力击）的技能期只是一次攻击，不单列技能期 DPS
    skill: r.result.lifecycle === 'instant' ? null : r.result.skill?.dps ?? null, normal: r.result.normal.dps, killTimeSec: r.result.killTimeSec,
  };
}

export interface RankRequest { input: RankInput }
export type RankResponse =
  | { ok: true; rows: RankLite[]; costMs: number }
  | { ok: false; error: string };

