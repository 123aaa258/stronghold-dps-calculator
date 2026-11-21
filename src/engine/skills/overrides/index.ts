import type { BossData, OperatorData, OperatorTierData, SkillData, SkillLevelData } from '../../types.ts';
import type { GenericModel } from '../generic.ts';
export interface OverrideContext {
  /** 裸装且仅迅捷影响循环，允许专属模型提供独立的窗口期望。 */
  staticSwift?: boolean;
  targetHp?: number;
  effectsAt?: (damageEvents: number) => import('../../effects/common.ts').BattleEffects;
  cultivation?: number;
  operator: OperatorData;
  tier: OperatorTierData;
  skill: SkillData;
  level: SkillLevelData;
  boss: BossData;
}
/** 精建必须同时修正分项/生命周期/未消费键与notes；不能仅将accuracy改为exact。 */
export type SkillOverride = (context: OverrideContext, generic: GenericModel) => GenericModel;
import { logosOverride } from './char_4133_logos.ts';
import { eyjaOverride } from './char_180_amgoat.ts';
import { mlynarOverride } from './char_4064_mlynar.ts';
import { sbellOverride } from './char_1046_sbell2.ts';
import { oxiOverride } from './char_4247_oxi.ts';
import { blazeOverride } from './char_1040_blaze2.ts';
import { surtrOverride } from './char_350_surtr.ts';
import { duskOverride } from './char_2015_dusk.ts';
import { lemuenOverride } from './char_4193_lemuen.ts';
import { degenOverride } from './char_4116_blkkgt.ts';
import { nymphOverride } from './char_4146_nymph.ts';
import { whitw2Override } from './char_1038_whitw2.ts';
import { thorn2Override } from './char_1039_thorn2.ts';
import { ulpiaOverride } from './char_4145_ulpia.ts';
import { thornsOverride } from './char_293_thorns.ts';
import { chen3Override } from './char_1050_chen3.ts';
import { wisdelOverride } from './char_1035_wisdel.ts';
import { wangOverride } from './char_2027_wang.ts';
import { oblvnsOverride } from './char_4182_oblvns.ts';
import { amiya3Override } from './char_1037_amiya3.ts';
import { monstrOverride } from './char_4179_monstr.ts';
import { batch as b01 } from './batches/b01.ts';
import { batch as b02 } from './batches/b02.ts';
import { batch as b03 } from './batches/b03.ts';
import { batch as b04 } from './batches/b04.ts';
import { batch as b05 } from './batches/b05.ts';
import { batch as b06 } from './batches/b06.ts';
import { batch as b07 } from './batches/b07.ts';
import { batch as b08 } from './batches/b08.ts';
import { batch as b09 } from './batches/b09.ts';
import { batch as b10 } from './batches/b10.ts';
/** charId → 两阶全部技能精建。 */
export const overrides: Readonly<Record<string, SkillOverride | undefined>> = {
  ...b01, ...b02, ...b03, ...b04, ...b05, ...b06, ...b07, ...b08, ...b09, ...b10,
  char_1050_chen3: chen3Override, char_1035_wisdel: wisdelOverride,
  char_2027_wang: wangOverride, char_4182_oblvns: oblvnsOverride,
  char_1037_amiya3: amiya3Override,
  char_4179_monstr: monstrOverride,
  char_4146_nymph: nymphOverride, char_1038_whitw2: whitw2Override, char_1039_thorn2: thorn2Override, char_4145_ulpia: ulpiaOverride, char_293_thorns: thornsOverride, char_350_surtr: surtrOverride, char_2015_dusk: duskOverride, char_4193_lemuen: lemuenOverride, char_4116_blkkgt: degenOverride, char_1040_blaze2: blazeOverride, char_4133_logos: logosOverride, char_180_amgoat: eyjaOverride, char_4064_mlynar: mlynarOverride, char_1046_sbell2: sbellOverride, char_4247_oxi: oxiOverride };
