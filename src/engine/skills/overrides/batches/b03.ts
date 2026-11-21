import type { SkillOverride } from '../index.ts';
import { skadi2Override } from '../char_1012_skadi2.ts';
import { closurOverride } from '../char_4228_closur.ts';
import { acrbotOverride } from '../char_618_acrbot.ts';
import { ebnhlzOverride } from '../char_4046_ebnhlz.ts';
import { aglinaOverride } from '../char_291_aglina.ts';
import { kjeraOverride } from '../char_4013_kjera.ts';
import { ethanOverride } from '../char_355_ethan.ts';
import { auroraOverride } from '../char_422_aurora.ts';
import { greyy2Override } from '../char_1027_greyy2.ts';
import { podegoOverride } from '../char_258_podego.ts';
import { swllowOverride } from '../char_367_swllow.ts';
import { frostlOverride } from '../char_193_frostl.ts';

export const batch: Record<string, SkillOverride> = {
  char_1012_skadi2: skadi2Override,
  char_4228_closur: closurOverride,
  char_618_acrbot: acrbotOverride,
  char_4046_ebnhlz: ebnhlzOverride,
  char_291_aglina: aglinaOverride,
  char_4013_kjera: kjeraOverride,
  char_355_ethan: ethanOverride,
  char_422_aurora: auroraOverride,
  char_1027_greyy2: greyy2Override,
  char_258_podego: podegoOverride,
  char_367_swllow: swllowOverride,
  char_193_frostl: frostlOverride,
};
