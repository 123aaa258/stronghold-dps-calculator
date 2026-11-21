import type { SkillOverride } from '../index.ts';
import { cetsyrOverride } from '../char_4134_cetsyr.ts';
import { bgsnowOverride } from '../char_4055_bgsnow.ts';
import { headb2Override } from '../char_1051_headb2.ts';
import { pasngrOverride } from '../char_472_pasngr.ts';
import { jesca2Override } from '../char_1034_jesca2.ts';
import { billroOverride } from '../char_426_billro.ts';
import { hboundOverride } from '../char_4232_hbound.ts';
import { skadiOverride } from '../char_263_skadi.ts';
import { cuttleOverride } from '../char_218_cuttle.ts';
import { bubbleOverride } from '../char_381_bubble.ts';
import { quercuOverride } from '../char_492_quercu.ts';
import { jakselOverride } from '../char_347_jaksel.ts';

export const batch: Record<string, SkillOverride> = {
  char_4134_cetsyr: cetsyrOverride,
  char_4055_bgsnow: bgsnowOverride,
  char_1051_headb2: headb2Override,
  char_472_pasngr: pasngrOverride,
  char_1034_jesca2: jesca2Override,
  char_426_billro: billroOverride,
  char_4232_hbound: hboundOverride,
  char_263_skadi: skadiOverride,
  char_218_cuttle: cuttleOverride,
  char_381_bubble: bubbleOverride,
  char_492_quercu: quercuOverride,
  char_347_jaksel: jakselOverride,
};
