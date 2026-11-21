<script lang="ts">
  import { onMount } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { Tween } from 'svelte/motion';
  import { bondById, bosses, calculate, modes, opById, skills } from '../data';
  import { selectOperator, cfg } from '../state.svelte';
  import { go } from '../router.svelte';
  import { headlineOf } from '../lib/headline';

  /** 首页展示的代表性干员（顺序即轮播顺序） */
  const SHOWCASE = ['char_4133_logos', 'char_180_amgoat', 'char_4064_mlynar', 'char_4247_oxi', 'char_1046_sbell2'];
  const PROF: Record<string, string> = {
    PIONEER: '先锋', WARRIOR: '近卫', TANK: '重装', SNIPER: '狙击', CASTER: '术师', MEDIC: '医疗', SUPPORT: '辅助', SPECIAL: '特种',
  };
  const PROF_EN: Record<string, string> = {
    PIONEER: 'VANGUARD', WARRIOR: 'GUARD', TANK: 'DEFENDER', SNIPER: 'SNIPER', CASTER: 'CASTER', MEDIC: 'MEDIC', SUPPORT: 'SUPPORTER', SPECIAL: 'SPECIALIST',
  };

  const list = SHOWCASE.map((id) => opById.get(id)).filter((o) => !!o);
  let idx = $state(0);
  const op = $derived(list[idx]);

  let missing = $state<string[]>([]);
  const boss = bosses[0];
  /** 展示框默认按终极模拟（联合模拟最高难度）计算 */
  const mode = modes.find((m) => m.modeId === 'mode_multi_abyss') ?? modes[modes.length - 1];
  const preview = $derived.by(() => {
    const skillId = op.skillIds[op.defaultSkillIndex] ?? op.skillIds[0];
    const r = calculate({ charId: op.charId, tier: 'b', skillId, equips: [], bonds: [], bossId: boss.bossId, modeId: mode.modeId });
    return { skill: skills[skillId], head: r && headlineOf(r) };
  });
  const dps = Tween.of(() => preview.head?.value ?? 0, { duration: 900, easing: cubicOut });

  // 自动轮播：9 秒一位，悬停暂停
  let paused = $state(false);
  onMount(() => {
    const t = setInterval(() => { if (!paused) idx = (idx + 1) % list.length; }, 9000);
    return () => clearInterval(t);
  });

  function enter(charId = op.charId) {
    selectOperator(charId);
    cfg.tier = 'b';
    go('calc');
  }

  const nameChars = $derived([...op.name.replace(/[“”"]/g, '')]);
  const f0 = (n: number) => Math.round(n).toLocaleString('zh-CN');
  const pad = (n: number) => String(n).padStart(2, '0');

  /** 菱形阵列位置（参照式神录：上排 3、下排 2 + 全部干员） */
  const SLOTS = [
    { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 4, y: 0 },
    { x: 1, y: 1 }, { x: 3, y: 1 },
  ];
  const TICKER = 'RHODES ISLAND // GARRISON PROTOCOL // REFERENCE OPERATORS // DPS CALCULATOR // DPS RANKING // 卫戍协议 · 规程 // ';
</script>

<section class="home" onmouseenter={() => (paused = true)} onmouseleave={() => (paused = false)} aria-label="参考干员">
  <!-- 背景层：巨型描边代号 + 技术线 -->
  {#key op.charId}
    <div class="codename display" aria-hidden="true" in:fly={{ x: 120, duration: 900, easing: cubicOut, opacity: 0 }} out:fade={{ duration: 200 }}>
      {op.appellation}
    </div>
  {/key}
  <div class="tech" aria-hidden="true">
    <i class="h1"></i><i class="h2"></i><i class="v1"></i>
    <span class="cross c1">+</span><span class="cross c2">+</span><span class="cross c3">+</span>
  </div>

  <header class="title">
    <span class="slab"><span class="no">01</span>REFERENCE OPERATORS</span>
    <h1>参考干员</h1>
    <span class="micro">Rhodes Island · Garrison Protocol · DPS Archive</span>
  </header>

  <div class="index display" aria-hidden="true"><b>{pad(idx + 1)}</b><span>/{pad(list.length)}</span></div>

  {#key op.charId}
    <!-- PV 式转场：黄黑条横扫立绘区 -->
    <div class="cut" aria-hidden="true"><i></i><i></i></div>

    <div class="portrait" in:fly={{ x: -40, duration: 900, delay: 160, easing: cubicOut, opacity: 0 }} out:fade={{ duration: 220 }}>
      {#if op.images.portrait && !missing.includes(op.images.portrait)}
        <img src={op.images.portrait} onerror={(e) => missing.push(e.currentTarget.getAttribute('src')!)} alt={op.name} />
      {:else}
        <div class="fallback display"><span>{op.appellation}</span><small>PORTRAIT PENDING</small></div>
      {/if}
    </div>

    <div class="plate" in:fade={{ duration: 400, delay: 240 }}>
      <div class="badge"><span class="display">{op.rarity}</span><small>★</small></div>
      <div class="cols">
        <div class="sub">
          <span class="sub-zh">{PROF[op.profession] ?? ''}</span>
          <span class="sub-en display">{PROF_EN[op.profession] ?? op.profession}</span>
          <span class="sub-lv">{op.shopLevel}阶</span>
        </div>
        <div class="name">
          {#each nameChars as c, i}<span in:fly={{ y: -18, duration: 520, delay: 320 + i * 80, easing: cubicOut }}>{c}</span>{/each}
        </div>
      </div>
      <button class="more-v" onclick={() => enter()}>查看完整计算<span class="arrow">→</span></button>
    </div>
  {/key}

  <!-- 右上：DPS 终端屏（替代参考图的视频框） -->
  <div class="frame">
    {#if boss.image}<img class="frame-bg" src={boss.image} onerror={(e) => e.currentTarget.setAttribute('hidden', '')} alt="" />{/if}
    <div class="frame-shade"></div>
    <div class="frame-top micro"><span>TARGET // {boss.name}</span><span>{mode.name}</span></div>
    <div class="frame-mid">
      <small class="micro">OUTPUT // {preview.head?.label ?? '计算出错'}</small>
      <b class="display">{preview.head ? f0(dps.current) : '—'}</b>
      <span class="skillname">技能 · {preview.skill?.name ?? '—'}</span>
    </div>
    <button class="play" onclick={() => enter()} aria-label="进入计算"><span>▶</span></button>
    <div class="frame-bottom">
      {#each op.bondIds as b}<span class="bond">{bondById.get(b)?.name ?? b}</span>{/each}
      <span class="cond micro">精锐 · 无盟约无装备</span>
    </div>
  </div>

  <!-- 右下：菱形头像阵列 -->
  <div class="roster">
    {#each list as o, i}
      {@const s = SLOTS[i]}
      <button
        class="dia-btn" class:on={i === idx}
        style="--x:{s.x}; --y:{s.y}"
        onclick={() => (idx = i)}
        title={o.name}
        aria-pressed={i === idx}
      >
        <span class="dia-in">
          {#if o.images.avatar && !missing.includes(o.images.avatar)}<img src={o.images.avatar} onerror={(e) => missing.push(e.currentTarget.getAttribute('src')!)} alt={o.name} />{:else}<em>{o.name.slice(0, 1)}</em>{/if}
        </span>
      </button>
    {/each}
  </div>

  <!-- 底部警示带 + 滚动字幕 -->
  <div class="ticker" aria-hidden="true">
    <span class="hz"></span>
    <div class="track"><span>{TICKER.repeat(4)}</span><span>{TICKER.repeat(4)}</span></div>
  </div>
</section>

<style>
  .home { position: relative; height: 100%; min-height: 640px; overflow: hidden; color: var(--ink); }

  /* —— 背景层 —— */
  .codename {
    position: absolute; left: -2%; top: 8%; z-index: 0; font-size: clamp(120px, 17vw, 300px); line-height: 0.8;
    color: transparent; -webkit-text-stroke: 1.5px rgba(17, 18, 20, 0.13); white-space: nowrap; pointer-events: none;
  }
  .tech i { position: absolute; background: var(--ink); opacity: 0.18; }
  .tech .h1 { left: 0; right: 0; top: 74%; height: 1px; }
  .tech .h2 { left: 52%; right: 0; top: 19%; height: 1px; }
  .tech .v1 { top: 0; bottom: 0; left: 52%; width: 1px; }
  .cross { position: absolute; font: 300 22px var(--font-mono); color: var(--ink); opacity: 0.5; }
  .c1 { left: calc(52% - 7px); top: calc(19% - 15px); }
  .c2 { left: calc(52% - 7px); top: calc(74% - 15px); }
  .c3 { right: 3%; top: calc(74% - 15px); }

  .title { position: absolute; top: 22px; left: calc(52% + 26px); z-index: 3; display: flex; flex-direction: column; gap: 2px; }
  .title h1 { margin: 6px 0 0; font-size: 34px; font-weight: 900; letter-spacing: 0.4em; line-height: 1; }

  .index { position: absolute; left: 24px; top: 20px; z-index: 3; line-height: 0.85; }
  .index b { font-size: 72px; }
  .index span { font-size: 22px; color: var(--ink-3); margin-left: 4px; }

  /* —— 转场条 —— */
  .cut { position: absolute; left: 0; top: 0; bottom: 0; width: 54%; z-index: 4; pointer-events: none; overflow: hidden; }
  .cut i { position: absolute; left: 0; width: 100%; transform: translateX(-101%); animation: cut 640ms var(--ease-cut) forwards; }
  .cut i:nth-child(1) { top: 30%; height: 26%; background: var(--ink); }
  .cut i:nth-child(2) { top: 56%; height: 8%; background: var(--signal); animation-delay: 70ms; }
  @keyframes cut { 0% { transform: translateX(-101%); } 45%, 55% { transform: translateX(0); } 100% { transform: translateX(101%); } }

  /* —— 立绘 —— */
  .portrait {
    position: absolute; left: 2%; bottom: 0; width: 50%; height: 100%; z-index: 1; pointer-events: none;
    animation: float 7s ease-in-out infinite; will-change: transform;
  }
  .portrait img {
    width: 100%; height: 100%; object-fit: contain; object-position: center bottom;
    filter: drop-shadow(12px 0 0 rgba(17, 18, 20, 0.08));
  }
  @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
  .fallback { height: 100%; display: grid; place-items: center; align-content: center; }
  .fallback span { font-size: 140px; color: transparent; -webkit-text-stroke: 2px rgba(17, 18, 20, 0.25); }
  .fallback small { font: 11px var(--font-mono); letter-spacing: 0.3em; color: var(--ink-3); }

  /* —— 名牌 —— */
  .plate { position: absolute; left: calc(50% + 10px); top: 22%; z-index: 3; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; }
  .badge { display: flex; align-items: baseline; gap: 2px; background: var(--signal); padding: 2px 10px 0; border-left: 6px solid var(--ink); }
  .badge span { font-size: 40px; line-height: 1; }
  .badge small { font-size: 16px; }
  .cols { display: flex; align-items: flex-start; gap: 10px; }
  .sub { display: flex; flex-direction: column; align-items: center; gap: 6px; writing-mode: vertical-rl; }
  .sub-zh { font-size: 15px; font-weight: 800; letter-spacing: 0.3em; }
  .sub-en { font-size: 14px; letter-spacing: 0.2em; color: var(--ink-3); }
  .sub-lv { font-size: 13px; font-weight: 700; padding: 6px 2px; background: var(--ink); color: var(--paper); letter-spacing: 0.2em; }
  .name {
    writing-mode: vertical-rl; font-size: 62px; font-weight: 900; letter-spacing: 0.06em; line-height: 1;
    padding: 18px 12px; background: var(--ink); color: var(--paper);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 16px), calc(100% - 16px) 100%, 0 100%);
  }
  .name span { display: inline-block; }
  .more-v {
    display: flex; align-items: center; gap: 10px; background: none; border: 0; border-bottom: 2px solid var(--ink); padding: 4px 0;
    font-size: 14px; font-weight: 800; letter-spacing: 0.2em; transition: gap var(--t-mid) var(--ease-out), color var(--t-fast);
  }
  .more-v:hover { gap: 18px; }
  .arrow { font-family: var(--font-mono); }

  /* —— 终端屏 —— */
  .frame {
    position: absolute; right: 4%; top: 21%; width: min(420px, 29vw); aspect-ratio: 16 / 9; z-index: 2; overflow: hidden;
    background: var(--ink); color: var(--paper); border-left: 6px solid var(--signal);
    clip-path: polygon(0 0, calc(100% - 26px) 0, 100% 26px, 100% 100%, 0 100%);
    box-shadow: 0 30px 50px -30px rgba(17, 18, 20, 0.6);
  }
  .frame-bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.45; filter: grayscale(1) contrast(1.2); animation: kenburns 18s ease-in-out infinite alternate; }
  @keyframes kenburns { from { transform: scale(1.05); } to { transform: scale(1.18) translate(-3%, 2%); } }
  .frame-shade {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.03) 0 1px, transparent 1px 3px), linear-gradient(90deg, rgba(17, 18, 20, 0.95) 0 50%, rgba(17, 18, 20, 0.3));
  }
  .frame-top { position: absolute; top: 10px; left: 14px; right: 34px; display: flex; justify-content: space-between; color: var(--ink-4); }
  .frame-mid { position: absolute; left: 16px; top: 30%; display: flex; flex-direction: column; }
  .frame-mid small { color: var(--ink-4); }
  .frame-mid b { font-size: 64px; line-height: 0.95; color: var(--signal); }
  .skillname { font-size: 13px; color: var(--paper); letter-spacing: 0.1em; }
  .play {
    position: absolute; right: 18%; top: 50%; width: 60px; height: 60px; margin-top: -30px; padding: 0;
    background: var(--signal); border: 0; color: var(--ink); font-size: 18px; transition: transform var(--t-mid) var(--ease-snap), background var(--t-fast);
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
  }
  .play:hover { transform: scale(1.12); background: var(--paper); }
  .frame-bottom { position: absolute; left: 14px; right: 14px; bottom: 10px; display: flex; gap: 6px; align-items: center; font-size: 13px; }
  .bond { padding: 0 6px; background: var(--paper); color: var(--ink); font-weight: 700; letter-spacing: 0.06em; }
  .cond { margin-left: auto; color: var(--ink-4); }

  /* —— 菱形阵列 —— */
  .roster { --d: 108px; position: absolute; right: calc(4% + 10px); bottom: 11%; width: calc(var(--d) * 3.6); height: calc(var(--d) * 1.75); z-index: 3; }
  .dia-btn {
    position: absolute; left: calc(var(--x) * var(--d) * 0.6); top: calc(var(--y) * var(--d) * 0.72);
    width: var(--d); height: var(--d); padding: 0; border: 0; background: var(--ink);
    clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
    transition: transform var(--t-mid) var(--ease-snap), background var(--t-mid);
  }
  .dia-in {
    position: absolute; inset: 3px; clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%); overflow: hidden;
    background: var(--paper-2); display: grid; place-items: center;
  }
  /* 头像缩到菱形内切范围附近，避免下巴、嘴被菱形尖角裁掉 */
  .dia-in img { width: 86%; height: 86%; margin-top: 6%; object-fit: cover; object-position: center 30%; filter: grayscale(1) contrast(1.05); transition: filter var(--t-mid); }
  .dia-in em { font-style: normal; font-size: 30px; font-weight: 900; color: transparent; -webkit-text-stroke: 1.5px var(--ink-3); }
  .dia-btn:hover { transform: translateY(-4px); }
  .dia-btn:hover img { filter: grayscale(0.2); }
  .dia-btn.on { background: var(--signal); transform: scale(1.1); }
  .dia-btn.on .dia-in { inset: 6px; }
  .dia-btn.on img { filter: none; }

  /* —— 警示带 + 字幕 —— */
  .ticker { position: absolute; left: 0; right: 0; bottom: 0; height: 22px; z-index: 3; display: flex; background: var(--ink); color: var(--paper); overflow: hidden; }
  .hz { flex: 0 0 120px; background: var(--hazard); }
  .track { display: flex; white-space: nowrap; animation: ticker 60s linear infinite; }
  .track span { font: 700 10px/22px var(--font-mono); letter-spacing: 0.24em; padding-right: 0; }
  @keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  /* —— 窄屏：流式排列 —— */
  @media (max-width: 900px) {
    .home { display: flex; flex-direction: column; align-items: center; gap: 14px; height: auto; min-height: 0; padding: 18px 16px 44px; }
    .title, .portrait, .plate, .frame, .roster, .index { position: relative; left: auto; right: auto; top: auto; bottom: auto; }
    .title { align-items: center; }
    .title h1 { font-size: 24px; }
    .index, .tech { display: none; }
    .codename { top: 60px; font-size: 120px; }
    .cut { width: 100%; }
    .portrait { width: 100%; height: 46vh; min-height: 300px; }
    .plate { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; }
    .cols { flex-direction: column-reverse; align-items: center; }
    .sub { writing-mode: horizontal-tb; flex-direction: row; }
    .name { writing-mode: horizontal-tb; font-size: 32px; padding: 6px 18px; }
    .frame { width: 100%; max-width: 460px; }
    .roster { --d: 78px; }
  }
</style>
