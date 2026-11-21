<script lang="ts">
  /** 干员头像 / 立绘。缺图时用费用阶色 + 名字首字的占位，避免空白。 */
  let {
    src = null, name, level = 1, kind = 'avatar', golden = false,
  }: { src?: string | null; name: string; level?: number; kind?: 'avatar' | 'portrait'; golden?: boolean } = $props();

  let failed = $state<string | null>(null);
  const glyph = $derived(name.replace(/[“”"·]/g, '').slice(0, kind === 'portrait' ? 2 : 1));
</script>

<div class="av {kind}" class:golden style="--lv: var(--lv-{level})">
  {#if src && src !== failed}
    <img {src} alt={name} loading="lazy" decoding="async" onerror={(e) => (failed = e.currentTarget.getAttribute('src'))} />
  {:else}
    <div class="ph" aria-label={name}>
      <span>{glyph}</span>
    </div>
  {/if}
</div>

<style>
  .av { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--paper-2); }
  img { width: 100%; height: 100%; object-fit: cover; object-position: center 20%; display: block; }
  .portrait img { object-fit: contain; object-position: center bottom; }
  .ph {
    width: 100%; height: 100%; display: grid; place-items: center;
    background: repeating-linear-gradient(-45deg, rgba(17, 18, 20, 0.06) 0 6px, transparent 6px 12px), var(--paper-2);
  }
  .ph span { font-weight: 900; font-size: 1.9em; color: transparent; -webkit-text-stroke: 1.5px var(--ink-3); }
  .portrait .ph span { font-size: 7em; writing-mode: vertical-rl; -webkit-text-stroke: 2px rgba(17, 18, 20, 0.2); }
  .golden .ph { box-shadow: inset 0 -4px 0 var(--signal); }
</style>
