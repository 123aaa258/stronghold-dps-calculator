<script lang="ts">
  import { bondById, bonds, operators } from '../data';
  import { cfg, opShopLevel, selectOperator } from '../state.svelte';
  import Avatar from './Avatar.svelte';

  let query = $state('');
  let level = $state<number | null>(null);
  let bond = $state<string | null>(null);
  /** 自选干员（玩家自带的 DIY 棋子） */
  let diyOnly = $state(false);

  const list = $derived(
    operators.filter((o) =>
      (level === null || opShopLevel(o) === level) &&
      (!diyOnly || o.diy) &&
      (bond === null || o.bondIds.includes(bond)) &&
      (!query || o.name.includes(query) || o.appellation.toLowerCase().includes(query.toLowerCase())),
    ),
  );
</script>

<section class="grid-panel" data-guide="operators">
  <header>
    <h2><span class="slab"><span class="no">01</span>OPERATOR</span><span class="zh">选择干员</span></h2>
    <input class="search" aria-label="搜索干员" placeholder="搜索干员…" bind:value={query} />
  </header>

  <div class="chips" role="group" aria-label="费用阶">
    <button class:on={level === null} onclick={() => (level = null)}>全部</button>
    {#each [1, 2, 3, 4, 5, 6] as l}
      <button class="lv" class:on={level === l} style="--lv: var(--lv-{l})" onclick={() => (level = level === l ? null : l)}>{l} 阶</button>
    {/each}
    <button class="diy" class:on={diyOnly} onclick={() => (diyOnly = !diyOnly)} title="玩家自带的干员（自选棋子）">自选干员</button>
  </div>
  <div class="chips bonds" role="group" aria-label="盟约">
    {#each bonds as b}
      <button class:on={bond === b.bondId} onclick={() => (bond = bond === b.bondId ? null : b.bondId)}>{b.name}</button>
    {/each}
  </div>

  <div class="cards">
    {#each list as op (op.charId)}
      <button
        class="card"
        class:sel={cfg.charId === op.charId}
        style="--lv: var(--lv-{opShopLevel(op)})"
        onclick={() => selectOperator(op.charId)}
        title={op.name}
      >
        <div class="pic"><Avatar src={op.images.avatar} name={op.name} level={opShopLevel(op)} /></div>
        <span class="lvtag">{opShopLevel(op)}</span>
        {#if op.diy}<span class="diytag">自选</span>{/if}
        <span class="name"><span>{op.name}</span></span>
        <span class="bondline">{op.bondIds.map((id) => bondById.get(id)?.name ?? id).join(' · ')}</span>
      </button>
    {:else}
      <p class="empty">没有符合条件的干员</p>
    {/each}
  </div>
</section>

<style>
  .grid-panel { display: flex; flex-direction: column; gap: 10px; min-height: 0; height: 100%; }
  /* 筛选区保持高度，只有卡片区滚动 */
  header, .chips { flex: none; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  h2 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; letter-spacing: 0.16em; white-space: nowrap; }
  .search {
    background: transparent; border: 0; border-bottom: 2px solid var(--ink); padding: 4px 2px; width: 120px; font-size: 14px;
    transition: width var(--t-mid) var(--ease-out), border-color var(--t-fast);
  }
  .search::placeholder { color: var(--ink-4); }
  .search:focus { outline: none; width: 170px; border-color: var(--signal-deep); }

  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button {
    background: transparent; border: 1px solid var(--hair-strong); padding: 1px 9px; font-size: 13px; color: var(--ink-2);
    transition: background var(--t-fast), color var(--t-fast), border-color var(--t-fast);
  }
  .chips button:hover { border-color: var(--ink); color: var(--ink); }
  .chips button.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }
  .chips .lv { border-left: 3px solid var(--lv); }
  .chips .lv.on { background: var(--ink); border-left-color: var(--lv); }
  .chips .diy { border-color: var(--ink); font-weight: 700; }
  .chips .diy.on { background: var(--signal); color: var(--ink); border-color: var(--ink); }
  .diytag {
    position: absolute; top: 4px; right: 4px; z-index: 2; padding: 0 5px; font-size: 11px; font-weight: 800; letter-spacing: 0.06em;
    background: var(--signal); color: var(--ink);
  }
  .bonds { padding-bottom: 8px; border-bottom: 1px solid var(--hair); }

  .cards {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); grid-auto-rows: max-content; align-content: start; gap: 6px;
    flex: 1 1 auto; overflow-y: auto; padding: 4px 4px 12px 2px; min-height: 0;
  }
  .card {
    position: relative; display: flex; flex-direction: column; padding: 0; background: var(--ink);
    border: 0; overflow: hidden; text-align: left; color: var(--paper);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%);
    transition: transform var(--t-mid) var(--ease-out), box-shadow var(--t-mid);
  }
  /* 左侧费用阶色条 */
  .card::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--lv); z-index: 2; }
  .pic { aspect-ratio: 1; position: relative; background: var(--paper-2); }
  .pic::after { content: ''; position: absolute; inset: 55% 0 0 0; background: linear-gradient(transparent, rgba(17, 18, 20, 0.85)); }
  .card :global(img) { transition: transform 600ms var(--ease-out), filter var(--t-mid); filter: grayscale(0.25) contrast(1.05); }
  .card:hover :global(img) { transform: scale(1.08); filter: none; }
  .card:hover { transform: translateY(-2px); }
  .card.sel { box-shadow: 0 0 0 3px var(--signal); }
  .card.sel::after {
    content: ''; position: absolute; right: 0; bottom: 0; width: 22px; height: 22px; background: var(--signal);
    clip-path: polygon(100% 0, 100% 100%, 0 100%);
  }
  .lvtag {
    position: absolute; top: 2px; left: 7px; z-index: 2; font-family: var(--font-display); font-stretch: 75%;
    font-size: 22px; font-weight: 800; line-height: 1; color: var(--paper); text-shadow: 0 1px 0 var(--ink), 0 0 8px rgba(0, 0, 0, 0.6);
  }
  .name {
    position: relative; z-index: 2; margin-top: -20px; padding: 0 6px 1px 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.04em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .bondline { font-size: 11px; color: var(--ink-4); padding: 2px 6px 6px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; letter-spacing: 0.04em; }
  .empty { color: var(--ink-3); grid-column: 1 / -1; text-align: center; padding: 30px 0; }

  @media (max-width: 1100px) {
    .grid-panel { height: auto; }
    .cards { flex: none; max-height: 58vh; }
  }
  @media (max-width: 700px) {
    /* 手机：盟约筛选收成一行横向滑动，把高度留给干员卡 */
    .chips.bonds { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
    .chips.bonds button { flex: none; }
    .cards { grid-template-columns: repeat(auto-fill, minmax(78px, 1fr)); }
  }
</style>
