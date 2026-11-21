import { expect, it } from 'vitest';
import { guideCard } from './guideCard';

it.each([[375, 667], [1366, 640], [1920, 1080]])('%i × %i 下引导卡四边均在视口内', (vw, vh) => {
  // 覆盖五步可能遇到的目标位置，含整栏超高、右下角与目标缺失。
  for (const rect of [null, { left: 0, right: 320, top: 62, bottom: vh - 60 },
    { left: vw / 2, right: vw, top: -120, bottom: vh * 2 },
    { left: vw - 350, right: vw, top: 14, bottom: 160 },
    { left: vw - 350, right: vw, top: vh - 90, bottom: vh }]) {
    for (const height of [160, 220, 290, vh - 32]) {
      const { left, top } = guideCard(rect, vw, vh, 300, height, 16);
      expect(left).toBeGreaterThanOrEqual(16);
      expect(left + 300).toBeLessThanOrEqual(vw - 16);
      expect(top).toBeGreaterThanOrEqual(16);
      expect(top + height).toBeLessThanOrEqual(vh - 16);
    }
  }
});
