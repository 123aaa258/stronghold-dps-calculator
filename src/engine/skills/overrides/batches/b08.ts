import type { SkillOverride } from '../index.ts';
import { override as nearl2 } from '../char_1014_nearl2.ts';
import { override as halo2 } from '../char_1047_halo2.ts';
import { override as demetr } from '../char_4037_demetr.ts';
import { override as ghost2 } from '../char_1023_ghost2.ts';
import { override as zumama } from '../char_416_zumama.ts';
import { override as vigil } from '../char_427_vigil.ts';
import { override as cathy } from '../char_4162_cathy.ts';
import { override as halo } from '../char_135_halo.ts';
import { override as ju } from '../char_4221_ju.ts';
import { override as utage } from '../char_337_utage.ts';
import { override as branch } from '../char_4207_branch.ts';

export const batch: Record<string, SkillOverride> = {
  char_1014_nearl2: nearl2,
  char_1047_halo2: halo2,
  char_4037_demetr: demetr,
  char_1023_ghost2: ghost2,
  char_416_zumama: zumama,
  char_427_vigil: vigil,
  char_4162_cathy: cathy,
  char_135_halo: halo,
  char_4221_ju: ju,
  char_337_utage: utage,
  char_4207_branch: branch,
};
