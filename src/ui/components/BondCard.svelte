<script lang="ts">
  import { bondById } from '../data';
  import { AUTO_BONDS, cfg, setBond } from '../state.svelte';
  import { bondTiers, teamTiers, currentTier, hasStacks, ATK_MAX, STACK_MAX, tierSelected, type BondTier } from '../lib/bondTiers';
  import RichText from './RichText.svelte';

  /** 一个盟约的档位 + 层数设置。设置写在全局 cfg.bonds，计算器与排行共用同一套阵容。 */
  let {
    id, note = null, gifted = false, compact = false, team = false,
  }: { id: string; note?: string | null; gifted?: boolean; compact?: boolean; team?: boolean } = $props();

  const b = $derived(bondById.get(id));
  const set = $derived(cfg.bonds[id]);
  /** team：计算器「全场盟约」区，只给对非成员有效的档位 */
  const tiers = $derived(b ? (team ? teamTiers(b) : bondTiers(b)) : []);
  const auto = $derived(AUTO_BONDS.has(id));
  const tier = $derived(set ? currentTier(tiers, set.activeChars) : 0);
  const active = $derived(tier > 0);
  const powered = $derived(!!b && b.powerCount !== null && tier >= b.powerCount);

  /** 选中的策略版本（如叙拉古「裁度」），只在强化档有效 */
  const variant = $derived(b?.variants?.find((v) => v.bandId === set?.bandId && tiers.some((t) => t.value === tier && t.bandId === v.bandId)));

  function setTier(t: BondTier) {
    setBond({ ...cfg.bonds[id], activeChars: t.value, bandId: t.bandId });
  }
  /** 阿戈尔：吞噬的所有干员基础攻击力之和 */
  function setDevoured(field: HTMLInputElement) {
    const v = Math.max(0, Math.min(ATK_MAX, Math.floor(Number(field.value) || 0)));
    field.value = String(v);
    setBond({ ...cfg.bonds[id], devouredAtk: v });
  }
  function setStacks(field: HTMLInputElement) {
    const v = Math.max(0, Math.min(STACK_MAX, Math.floor(Number(field.value) || 0)));
    field.value = String(v);
    setBond({ ...cfg.bonds[id], stacks: v });
  }
</script>

{#if b && set}
  <div class="bond" class:active class:powered class:compact>
    <div class="bond-head">
      <b>{b.name}</b>
      {#if gifted}<span class="gift">同构赠送</span>{/if}
      {#if auto}
        <span class="auto">{active ? '干员在场即生效' : '未激活'}</span>
      {:else}
      <div class="tiers" role="radiogroup" aria-label="{b.name}档位">
        {#each tiers as t (t.label)}
          {@const sel = tierSelected(tiers, t, tier, set.bandId)}
          <button role="radio" aria-checked={sel} class:on={sel} class:band={t.bandId} onclick={() => setTier(t)}>{t.label}</button>
        {/each}
      </div>
      {/if}
    </div>
    {#if hasStacks(b)}
      <div class="stack">
        <span>层数</span>
        <input type="range" min="0" max={STACK_MAX} value={set.stacks}
          oninput={(e) => setStacks(e.currentTarget)} style="--p: {(set.stacks / STACK_MAX) * 100}%" aria-label="{b.name}层数" />
        <input class="num stack-num" type="number" min="0" max={STACK_MAX} value={set.stacks}
          oninput={(e) => setStacks(e.currentTarget)} aria-label="{b.name}层数" />
      </div>
    {/if}
    {#if id === 'egirShip' && active}
      <label class="devour">
        <span>吞噬干员基础攻击力之和</span>
        <input class="num stack-num atk-num" type="number" min="0" max={ATK_MAX} step="1" value={set.devouredAtk ?? 0}
          oninput={(e) => setDevoured(e.currentTarget)} aria-label="阿戈尔吞噬干员基础攻击力之和" />
      </label>
    {/if}
    {#if variant}
      <p class="bond-desc band-desc"><b>{variant.bandName}</b> <RichText text={variant.desc} /></p>
    {/if}
    {#if !compact}
      {#if note}<p class="bond-desc note">{note}</p>{:else}<p class="bond-desc"><RichText text={b.desc} /></p>{/if}
    {/if}
  </div>
{/if}

<style>
  .bond { border: 1px dashed var(--hair-strong); background: transparent; padding: 8px 12px; transition: border-color var(--t-mid), box-shadow var(--t-mid), background var(--t-mid); }
  .bond.active { border: 1px solid var(--ink); background: var(--sheet); }
  .bond.powered { box-shadow: inset 4px 0 0 var(--signal); }
  .bond.compact { padding: 6px 10px; }
  .bond-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .bond-head b { font-size: 15px; letter-spacing: 0.1em; }
  .gift { font-size: 12px; font-weight: 800; padding: 0 6px; background: var(--signal); color: var(--ink); letter-spacing: 0.08em; }

  .auto { margin-left: auto; font-size: 13px; font-weight: 700; color: var(--ink-2); letter-spacing: 0.06em; }
  .tiers { margin-left: auto; display: flex; border: 1px solid var(--ink); }
  .tiers button {
    padding: 1px 9px; font-size: 13px; font-weight: 700; letter-spacing: 0.06em; background: none; border: 0; color: var(--ink-3);
    white-space: nowrap; transition: background var(--t-fast), color var(--t-fast);
  }
  .tiers button + button { border-left: 1px solid var(--ink); }
  .tiers button:hover { color: var(--ink); background: var(--paper-2); }
  .tiers button.on { background: var(--ink); color: var(--paper); }
  .powered .tiers button.on { background: var(--signal); color: var(--ink); }

  .stack { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; font-size: 13px; color: var(--ink-3); }
  .stack input[type='range'] {
    flex: 1; min-width: 0; appearance: none; height: 6px; background: linear-gradient(90deg, var(--ink) var(--p), var(--paper-2) var(--p));
    border: 1px solid var(--hair);
  }
  .stack input[type='range']::-webkit-slider-thumb { appearance: none; width: 12px; height: 20px; background: var(--signal); border: 2px solid var(--ink); cursor: grab; }
  .stack input[type='range']::-moz-range-thumb { width: 10px; height: 18px; background: var(--signal); border: 2px solid var(--ink); border-radius: 0; }
  .stack-num { width: 56px; background: transparent; border: 0; border-bottom: 2px solid var(--ink); padding: 2px 4px; text-align: right; font-size: 15px; font-weight: 700; }
  .stack-num:focus { outline: none; border-color: var(--signal-deep); }
  .tiers button.band.on { background: var(--alert); color: #fff; }
  .devour { display: flex; align-items: center; gap: 10px; margin: 8px 0 2px; font-size: 13px; color: var(--ink-2); }
  .devour span { flex: 1; min-width: 0; }
  .atk-num { width: 84px; }
  .band-desc { color: var(--ink-2); }
  .band-desc b { font-size: 12px; padding: 0 5px; margin-right: 4px; background: var(--alert); color: #fff; letter-spacing: 0.08em; }
  .bond-desc { margin: 4px 0 0; font-size: 13px; color: var(--ink-3); }
  .bond:not(.active) .bond-desc { color: var(--ink-4); }
</style>
