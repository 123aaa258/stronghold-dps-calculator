import type { SkillOverride } from '../index.ts';
import { override as mcnist } from '../char_4230_mcnist.ts';
import { override as glady } from '../char_474_glady.ts';
import { override as etlchi } from '../char_4010_etlchi.ts';
import { override as fartth } from '../char_430_fartth.ts';
import { override as judge } from '../char_4065_judge.ts';
import { override as vulpis } from '../char_4026_vulpis.ts';
import { override as slbell } from '../char_174_slbell.ts';
import { override as alga } from '../char_4245_alga.ts';
import { override as snhunt } from '../char_4211_snhunt.ts';
import { override as sidero } from '../char_333_sidero.ts';
import { override as bison } from '../char_325_bison.ts';

export const batch: Record<string, SkillOverride> = {
  char_4230_mcnist: mcnist,
  char_474_glady: glady,
  char_4010_etlchi: etlchi,
  char_430_fartth: fartth,
  char_4065_judge: judge,
  char_4026_vulpis: vulpis,
  char_174_slbell: slbell,
  char_4245_alga: alga,
  char_4211_snhunt: snhunt,
  char_333_sidero: sidero,
  char_325_bison: bison,
};
