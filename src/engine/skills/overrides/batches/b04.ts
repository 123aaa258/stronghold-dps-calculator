import type { SkillOverride } from '../index.ts';
import { phatm2Override } from '../char_1042_phatm2.ts';
import { rosmonOverride } from '../char_391_rosmon.ts';
import { siege2Override } from '../char_1019_siege2.ts';
import { veenOverride } from '../char_4226_veen.ts';
import { ironmnOverride } from '../char_4072_ironmn.ts';
import { malistOverride } from '../char_4054_malist.ts';
import { kazemaOverride } from '../char_4016_kazema.ts';
import { blemshOverride } from '../char_423_blemsh.ts';
import { bluepOverride } from '../char_129_bluep.ts';
import { snakekOverride } from '../char_150_snakek.ts';
import { skgoatOverride } from '../char_183_skgoat.ts';
import { letoOverride } from '../char_194_leto.ts';

export const batch: Record<string, SkillOverride> = {
  char_1042_phatm2: phatm2Override,
  char_391_rosmon: rosmonOverride,
  char_1019_siege2: siege2Override,
  char_4226_veen: veenOverride,
  char_4072_ironmn: ironmnOverride,
  char_4054_malist: malistOverride,
  char_4016_kazema: kazemaOverride,
  char_423_blemsh: blemshOverride,
  char_129_bluep: bluepOverride,
  char_150_snakek: snakekOverride,
  char_183_skgoat: skgoatOverride,
  char_194_leto: letoOverride,
};
