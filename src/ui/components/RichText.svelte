<script lang="ts">
  /** 渲染游戏富文本，解析规则见 lib/richtext.ts */
  import type { Blackboard } from '../../engine/types';
  import { parseRich } from '../lib/richtext';

  /** bb：描述模板的数值来源（技能 / 天赋的 blackboard），不传则不代入 */
  let { text = '', bb = null }: { text?: string | null; bb?: Blackboard | null } = $props();
  const segs = $derived(parseRich(text, bb));
</script>

<span class="rich">{#each segs as s}{#if s.c}<span class={s.c}>{s.t}</span>{:else}{s.t}{/if}{/each}</span>

<style>
  .rich { white-space: pre-line; }
</style>
