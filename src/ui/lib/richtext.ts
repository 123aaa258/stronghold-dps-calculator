/**
 * 游戏富文本 → 片段。纯函数，供 RichText.svelte 渲染，也供测试遍历全部数据做文本审计。
 *
 * 支持的写法（来自解包数据）：
 * - `<@ba.vup>文字</>`：样式标签
 * - `<$ba.overdrive>文字</>`：术语标签（游戏里可点开看说明），只保留文字
 * - 两者可以嵌套：`<@ba.rem>技能结束后<$ba.stun>晕眩</>{stun}秒</>`
 * - `<战斗中>`：条件前缀，显示为〈战斗中〉
 * - `\n`（字面量反斜杠 n）：换行
 * - `{key:0%}`：数值占位，由 renderTemplate 代入
 */
import type { Blackboard } from '../../engine/types';
import { renderTemplate } from './template.ts';

export type RichSeg = { t: string; c?: string };

const CLASS: Record<string, string> = {
  'ba.vup': 'rt-up', 'ba.vdown': 'rt-down', 'ba.kw': 'rt-key', 'ba.rem': 'rt-gray', 'ba.acrem': 'rt-gray',
  'autochess.gray': 'rt-gray', 'autochess.dgreen': 'rt-key', 'ba.talpu': 'rt-up',
};

export function parseRich(text: string | null | undefined, bb: Blackboard | null = null): RichSeg[] {
  const src = renderTemplate(text ?? '', bb).replace(/\\n/g, '\n');
  const out: RichSeg[] = [];
  const stack: string[] = [];
  const push = (t: string, c?: string) => {
    if (!t) return;
    const prev = out[out.length - 1];
    if (prev && prev.c === c) prev.t += t;
    else out.push(c ? { t, c } : { t });
  };
  const re = /<([@$])([\w.\-[\]]+)>|<\/>|[<>]/g;
  let last = 0;
  for (const m of src.matchAll(re)) {
    push(src.slice(last, m.index), stack[stack.length - 1]);
    if (m[1] === '@') stack.push(CLASS[m[2]] ?? 'rt-key');
    else if (m[1] === '$') stack.push(stack[stack.length - 1] ?? 'rt-term'); // 术语：沿用外层样式，无外层时轻微强调
    else if (m[0] === '</>') stack.pop();
    else if (m[0] === '<') {
      stack.push('rt-cond');
      push('〈', 'rt-cond');
    } else {
      push('〉', 'rt-cond');
      stack.pop();
    }
    last = m.index! + m[0].length;
  }
  push(src.slice(last), stack[stack.length - 1]);
  return out;
}

/** 片段拼回纯文本（审计、无障碍文本用） */
export const plainText = (segs: RichSeg[]) => segs.map((s) => s.t).join('');
