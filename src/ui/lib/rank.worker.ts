/// <reference lib="webworker" />
/**
 * DPS 排行的后台线程：整榜 720+ 行在这里算，界面不卡。
 * 由 rankClient.ts 以 `?worker&inline` 内联引入（单文件本地版在 file:// 下也能用）。
 */
import { iterateRankLite, type RankRequest, type RankResponse } from './rankRow';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<RankRequest>) => {
  const { input } = e.data;
  const t0 = performance.now();
  let res: RankResponse;
  try {
    res = { ok: true, rows: [...iterateRankLite(input)], costMs: performance.now() - t0 };
  } catch (err) {
    res = { ok: false, error: String(err) };
  }
  ctx.postMessage(res);
};
