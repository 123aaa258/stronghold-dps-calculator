import type { Blackboard } from '../../engine/types';

/**
 * 把游戏描述模板中的占位符代入 blackboard 数值。
 * 支持：{key}、{key:0%}、{key:0.0%}、{key:0.0}、{-key:0%}（取负）、{key@sub:0%}（键名含特殊字符）。
 * 缺失的静态键原样保留，便于发现数据问题。
 */
export function renderTemplate(text: string | null | undefined, bb?: Blackboard | null): string {
  if (!text?.includes('{')) return text ?? '';
  const nums = new Map<string, number>();
  for (const [k, v] of Object.entries(bb?.nums ?? {})) nums.set(k.toLowerCase(), v);
  const strs = new Map<string, string>();
  for (const [k, v] of Object.entries(bb?.strs ?? {})) strs.set(k.toLowerCase(), v);

  return text.replace(/\{(-?)([^{}:]+?)(?::([0-9.]+)(%?))?\}/g, (whole, neg: string, rawKey: string, fmt?: string, pct?: string) => {
    const key = rawKey.trim().toLowerCase();
    // showtag 是对局实时计数；静态页面用破折号表示没有对局值。
    if (!nums.has(key)) return strs.get(key) ?? (key === 'showtag_value_1' ? '—' : whole);
    let v = nums.get(key)!;
    if (neg) v = -v;
    if (pct) v *= 100;
    const decimals = fmt?.includes('.') ? fmt.split('.')[1].length : 0;
    const s = fmt ? v.toFixed(decimals) : String(Math.round(v * 1000) / 1000);
    return s + (pct ? '%' : '');
  });
}
