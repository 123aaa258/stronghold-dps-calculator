import { beforeEach, expect, it, vi } from 'vitest';
import type { RankInput } from '../../engine/types';
import type { RankRequest, RankResponse } from './rankRow';
import { bestRankRows, type RankLite } from './rankRow';
import { rankAsync } from './rankClient';

const fake = vi.hoisted(() => ({
  requests: [] as RankRequest[],
  reply: (_response: RankResponse) => {},
  fail: () => {},
  terminate: vi.fn(),
  fallback: vi.fn<() => Iterable<RankLite>>(() => []),
}));
vi.mock('./rankRow', async importOriginal => ({
  ...await importOriginal<typeof import('./rankRow')>(),
  iterateRankLite: fake.fallback,
}));
vi.mock('./rank.worker.ts?worker&inline', () => ({
  default: class {
    onmessage?: (event: { data: RankResponse }) => void;
    onmessageerror?: (event: Event) => void;
    constructor() {
      fake.reply = data => this.onmessage?.({ data });
      fake.fail = () => this.onmessageerror?.(new Event('messageerror'));
    }
    postMessage(request: RankRequest) { fake.requests.push(request); }
    terminate = fake.terminate;
  },
}));

const input: RankInput = { bonds: [], bossId: 'boss_1', modeId: 'mode_single_1' };

beforeEach(() => {
  fake.requests.length = 0;
  vi.clearAllMocks();
});

it('取消旧配置会终止线程，晚到的回包无法覆盖新结果或写入旧条件缓存', async () => {
  const old = new AbortController();
  const cancelled = rankAsync(input, old.signal);
  const late = fake.reply;
  old.abort();
  await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
  expect(fake.terminate).toHaveBeenCalledOnce();
  const signal = new AbortController().signal;
  const next = { ...input, potential: 2 };
  const current = rankAsync(next, signal);
  late({ ok: true, rows: [], costMs: 100 });
  fake.reply({ ok: true, rows: [], costMs: 200 });
  expect((await current).costMs).toBe(200);
  expect((await rankAsync(next, signal)).costMs).toBe(200);
  const again = rankAsync(input, signal);
  expect(fake.requests.map(request => request.input)).toEqual([input, next, input]);
  fake.reply({ ok: true, rows: [], costMs: 300 });
  expect((await again).costMs).toBe(300);
  expect(fake.fallback).not.toHaveBeenCalled();
});

it('后台线程失效时，分片计算仍可响应取消', async () => {
  const controller = new AbortController();
  let secondRow = false;
  fake.fallback.mockImplementationOnce(function* () {
    setTimeout(() => controller.abort(), 0);
    yield {} as RankLite;
    secondRow = true;
    yield {} as RankLite;
  });
  const fallback = rankAsync({ ...input, potential: 3 }, controller.signal);
  fake.fail();
  await expect(fallback).rejects.toMatchObject({ name: 'AbortError' });
  expect(secondRow).toBe(false);
});

it('后台不可用时分片结果可完成，技能计算本身出错则向页面报告', async () => {
  const sig = new AbortController().signal;
  const fallback = rankAsync({ ...input, potential: 4 }, sig);
  fake.fail();
  expect((await fallback).rows).toEqual([]);
  expect(fake.fallback).toHaveBeenCalledOnce();
  const failed = rankAsync({ ...input, potential: 5 }, sig);
  fake.reply({ ok: false, error: '计算错误' });
  await expect(failed).rejects.toThrow('计算错误');
  expect(fake.fallback).toHaveBeenCalledOnce();
});

it('同一干员两阶分开，两个筛选同时开启时选到同阶最佳技能对应的模组', () => {
  const input = { charId: 'op', skillId: 's1', tier: 'b', bonds: [], equips: [], bossId: 'boss', modeId: 'mode' } as const;
  const first: RankLite = { ...input, input: { ...input, bonds: [], equips: [] }, uniEquipId: 'Y', head: 100, skill: 99, normal: 98, killTimeSec: 1 };
  const rows = [first, { ...first, uniEquipId: 'X', head: 90 }, { ...first, skillId: 's2', head: 80 },
    { ...first, tier: 'a' as const, uniEquipId: null, head: 70 }];
  expect(bestRankRows(rows, false, true)).toEqual([first, rows[2], rows[3]]);
  expect(bestRankRows(rows, true, true)).toEqual([first, rows[3]]);
});
