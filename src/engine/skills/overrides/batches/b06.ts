import type { SkillOverride } from '../index.ts';
import { harukaOverride } from '../char_4202_haruka.ts';
import { lmleeOverride } from '../char_322_lmlee.ts';
import { ireneOverride } from '../char_4009_irene.ts';
import { cqbwOverride } from '../char_113_cqbw.ts';
import { yuOverride } from '../char_2026_yu.ts';
import { fang2Override } from '../char_1036_fang2.ts';
import { nothinOverride } from '../char_455_nothin.ts';
import { highmoOverride } from '../char_4066_highmo.ts';
import { aostaOverride } from '../char_346_aosta.ts';
import { astesiOverride } from '../char_274_astesi.ts';
import { yakOverride } from '../char_199_yak.ts';
import { varkisOverride } from '../char_4166_varkis.ts';

export const batch: Record<string, SkillOverride> = {
  char_4202_haruka: harukaOverride,
  char_322_lmlee: lmleeOverride,
  char_4009_irene: ireneOverride,
  char_113_cqbw: cqbwOverride,
  char_2026_yu: yuOverride,
  char_1036_fang2: fang2Override,
  char_455_nothin: nothinOverride,
  char_4066_highmo: highmoOverride,
  char_346_aosta: aostaOverride,
  char_274_astesi: astesiOverride,
  char_199_yak: yakOverride,
  char_4166_varkis: varkisOverride,
};
