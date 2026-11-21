<script lang="ts">
  import { cfg, CULTIVATIONS, DIY_LEVELS } from '../state.svelte';

  /**
   * 自身练度映射 + 潜能 + 自选干员棋子阶数。写在全局 cfg，计算器与排行共用。
   * showDiy：计算器只在选中自选干员时显示阶数切换；排行始终显示（作用于全部自选干员）。
   */
  let { showDiy = true }: { showDiy?: boolean } = $props();
  const POTS = [0, 1, 2, 3, 4, 5];
</script>

<div class="training">
  <div class="row">
    <span class="k">自身练度</span>
    <div class="seg" role="radiogroup" aria-label="自身练度">
      {#each CULTIVATIONS as c (c.value)}
        <button role="radio" aria-checked={cfg.cultivation === c.value} class:on={cfg.cultivation === c.value}
          onclick={() => (cfg.cultivation = c.value)}>{c.label}</button>
      {/each}
    </div>
  </div>
  <div class="row">
    <span class="k">潜能</span>
    <div class="seg pots" role="radiogroup" aria-label="潜能">
      {#each POTS as p (p)}
        <button role="radio" aria-checked={cfg.potential === p} class:on={cfg.potential === p}
          onclick={() => (cfg.potential = p)} title="{p + 1} 潜{p === 5 ? '（满潜）' : ''}">{p + 1}</button>
      {/each}
    </div>
  </div>
  {#if showDiy}
    <div class="row">
      <span class="k">自选干员</span>
      <div class="seg" role="radiogroup" aria-label="自选干员棋子阶数">
        {#each DIY_LEVELS as l (l)}
          <button role="radio" aria-checked={cfg.diyShopLevel === l} class:on={cfg.diyShopLevel === l}
            onclick={() => (cfg.diyShopLevel = l)}>{l} 阶</button>
        {/each}
      </div>
      <small class="hint">只影响精锐阶模组等级（5 阶 1 级 / 6 阶 3 级）</small>
    </div>
  {/if}
</div>

<style>
  .training { display: flex; flex-direction: column; gap: 6px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .k { flex: none; width: 64px; font-size: 13px; font-weight: 700; color: var(--ink-2); letter-spacing: 0.06em; }
  .seg { display: flex; flex-wrap: wrap; border: 1px solid var(--ink); }
  .seg button {
    padding: 2px 10px; font-size: 13px; font-weight: 700; background: none; border: 0; color: var(--ink-3); white-space: nowrap;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .seg button + button { border-left: 1px solid var(--ink); }
  .seg button:hover { color: var(--ink); background: var(--paper-2); }
  .seg button.on { background: var(--ink); color: var(--paper); }
  .pots button { min-width: 30px; padding: 2px 0; }
  .hint { flex-basis: 100%; padding-left: 74px; font-size: 12px; color: var(--ink-3); }
  @media (max-width: 700px) { .hint { padding-left: 0; } }
</style>
