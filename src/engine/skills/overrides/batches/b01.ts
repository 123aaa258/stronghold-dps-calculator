import type { SkillOverride } from '../index.ts';
import { mantraOverride } from '../char_4204_mantra.ts';
import { svash2Override } from '../char_1045_svash2.ts';
import { shuOverride } from '../char_2025_shu.ts';
import { sntllaOverride } from '../char_341_sntlla.ts';
import { slent2Override } from '../char_1031_slent2.ts';
import { qiubaiOverride } from '../char_4082_qiubai.ts';
import { brigidOverride } from '../char_4177_brigid.ts';
import { pianstOverride } from '../char_4047_pianst.ts';
import { kaitouOverride } from '../char_499_kaitou.ts';
import { ctrailOverride } from '../char_4165_ctrail.ts';
import { wildmnOverride } from '../char_496_wildmn.ts';
import { ghostOverride } from '../char_143_ghost.ts';

export const batch: Record<string, SkillOverride> = {
  char_4204_mantra: mantraOverride,
  char_1045_svash2: svash2Override,
  char_2025_shu: shuOverride,
  char_341_sntlla: sntllaOverride,
  char_1031_slent2: slent2Override,
  char_4082_qiubai: qiubaiOverride,
  char_4177_brigid: brigidOverride,
  char_4047_pianst: pianstOverride,
  char_499_kaitou: kaitouOverride,
  char_4165_ctrail: ctrailOverride,
  char_496_wildmn: wildmnOverride,
  char_143_ghost: ghostOverride,
};
