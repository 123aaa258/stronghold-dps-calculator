import type { SkillOverride } from '../index.ts';
import { override as clemnt } from '../char_4231_clemnt.ts';
import { override as lisa } from '../char_358_lisa.ts';
import { override as pepe } from '../char_4058_pepe.ts';
import { override as weedy } from '../char_400_weedy.ts';
import { override as helage } from '../char_188_helage.ts';
import { override as buildr } from '../char_488_buildr.ts';
import { override as robrta } from '../char_484_robrta.ts';
import { override as liesel } from '../char_4031_liesel.ts';
import { override as gravel } from '../char_237_gravel.ts';
import { override as cammou } from '../char_328_cammou.ts';
import { override as estell } from '../char_127_estell.ts';

export const batch: Record<string, SkillOverride> = {
  char_4231_clemnt: clemnt,
  char_358_lisa: lisa,
  char_4058_pepe: pepe,
  char_400_weedy: weedy,
  char_188_helage: helage,
  char_488_buildr: buildr,
  char_484_robrta: robrta,
  char_4031_liesel: liesel,
  char_237_gravel: gravel,
  char_328_cammou: cammou,
  char_127_estell: estell,
};
