import { describe, expect, it } from 'vitest';
import { assetUrls } from './fetch-assets.ts';

describe('素材候选来源', () => {
  it('各类素材保留主源在前、锁定快照的备用源在后', () => {
    for (const kind of ['avatar', 'portrait', 'boss', 'bond', 'equip'] as const) {
      const urls = assetUrls(kind, 'test_id');
      const primaryCount = kind === 'portrait' || kind === 'avatar' ? 2 : 1;
      expect(urls).toHaveLength(primaryCount * 2);
      const commits = urls.map(url => new URL(url).pathname.split('/')[3]);
      for (const commit of commits) expect(commit).toMatch(/^[a-f0-9]{40}$/);
      expect(new Set(commits.slice(0, primaryCount)).size).toBe(1);
      expect(new Set(commits.slice(primaryCount)).size).toBe(1);
      expect(commits[0]).not.toBe(commits[primaryCount]);
      expect(urls.every(url => url.includes('test_id'))).toBe(true);
    }
  });

  it('立绘仅尝试 skin 的完整立绘；每个来源先 _1b 再 _2b', () => {
    const urls = assetUrls('portrait', 'char_4247_oxi');
    expect(urls.map(url => url.slice(url.indexOf('/skin/')))).toEqual([
      '/skin/char_4247_oxi_1b.png', '/skin/char_4247_oxi_2b.png',
      '/skin/char_4247_oxi_1b.png', '/skin/char_4247_oxi_2b.png',
    ]);
  });

  it('资源路径按段编码，保留 AA2 方括号目录', () => {
    expect(assetUrls('bond', 'icon_docship')[1]).toContain('/%5Buc%5Dautochesscommon/arts/bondicon/icon_docship.png');
  });
});
