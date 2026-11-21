import type { CalcResult } from '../../engine/types';

/** 结果的「标题 DPS」：统一取模拟窗口（180 秒）内的总伤害 ÷ 窗口时长。 */
export function headlineOf(r: CalcResult): { value: number; label: string } {
  const sec = r.totalDamage.durationSec;
  if (sec > 0) return { value: r.totalDamage.value / sec, label: `${sec} 秒平均 DPS` };
  if (r.cycle) return { value: r.cycle.avgDps, label: '循环平均 DPS' };
  return { value: r.normal.dps, label: '平均 DPS' };
}

type Reading = { key: string; value: number };

export function headlineDelta(prev: Reading | null, next: Reading): number | null {
  if (!prev || prev.key !== next.key || prev.value <= 0 || !Number.isFinite(prev.value)) return null;
  const change = next.value / prev.value - 1;
  return Number.isFinite(change) && Math.abs(change) >= 0.0005 ? change : null;
}
