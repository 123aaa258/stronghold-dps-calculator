<script lang="ts">
  import { bosses, modes } from '../data';
  import { cfg, mechOn, setMech } from '../state.svelte';
  import RichText from './RichText.svelte';

  let missing = $state<string[]>([]);
  const boss = $derived(bosses.find((b) => b.bossId === cfg.bossId)!);
  /** 个人模拟：规程等级 1–20；联合模拟：标准 / 险境 / 绝境 / 终极 */
  const single = modes.filter((m) => /^mode_single_\d+$/.test(m.modeId));
  const multi = modes.filter((m) => m.modeId.startsWith('mode_multi_'));
  const DIFF: Record<string, string> = { FUNNY: '标准', NORMAL: '险境', HARD: '绝境', ABYSS: '终极' };

  const isMulti = $derived(cfg.modeId.startsWith('mode_multi_'));
  const singleIdx = $derived(Math.max(0, single.findIndex((m) => m.modeId === cfg.modeId)));
  const mode = $derived(modes.find((m) => m.modeId === cfg.modeId) ?? single[0]);
  // 记住两种模拟各自上次选的档位，来回切换不丢
  let lastSingle = single[9]?.modeId ?? single[0].modeId;
  let lastMulti = multi[0]?.modeId;
  $effect(() => { if (isMulti) lastMulti = cfg.modeId; else if (single.some((m) => m.modeId === cfg.modeId)) lastSingle = cfg.modeId; });
  function setKind(k: 'single' | 'multi') {
    if (k === 'multi' && !isMulti && lastMulti) cfg.modeId = lastMulti;
    if (k === 'single' && isMulti) cfg.modeId = lastSingle;
  }
  const fmt = (n: number) => n.toLocaleString('zh-CN');
</script>

<section class="boss" data-guide="boss">
  <h2><span class="slab"><span class="no">06</span>TARGET</span>Boss 与规程等级</h2>

  <div class="strip">
    {#each bosses as b}
      <button class="bcard" class:on={b.bossId === cfg.bossId} onclick={() => (cfg.bossId = b.bossId)} title={b.name}>
        {#if b.image && !missing.includes(b.bossId)}<img src={b.image} onerror={() => missing.push(b.bossId)} alt={b.name} loading="lazy" />{:else}<span class="glyph">{b.name.slice(0, 1)}</span>{/if}
        {#if b.hidden}<span class="core">隐秘核心</span>{/if}
        <span class="bname">{b.name}</span>
      </button>
    {/each}
  </div>

  <div class="mode">
    <div class="kind" role="tablist">
      <button role="tab" class:on={!isMulti} aria-selected={!isMulti} onclick={() => setKind('single')}>个人模拟</button>
      <button role="tab" class:on={isMulti} aria-selected={isMulti} onclick={() => setKind('multi')}>联合模拟</button>
      <span class="hp num">HP {fmt(boss.hpByMode[cfg.modeId] ?? 0)}</span>
    </div>
    {#if !isMulti}
      <div class="mode-head">
        <span>规程等级</span>
        <b class="num lvl">{singleIdx + 1}</b>
        <span class="diff diff-{mode.difficulty}">{DIFF[mode.difficulty] ?? ''}</span>
      </div>
      <input type="range" min="0" max={single.length - 1} value={singleIdx}
        oninput={(e) => (cfg.modeId = single[+e.currentTarget.value].modeId)}
        style="--p: {(singleIdx / (single.length - 1)) * 100}%" aria-label="规程等级" />
    {:else}
      <div class="multi" role="radiogroup" aria-label="联合模拟难度">
        {#each multi as m}
          <button role="radio" aria-checked={cfg.modeId === m.modeId} class="diff-{m.difficulty}" class:on={cfg.modeId === m.modeId}
            onclick={() => (cfg.modeId = m.modeId)}>{m.name.replace('模拟', '')}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="stats">
    <div><small class="micro">DEF 防御</small><b class="display">{boss.attributes?.def ?? '—'}</b></div>
    <div><small class="micro">RES 法抗</small><b class="display">{boss.attributes?.magicResistance ?? '—'}</b></div>
    <div class="desc">
      <RichText text={boss.description} />
    </div>
  </div>

  {#if boss.mechanics?.length}
    <div class="mech">
      <h4>{boss.hidden ? '隐秘核心 · ' : ''}Boss 机制</h4>
      {#each boss.mechanics as m (m.id)}
        {@const on = m.effect ? mechOn(boss.bossId, m) : false}
        <label class="m" class:on class:info={!m.effect}>
          {#if m.effect}
            <input type="checkbox" checked={on} onchange={(e) => setMech(boss.bossId, m.id, e.currentTarget.checked)} />
          {:else}
            <span class="i" aria-hidden="true">i</span>
          {/if}
          <span class="mt"><b>{m.name}</b>{#if m.effect}<em>{on ? '计入' : '不计'}</em>{/if}<small>{m.desc}</small></span>
        </label>
      {/each}
    </div>
  {/if}
</section>

<style>
  .boss { display: flex; flex-direction: column; gap: 10px; }
  h2 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; letter-spacing: 0.14em; }

  .strip { display: flex; gap: 4px; overflow-x: auto; padding: 2px 2px 10px; scroll-snap-type: x proximity; }
  .bcard {
    flex: 0 0 76px; height: 88px; position: relative; scroll-snap-align: start; padding: 0; overflow: hidden;
    background: var(--ink); border: 0; transition: transform var(--t-mid) var(--ease-out);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%);
  }
  .bcard img { width: 100%; height: 100%; object-fit: cover; filter: grayscale(1) contrast(1.1) brightness(0.85); transition: filter var(--t-mid), transform 600ms var(--ease-out); }
  .bcard:hover img { filter: grayscale(0.3); transform: scale(1.06); }
  .bcard.on img { filter: none; }
  .bcard.on { box-shadow: inset 0 -5px 0 var(--signal); }
  .bcard.on::after { content: 'LOCK'; position: absolute; top: 0; left: 0; font: 800 9px var(--font-mono); letter-spacing: 0.1em; padding: 1px 4px; background: var(--alert); color: #fff; }
  .glyph { position: absolute; inset: 0 0 18px; display: grid; place-items: center; font-size: 28px; font-weight: 900; color: var(--ink-3); }
  .bname { position: absolute; left: 0; right: 0; bottom: 0; font-size: 12px; padding: 2px 4px; color: var(--paper); background: linear-gradient(transparent, rgba(17, 18, 20, 0.92)); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .kind { display: flex; align-items: stretch; gap: 0; margin-bottom: 8px; border-bottom: 2px solid var(--ink); }
  .kind button {
    padding: 4px 14px; background: none; border: 0; font-size: 13px; font-weight: 800; letter-spacing: 0.16em; color: var(--ink-3);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .kind button:hover { color: var(--ink); }
  .kind button.on { background: var(--ink); color: var(--paper); }
  .kind .hp { align-self: center; }
  .multi { display: grid; grid-template-columns: repeat(4, 1fr); border: 2px solid var(--ink); }
  .multi button {
    padding: 8px 0; background: var(--sheet); border: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.2em; color: var(--ink-2);
    transition: background var(--t-fast), color var(--t-fast);
  }
  .multi button + button { border-left: 2px solid var(--ink); }
  .multi button:hover { background: var(--paper-2); color: var(--ink); }
  .multi button.on { background: var(--ink); color: var(--paper); }
  .multi button.on.diff-HARD { background: var(--signal); color: var(--ink); }
  .multi button.on.diff-ABYSS { background: var(--alert); color: #fff; }
  .mode-head { display: flex; align-items: baseline; gap: 8px; font-size: 13px; color: var(--ink-3); letter-spacing: 0.1em; }
  .lvl { font-family: var(--font-display); font-stretch: 75%; font-size: 38px; font-weight: 800; line-height: 0.9; color: var(--ink); }
  .diff { font-size: 13px; padding: 0 6px; font-weight: 800; letter-spacing: 0.12em; color: var(--ink); }
  .diff-FUNNY { background: var(--paper-2); }
  .diff-NORMAL { background: var(--hair); }
  .diff-HARD { background: var(--signal); }
  .diff-ABYSS { background: var(--alert); color: #fff; }
  .hp { margin-left: auto; color: var(--ink); font-size: 15px; font-weight: 700; }
  .mode input {
    width: 100%; appearance: none; height: 8px; margin-top: 10px;
    background:
      repeating-linear-gradient(90deg, transparent 0 calc(5% - 1px), var(--sheet) calc(5% - 1px) 5%),
      linear-gradient(90deg, var(--ink) var(--p), var(--paper-2) var(--p));
    border: 1px solid var(--ink);
  }
  .mode input::-webkit-slider-thumb { appearance: none; width: 12px; height: 22px; background: var(--signal); border: 2px solid var(--ink); cursor: grab; }
  .mode input::-moz-range-thumb { width: 10px; height: 20px; background: var(--signal); border: 2px solid var(--ink); border-radius: 0; }

  .stats { display: grid; grid-template-columns: auto auto 1fr; gap: 14px; align-items: start; border-top: 2px solid var(--ink); border-bottom: 1px solid var(--hair); padding: 8px 2px; }
  .stats small { display: block; }
  .stats b { font-size: 30px; line-height: 1; }
  .desc { font-size: 13px; color: var(--ink-3); }

  .core {
    position: absolute; top: 0; right: 0; z-index: 1; padding: 1px 4px; font-size: 11px; font-weight: 800; letter-spacing: 0.04em;
    background: var(--signal); color: var(--ink);
  }
  .mech { display: flex; flex-direction: column; gap: 6px; }
  .mech h4 { margin: 0; font-size: 13px; letter-spacing: 0.14em; }
  .m { display: flex; gap: 8px; align-items: flex-start; padding: 6px 8px; border: 1px dashed var(--hair-strong); cursor: pointer; }
  .m.on { border: 1px solid var(--ink); background: var(--sheet); box-shadow: inset 4px 0 0 var(--signal); }
  .m.info { cursor: default; }
  .m input { margin-top: 3px; accent-color: var(--ink); }
  .m .i { flex: none; width: 16px; height: 16px; margin-top: 2px; display: grid; place-items: center; font: 800 11px var(--font-mono); background: var(--paper-2); color: var(--ink-3); }
  .mt { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; min-width: 0; }
  .mt b { font-size: 14px; }
  .mt em { font-style: normal; font-size: 12px; font-weight: 800; color: var(--ink-3); }
  .m.on .mt em { color: var(--ink); }
  .mt small { flex-basis: 100%; font-size: 13px; color: var(--ink-3); }
</style>
