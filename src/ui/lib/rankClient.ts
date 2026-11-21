import type { RankInput } from '../../engine/types';
import { iterateRankLite, type RankLite, type RankRequest, type RankResponse } from './rankRow';
import RankWorker from './rank.worker.ts?worker&inline';

export interface RankResult { rows: RankLite[]; costMs: number }

const cache = new Map<string, RankResult>();
const CACHE_MAX = 6;

/** 每次手动计算独享一个线程，条件改变时可以立即中止正在运行的整榜。 */
async function runInWorker(input: RankInput, signal: AbortSignal): Promise<RankResult | null> {
  let worker: Worker;
  try {
    worker = new RankWorker();
  } catch {
    return null;
  }
  let abort: (() => void) | undefined;
  try {
    return await new Promise<RankResult | null>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener('abort', abort, { once: true });
      worker.onmessage = (e: MessageEvent<RankResponse>) => {
        if (e.data.ok) resolve({ rows: e.data.rows, costMs: e.data.costMs });
        else reject(new Error(e.data.error));
      };
      const unavailable = (event: Event) => { event.preventDefault(); resolve(null); };
      worker.onerror = unavailable;
      worker.onmessageerror = unavailable;
      try {
        worker.postMessage({ input } satisfies RankRequest);
      } catch {
        resolve(null);
      }
    });
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
    worker.terminate();
  }
}

/** 浏览器限制后台线程时逐行计算，每片结束都让出主线程以响应操作。 */
async function runInSlices(input: RankInput, signal: AbortSignal): Promise<RankResult> {
  const rows: RankLite[] = [];
  const start = performance.now();
  let deadline = start;
  for (const row of iterateRankLite(input)) {
    rows.push(row);
    if (performance.now() >= deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      signal.throwIfAborted();
      deadline = performance.now() + 8;
    }
  }
  return { rows, costMs: performance.now() - start };
}

export async function rankAsync(input: RankInput, signal: AbortSignal): Promise<RankResult> {
  signal.throwIfAborted();
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
  const background = await runInWorker(input, signal);
  signal.throwIfAborted();
  const result = background ?? await runInSlices(input, signal);
  signal.throwIfAborted();
  cache.set(key, result);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return result;
}
