<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { calculate, dataLabel } from './data';
  import { configSnapshot, currentInput, scheduleConfigSave } from './state.svelte';
  import { headlineOf } from './lib/headline';
  import CompareBar from './components/CompareBar.svelte';
  import OperatorGrid from './components/OperatorGrid.svelte';
  import ConfigPanel from './components/ConfigPanel.svelte';
  import BossPanel from './components/BossPanel.svelte';
  import ResultPanel from './components/ResultPanel.svelte';
  import Guide from './components/Guide.svelte';
  import Home from './components/Home.svelte';
  import RankPage from './components/RankPage.svelte';
  import { fade } from 'svelte/transition';
  import { go, route } from './router.svelte';

  const result = $derived(calculate(currentInput()));
  const head = $derived(result && headlineOf(result));

  // 记住上次的配置：任何设置变化后 400ms 写入本机（刷新 / 关闭页面后恢复）
  $effect(() => scheduleConfigSave(configSnapshot()));

  // 手机端：结果卡不在视野内时显示悬浮 DPS 读数，点击跳到结果卡
  let resultVisible = $state(true);
  function watchResult(node: HTMLElement) {
    const io = new IntersectionObserver(([e]) => (resultVisible = e.isIntersecting), { threshold: 0.15 });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  let guide = $state(false);
  let booted = $state(false);
  onMount(() => {
    requestAnimationFrame(() => (booted = true));
  });

  // 首次进入计算器时自动打开引导
  let guideChecked = false;
  $effect(() => {
    if (route.view !== 'calc' || guideChecked) return;
    let seen = false;
    try { seen = localStorage.getItem('gdps.guided') === '1'; } catch { /* ignore */ }
    if (!seen) {
      const timer = setTimeout(() => { guideChecked = true; guide = true; }, 900);
      return () => clearTimeout(timer);
    }
  });
  // 切页时重新触发入场动画，并播放 PV 式黑条转场
  let wipeKey = $state(0);
  let firstView = true;
  $effect(() => {
    void route.view;
    booted = false;
    requestAnimationFrame(() => requestAnimationFrame(() => (booted = true)));
    if (firstView) { firstView = false; return; }
    // untrack：读取 wipeKey 不能成为本 effect 的依赖，否则自增会无限重跑
    untrack(() => wipeKey++);
  });
</script>

<div class="app" inert={guide && route.view === 'calc'} class:booted class:home={route.view === 'home'}>
  <header class="top">
    <button class="brand" onclick={() => go('home')} aria-label="回到参考干员">
      <span class="logo" aria-hidden="true"><i></i></span>
      <span class="brand-text">
        <span class="t1">卫戍协议<b>DPS 计算器</b></span>
        <span class="t2 micro">Rhodes Island · Garrison Protocol // V3_1</span>
      </span>
    </button>
    <nav class="tabs" aria-label="页面">
      <button class:on={route.view === 'home'} onclick={() => go('home')}><span class="tn">01</span>参考干员</button>
      <button class:on={route.view === 'calc'} onclick={() => go('calc')}><span class="tn">02</span>DPS 计算器</button>
      <button class:on={route.view === 'rank'} onclick={() => go('rank')}><span class="tn">03</span>DPS 排行</button>
    </nav>
    <div class="right">
      <span class="ver"><span class="barcode" aria-hidden="true"></span><span class="micro">{dataLabel}</span></span>
      {#if route.view === 'calc'}<button class="help" onclick={() => (guide = true)} aria-label="打开引导">?<span class="help-t"> 引导</span></button>{/if}
    </div>
  </header>

  {#if route.view === 'home'}
    <div class="home-wrap" in:fade={{ duration: 300, delay: 120 }}><Home /></div>
  {:else if route.view === 'rank'}
    <div class="rank-wrap" in:fade={{ duration: 300, delay: 120 }}><RankPage /></div>
  {:else}
    <main in:fade={{ duration: 300, delay: 120 }}>
      <div class="col c1 corners"><OperatorGrid /></div>
      <div class="col c2 corners"><ConfigPanel /></div>
      <div class="col c3 corners">
        <BossPanel />
        <div use:watchResult>{#if result}<ResultPanel {result} />{:else}<p role="alert">计算出错</p>{/if}</div>
      </div>
    </main>
    <CompareBar />
    {#if !resultVisible && head}
      <button class="dps-pill" transition:fade={{ duration: 160 }}
        onclick={() => document.querySelector('[data-guide="result"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <small>{head.label}</small><b class="num">{Math.round(head.value).toLocaleString('zh-CN')}</b><span>↓</span>
      </button>
    {/if}
  {/if}
</div>

{#key wipeKey}
  {#if wipeKey > 0}
    <div class="wipe" aria-hidden="true">
      <div class="bar b1"></div>
      <div class="bar b2"><span class="display">{route.view === 'calc' ? 'DPS CALCULATOR' : route.view === 'rank' ? 'DPS RANKING' : 'REFERENCE OPERATORS'}</span></div>
      <div class="bar b3"></div>
    </div>
  {/if}
{/key}

{#if route.view === 'calc'}<Guide bind:open={guide} />{/if}

<style>
  .app { height: 100vh; display: flex; flex-direction: column; }

  /* —— 顶栏 —— */
  .top {
    position: relative; z-index: 10; display: flex; align-items: stretch; justify-content: space-between; height: 54px;
    background: var(--sheet); border-bottom: 2px solid var(--ink);
  }
  .brand { display: flex; align-items: stretch; gap: 0; background: none; border: 0; padding: 0; text-align: left; }
  .logo {
    width: 54px; display: grid; place-items: center; background: var(--ink);
  }
  .logo i {
    width: 22px; height: 22px; border: 2px solid var(--paper); transform: rotate(45deg); position: relative;
  }
  .logo i::after { content: ''; position: absolute; inset: 4px; background: var(--signal); transition: transform var(--t-mid) var(--ease-snap); }
  .brand:hover .logo i::after { transform: scale(0.4); }
  .brand-text {
    display: flex; flex-direction: column; justify-content: center; padding: 0 22px 0 14px;
    background: var(--ink); color: var(--paper); clip-path: polygon(0 0, 100% 0, calc(100% - 18px) 100%, 0 100%);
  }
  .t1 { font-size: 16px; font-weight: 800; letter-spacing: 0.14em; line-height: 1.2; }
  .t1 b { margin-left: 10px; font-family: var(--font-display); font-stretch: 75%; letter-spacing: 0.04em; color: var(--signal); }
  .t2 { color: var(--ink-4); font-size: 10px; }

  .tabs { display: flex; align-items: stretch; margin-left: auto; margin-right: 18px; }
  .tabs button {
    position: relative; display: flex; align-items: center; gap: 8px; padding: 0 22px; background: none; border: 0;
    font-size: 15px; font-weight: 700; letter-spacing: 0.18em; color: var(--ink-3); white-space: nowrap;
    transition: color var(--t-mid);
  }
  .tn { font-family: var(--font-display); font-stretch: 75%; font-size: 13px; color: var(--ink-4); letter-spacing: 0.05em; }
  .tabs button::after {
    content: ''; position: absolute; left: 14px; right: 14px; bottom: -2px; height: 6px; background: var(--signal);
    transform: scaleX(0); transform-origin: left; transition: transform var(--t-slow) var(--ease-cut);
  }
  .tabs button:hover { color: var(--ink); }
  .tabs button.on { color: var(--ink); }
  .tabs button.on .tn { color: var(--ink); }
  .tabs button.on::after { transform: scaleX(1); }

  .right { display: flex; gap: 12px; align-items: center; padding-right: 18px; }
  .ver { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
  .help {
    background: var(--ink); color: var(--paper); border: 0; padding: 4px 12px; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; white-space: nowrap;
    clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%); transition: background var(--t-fast), color var(--t-fast);
  }
  .help:hover { background: var(--signal); color: var(--ink); }

  .home-wrap { flex: 1; min-height: 0; }
  .rank-wrap { flex: 1; min-height: 0; display: flex; }

  /* —— 计算页三栏 —— */
  main {
    flex: 1; min-height: 0; display: grid; gap: 14px; padding: 14px 18px;
    grid-template-columns: minmax(280px, 1fr) minmax(340px, 1.15fr) minmax(360px, 1.2fr);
  }
  .col {
    min-height: 0; min-width: 0; display: flex; flex-direction: column; gap: 16px; overflow-y: auto;
    background: var(--sheet); border: 1px solid var(--hair); padding: 14px;
    box-shadow: 0 1px 0 var(--hair), 0 18px 30px -24px rgba(17, 18, 20, 0.35);
    opacity: 0; transform: translateY(18px); clip-path: inset(0 0 100% 0);
    transition: opacity var(--t-slow) var(--ease-out), transform var(--t-slow) var(--ease-out), clip-path 700ms var(--ease-cut);
  }
  .booted .col { opacity: 1; transform: none; clip-path: inset(0 0 0 0); }
  .booted .c2 { transition-delay: 80ms; }
  .booted .c3 { transition-delay: 160ms; }

  /* —— PV 式转场：三条黑/黄条快速横扫 —— */
  .wipe { position: fixed; inset: 0; z-index: 200; pointer-events: none; overflow: hidden; }
  .bar { position: absolute; left: 0; width: 100%; transform: translateX(-101%); animation: sweep 760ms var(--ease-cut) forwards; }
  .b1 { top: 0; height: 38%; background: var(--ink); }
  .b2 { top: 38%; height: 24%; background: var(--signal); animation-delay: 60ms; display: flex; align-items: center; padding-left: 6vw; }
  .b3 { top: 62%; height: 38%; background: var(--ink); animation-delay: 120ms; }
  .b2 span { font-size: clamp(40px, 9vw, 140px); line-height: 1; color: var(--ink); white-space: nowrap; }
  @keyframes sweep {
    0% { transform: translateX(-101%); }
    45%, 55% { transform: translateX(0); }
    100% { transform: translateX(101%); }
  }

  /* —— 手机悬浮读数 —— */
  .dps-pill { display: none; }

  @media (max-width: 1100px) {
    .app { height: auto; min-height: 100vh; }
    main { grid-template-columns: minmax(0, 1fr); padding: 12px; }
    .col { overflow: visible; }
    .dps-pill {
      position: fixed; right: 12px; bottom: 14px; z-index: 50; display: flex; align-items: baseline; gap: 8px;
      padding: 8px 16px; border: 0; background: var(--ink); color: var(--paper);
      clip-path: polygon(8px 0, 100% 0, calc(100% - 8px) 100%, 0 100%); box-shadow: 0 10px 24px -8px rgba(0, 0, 0, 0.5);
    }
    .dps-pill small { font-size: 12px; color: var(--ink-4); }
    .dps-pill b { font-size: 20px; color: var(--signal); }
    .dps-pill span { color: var(--signal); }
  }
  @media (max-width: 700px) {
    .top { height: 48px; }
    .logo { width: 44px; }
    .brand-text, .ver, .help-t { display: none; }
    .tabs { flex: 1; margin: 0; justify-content: space-around; }
    .tabs button { padding: 0 6px; font-size: 14px; letter-spacing: 0.04em; }
    .tabs button::after { left: 4px; right: 4px; }
    .help { padding: 4px 10px; }
    .tn { display: none; }
    .right { padding-right: 8px; }
  }
</style>
