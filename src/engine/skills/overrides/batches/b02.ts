import type { SkillOverride } from '../index.ts';
import { mlyssOverride } from '../char_249_mlyss.ts';
import { flamtlOverride } from '../char_420_flamtl.ts';
import { demkniOverride } from '../char_202_demkni.ts';
import { heyakOverride } from '../char_4027_heyak.ts';
import { gnosisOverride } from '../char_206_gnosis.ts';
import { hodrerOverride } from '../char_4088_hodrer.ts';
import { kichiOverride } from '../char_4203_kichi.ts';
import { udflowOverride } from '../char_4137_udflow.ts';
import { mitmOverride } from '../char_4147_mitm.ts';
import { glassbOverride } from '../char_195_glassb.ts';
import { meteoOverride } from '../char_219_meteo.ts';
import { frncatOverride } from '../char_185_frncat.ts';

export const batch: Record<string, SkillOverride> = {
  char_249_mlyss: mlyssOverride,
  char_420_flamtl: flamtlOverride,
  char_202_demkni: demkniOverride,
  char_4027_heyak: heyakOverride,
  char_206_gnosis: gnosisOverride,
  char_4088_hodrer: hodrerOverride,
  char_4203_kichi: kichiOverride,
  char_4137_udflow: udflowOverride,
  char_4147_mitm: mitmOverride,
  char_195_glassb: glassbOverride,
  char_219_meteo: meteoOverride,
  char_185_frncat: frncatOverride,
};
