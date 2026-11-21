<script lang="ts">
  import { Tween } from 'svelte/motion';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly, slide } from 'svelte/transition';
  import type { CalcResult, DamageType, DerivationStep } from '../../engine/types';
  import { headlineOf, headlineDelta } from '../lib/headline';
  import { addCompare, COMPARE_MAX, loadedConfig, shownMemberBonds } from '../state.svelte';
  import { bondById, bosses, opById } from '../data';
  import { assumedNotes } from '../lib/assumed';

  let { result }: { result: CalcResult } = $props();

  const T = { duration: 650, easing: cubicOut };
  /** 标题数字：有循环用循环平均；常驻技能（开启后不结束）用技能期；否则非技能期 */
  const headline = $derived(headlineOf(result));
  const avg = Tween.of(() => headline.value, T);
  const skillDps = Tween.of(() => result.skill?.dps ?? 0, T);
  const normalDps = Tween.of(() => result.normal.dps, T);
  const kill = Tween.of(() => (Number.isFinite(result.killTimeSec) ? result.killTimeSec : 0), T);

  /**
   * 变化提示：同一名干员调整设置后，标题数字旁显示相对上一次的涨跌（3.5 秒后淡出），方便试配置。
   * 换干员或标题口径变了（循环 / 技能期 / 非技能期）不比较。
   */
  let prev: { key: string; value: number } | null = null;
  let delta = $state<number | null>(null);
  $effect(() => {
    const { charId, bossId, modeId } = result.input;
    const next = { key: JSON.stringify([charId, bossId, modeId, headline.label, loadedConfig.revision]), value: headline.value };
    const change = headlineDelta(prev, next);
    delta = change;
    prev = next;
    if (change !== null) {
      const timer = setTimeout(() => (delta = null), 3500);
      return () => clearTimeout(timer);
    }
  });

  /** 瞬发技能（如强力击）：技能期只是一次攻击，单独的技能期 DPS 没有意义，只看循环平均 */
  const instant = $derived(result.lifecycle === 'instant');
  /** 对当前干员生效的「忽略 / 直接按上限 / 默认敌人……」假设（成员盟约，以及对全体生效的全场盟约） */
  const TEAM_ASSUMED = new Set(['arcaneShip', 'steadShip', 'skillfulShip']);
  const assumed = $derived.by(() => {
    const op = opById.get(result.input.charId);
    const members = op ? shownMemberBonds(op, result.input.equips) : [];
    return assumedNotes(result.input.bonds, bondById, (id) => members.includes(id) || TEAM_ASSUMED.has(id));
  });

  let showPhase = $state<'skill' | 'normal'>('skill');
  const phase = $derived(showPhase === 'skill' && result.skill ? result.skill : result.normal);
  const maxComp = $derived(Math.max(1, ...phase.components.map((c) => c.dps)));
  /** 分项之和是面板快照；阶段 DPS 是区间内的实际平均，叠层或限时效果变化时两者不同 */
  const compSum = $derived(phase.components.filter((c) => c.countsTowardDps).reduce((t, c) => t + c.dps, 0));
  let openDeriv = $state<string | null>(null);

  const TYPE: Record<DamageType, string> = { physical: '物理', arts: '法术', true: '真实', elemental: '元素', heal: '治疗', none: '—' };
  const f0 = (n: number) => Math.round(n).toLocaleString('zh-CN');
  const f2 = (n: number) => n.toFixed(2);
  const hitRate = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const fmtStep = (s: DerivationStep) =>
    s.op === 'pct' ? `${s.value >= 0 ? '+' : ''}${(s.value * 100).toFixed(1)}%`
    : s.op === 'mul' ? `×${s.value.toFixed(3)}`
    : s.op === 'add' ? `${s.value >= 0 ? '+' : ''}${f0(s.value)}`
    : s.op === 'info' ? '' : f2(s.value);

  /** 指定时长内打掉 Boss 血量的比例 */
  const boss = $derived(bosses.find((b) => b.bossId === result.input.bossId));
  const bossHp = $derived(boss?.hpByMode[result.input.modeId] ?? 0);

  /** 计算过程：循环平均 = (技能期 DPS × 持续 + 非技能期 DPS × 回复) / 循环时长；与引擎结果一致时才展示代入式 */
  const cycleCheck = $derived.by(() => {
    const c = result.cycle;
    if (!c || !result.skill || instant) return null;
    const T = c.spRecoverSec + c.skillDurationSec;
    if (!(T > 0)) return null;
    const v = (result.skill.dps * c.skillDurationSec + result.normal.dps * c.spRecoverSec) / T;
    return Math.abs(v - c.avgDps) <= Math.max(1, c.avgDps * 0.01) ? { T } : null;
  });
  const usedTypes = $derived([...new Set([...(result.skill?.components ?? []), ...result.normal.components].map((c) => c.damageType))]);
  const FORMULA: Partial<Record<DamageType, string>> = {
    physical: '物理：单次伤害 = max(5% × A, A − 有效防御)，有效防御 = (1 − 百分比穿透) × max(0, 防御 − 固定穿透)',
    arts: '法术：单次伤害 = max(5% × A, A × (1 − 有效法抗 / 100))，有效法抗 = (1 − 百分比法穿) × max(0, 法抗 − 固定法穿)',
    true: '真实：单次伤害 = A，无视防御与法抗',
    elemental: '元素：元素损伤单独累计，不计入扣血 DPS；元素爆发造成的扣血计入',
  };
  const hpPct = $derived(bossHp > 0 ? Math.min(100, (result.totalDamage.value / bossHp) * 100) : 0);

  // 加入对比
  let toast = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(toastTimer));
  function say(msg: string) {
    toast = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast = ''), 1800);
  }
  function pin() {
    const r = addCompare(structuredClone($state.snapshot(result.input)));
    say(r === 'ok' ? '已加入对比' : r === 'dup' ? '这个配置已在对比栏' : `对比栏已满（最多 ${COMPARE_MAX} 个）`);
  }
</script>

<section class="res" data-guide="result">
  <div class="headline">
    <div class="actions">
      <button onclick={pin} title="把当前配置放进底部对比栏">＋ 加入对比</button>
    </div>
    {#if toast}<div class="toast" transition:fly={{ y: -6, duration: 180 }}>{toast}</div>{/if}
    <div class="label">
      <span class="micro">OUTPUT //</span> {headline.label}
    </div>
    {#key result}<div class="big display glitch" data-text={f0(avg.current)}>{f0(avg.current)}</div>{/key}
    {#if delta !== null}
      <div class="delta num" class:up={delta > 0} class:down={delta < 0} role="status" transition:fade={{ duration: 220 }}>
        {delta > 0 ? '▲' : '▼'} {Math.abs(delta * 100) < 0.1 ? '<0.1' : Math.abs(delta * 100).toFixed(1)}%<small>较上次</small>
      </div>
    {/if}
    <div class="sub">
      <button class:on={showPhase === 'skill'} disabled={!result.skill} onclick={() => (showPhase = 'skill')}>
        <small>技能期{#if instant} · 瞬发{/if}</small>{#if instant}<b class="num warn" title="瞬发技能只造成一次攻击，请看循环平均 DPS">—</b>{:else}<b class="num warn">{f0(skillDps.current)}</b>{/if}
      </button>
      <button class:on={showPhase === 'normal'} onclick={() => (showPhase = 'normal')}>
        <small>非技能期</small><b class="num">{f0(normalDps.current)}</b>
      </button>
      <div class="kill">
        <small>击杀用时</small>
        <b class="num">{Number.isFinite(result.killTimeSec) ? `${kill.current.toFixed(1)}s` : '无法击杀'}</b>
      </div>
    </div>
    <div class="hpbar" title="{result.totalDamage.durationSec} 秒伤害 / Boss 血量">
      <div class="fill" style="width: {hpPct}%"></div>
      <span class="micro">{result.totalDamage.durationSec}S DMG {f0(result.totalDamage.value)} · {hpPct.toFixed(1)}% HP</span>
    </div>
    {#if assumed.length}<ul class="assumed" aria-label="计算假设">{#each assumed as a (a)}<li>{a}</li>{/each}</ul>{/if}
  </div>

  <div class="stats3">
    <div><small class="micro">ATK 攻击力</small><b class="display">{f0(phase.stats.atk)}</b></div>
    <div><small class="micro">ASPD 攻速</small><b class="display">{f0(phase.stats.attackSpeed)}</b></div>
    <div><small class="micro">INTERVAL 间隔</small><b class="display">{f2(phase.stats.attackInterval)}s</b></div>
  </div>

  <div class="comps">
    <h3><span class="slab"><span class="no">07</span>BREAKDOWN</span>伤害构成 · {showPhase === 'skill' && result.skill ? '技能期' : '非技能期'}</h3>
    {#each phase.components as c, ci (ci + c.source + c.label)}
      <div class="comp" class:muted={!c.countsTowardDps}>
        <button class="comp-row" onclick={() => (openDeriv = openDeriv === ci + c.label ? null : ci + c.label)}>
          <span class="type t-{c.damageType}">{TYPE[c.damageType]}</span>
          <span class="clabel">{c.label}</span>
          <span class="num cdps">{f0(c.dps)}</span>
        </button>
        <div class="bar"><div class="t-{c.damageType}" style="width: {(c.dps / maxComp) * 100}%"></div></div>
        {#if openDeriv === ci + c.label}
          <ol class="deriv" transition:slide={{ duration: 200 }}>
            <li><span>单段伤害 × 每秒命中段数</span><span class="num">{f2(c.perHit)} × {hitRate(c.hitsPerSec)}</span></li>
            {#if c.hitsPerAttack > 0}
              <li><span>每次攻击段数</span><span class="num">{f2(c.hitsPerAttack)}</span></li>
            {/if}
            {#each c.derivation as s}
              {#if s.source !== 'rule:times'}
                <li><span>{s.label}</span><span class="num">{fmtStep(s)}</span></li>
              {/if}
            {/each}
          </ol>
        {/if}
      </div>
    {/each}
  </div>

  <details class="process">
    <summary><span class="slab"><span class="no">08</span>PROCESS</span>计算过程</summary>
    <ol class="steps">
      <li>
        <h4>面板 · {showPhase === 'skill' && result.skill ? '技能期' : '非技能期'}</h4>
        <p>攻击力 = [(基础 + 直接加算) × (1 + Σ百分比加算) + 最终加算] × Π最终乘算；攻击间隔 = 基础间隔 ÷ (攻速 / 100)。</p>
        <ol class="deriv">
          {#each phase.stats.derivation.atk as s}<li><span>{s.label}</span><span class="num">{fmtStep(s)}</span></li>{/each}
          <li class="total"><span>面板攻击力</span><span class="num">{f0(phase.stats.atk)}</span></li>
          <li class="total"><span>攻速 {f0(phase.stats.attackSpeed)} → 攻击间隔</span><span class="num">{f2(phase.stats.attackInterval)}s</span></li>
        </ol>
      </li>
      <li>
        <h4>目标 · {boss?.name ?? '—'}</h4>
        <p>防御 <b class="num">{boss?.attributes?.def ?? '—'}</b>，法术抗性 <b class="num">{boss?.attributes?.magicResistance ?? '—'}</b>，生命值 <b class="num">{f0(bossHp)}</b>。</p>
      </li>
      <li>
        <h4>单次伤害</h4>
        <p>A = 面板攻击力 × 本次攻击倍率，再按伤害类型结算，最后乘增伤 / 脆弱（同名脆弱取最高）：</p>
        <ul class="formula">{#each usedTypes as t}{#if FORMULA[t]}<li>{FORMULA[t]}</li>{/if}{/each}</ul>
        <p>每个分项的代入数值，点上方「伤害构成」里的条目展开。</p>
      </li>
      <li>
        <h4>阶段 DPS</h4>
        <p>分项 DPS = 单段伤害 × 每秒命中段数。多段攻击的每一段都计入命中次数。</p>
        <ol class="deriv">
          {#each phase.components.filter((c) => c.countsTowardDps) as c}
            <li><span>{c.label}</span><span class="num">{f2(c.perHit)} × {hitRate(c.hitsPerSec)} ≈ {f0(c.dps)}</span></li>
          {/each}
          {#if Math.abs(compSum - phase.dps) > Math.max(1, phase.dps * 0.005)}
            <li class="total"><span>分项合计（{showPhase === 'skill' && result.skill ? '开技能时' : '开技能前'}的面板）</span><span class="num">{f0(compSum)}</span></li>
            <li class="total"><span>{showPhase === 'skill' && result.skill ? '首轮技能期间' : '首次开技能前'}的实际平均 DPS（含叠层、限时效果变化）</span><span class="num">{f0(phase.dps)}</span></li>
          {:else}
            <li class="total"><span>{showPhase === 'skill' && result.skill ? '技能期' : '非技能期'} DPS</span><span class="num">{f0(phase.dps)}</span></li>
          {/if}
        </ol>
      </li>
      {#if result.cycle}
        <li>
          <h4>技能循环</h4>
          <p>回复技力 <b class="num">{f2(result.cycle.spRecoverSec)}s</b> + 技能持续 <b class="num">{f2(result.cycle.skillDurationSec)}s</b> 为一个循环。</p>
          {#if cycleCheck && result.skill}
            <p class="eq num">({f0(result.skill.dps)} × {f2(result.cycle.skillDurationSec)} + {f0(result.normal.dps)} × {f2(result.cycle.spRecoverSec)}) ÷ {f2(cycleCheck.T)} = <b>{f0(result.cycle.avgDps)}</b></p>
          {:else}
            <p>按循环内逐段时间积分，循环平均 DPS = <b class="num">{f0(result.cycle.avgDps)}</b>。</p>
          {/if}
        </li>
      {/if}
      <li>
        <h4>总伤害与击杀</h4>
        <p>从部署开始按时间过程推进（初始技力 → 首次开技能 → 循环），{result.totalDamage.durationSec} 秒累计伤害 <b class="num">{f0(result.totalDamage.value)}</b>；
          累计伤害达到 Boss 生命值 {f0(bossHp)} 的时刻为击杀用时 <b class="num">{Number.isFinite(result.killTimeSec) ? `${f2(result.killTimeSec)}s` : '无法击杀'}</b>。</p>
      </li>
    </ol>
  </details>
</section>

<style>
  .res { display: flex; flex-direction: column; gap: 14px; }

  /* —— 黑色终端屏 —— */
  .headline {
    position: relative; background: var(--ink); color: var(--paper); padding: 14px 16px 12px; overflow: hidden;
    clip-path: polygon(0 0, calc(100% - 22px) 0, 100% 22px, 100% 100%, 0 100%);
  }
  .headline::before {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background:
      repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 3px),
      linear-gradient(90deg, rgba(255, 211, 26, 0.08), transparent 40%);
  }
  .headline::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--signal); }
  .actions { position: absolute; top: 10px; right: 28px; display: flex; gap: 6px; z-index: 2; }
  .actions button {
    font-size: 13px; font-weight: 700; padding: 2px 10px; letter-spacing: 0.08em; background: transparent;
    border: 1px solid rgba(236, 237, 235, 0.35); color: var(--paper); transition: all var(--t-fast);
  }
  .actions button:hover { background: var(--signal); border-color: var(--signal); color: var(--ink); }
  .toast { position: absolute; top: 38px; right: 28px; z-index: 3; font-size: 13px; padding: 3px 10px; background: var(--signal); color: var(--ink); font-weight: 800; }
  .label { position: relative; font-size: 13px; color: var(--ink-4); letter-spacing: 0.14em; display: flex; align-items: center; gap: 8px; }
  .label .micro { color: var(--ink-4); }
  /* 变化提示：贴在大数字右上，不推挤布局 */
  .delta {
    position: absolute; right: 16px; top: 68px; z-index: 2; display: inline-flex; align-items: baseline; gap: 6px; padding: 2px 8px;
    font-size: 15px; font-weight: 800; background: var(--paper); color: var(--ink); clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
  }
  .delta.up { background: var(--signal); }
  .delta.down { background: var(--alert); color: #fff; }
  .delta small { font-size: 11px; font-weight: 700; opacity: 0.8; }
  .big { position: relative; font-size: 76px; line-height: 0.95; margin: 4px 0 2px; color: var(--signal); }
  /* 数字刷新时的一次故障闪烁 */
  .glitch::before, .glitch::after {
    content: attr(data-text); position: absolute; left: 0; top: 0; width: 100%; overflow: hidden; pointer-events: none;
    animation: glitch 420ms steps(2, end) 1 forwards;
  }
  .glitch::before { color: var(--alert); transform: translate(-3px, 0); clip-path: inset(10% 0 55% 0); }
  .glitch::after { color: var(--paper); transform: translate(3px, 0); clip-path: inset(60% 0 8% 0); }
  @keyframes glitch {
    0% { opacity: 1; } 30% { transform: translate(4px, -1px); } 60% { transform: translate(-2px, 1px); } 100% { opacity: 0; }
  }

  .sub { position: relative; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; margin-top: 8px; border-top: 1px solid rgba(236, 237, 235, 0.15); }
  .sub > * { display: flex; flex-direction: column; align-items: flex-start; padding: 8px 10px 4px; background: none; border: 0; color: var(--paper); text-align: left; }
  .sub > * + * { border-left: 1px solid rgba(236, 237, 235, 0.15); }
  .sub button { transition: background var(--t-fast); }
  .sub button:hover:not(:disabled) { background: rgba(236, 237, 235, 0.06); }
  .sub button.on { box-shadow: inset 0 -3px 0 var(--signal); }
  .sub button:disabled { opacity: 0.35; cursor: default; }
  .sub small { font-size: 13px; color: var(--ink-4); letter-spacing: 0.1em; white-space: nowrap; }
  .sub b { font-family: var(--font-display); font-stretch: 75%; font-size: 26px; line-height: 1.1; }
  .assumed { margin: 8px 0 0; padding: 0; list-style: none; font-size: 13px; line-height: 1.5; color: var(--ink-4); }
  .assumed li::before { content: '※ '; color: var(--signal); }
  .warn { color: var(--signal); }

  .hpbar { position: relative; height: 18px; margin-top: 10px; background: rgba(236, 237, 235, 0.08); }
  .hpbar .fill { position: absolute; inset: 0 auto 0 0; background: repeating-linear-gradient(-45deg, var(--alert) 0 6px, #c0311f 6px 12px); transition: width var(--t-slow) var(--ease-out); }
  .hpbar .micro { position: relative; z-index: 1; display: block; line-height: 18px; padding-left: 6px; color: var(--paper); font-size: 11px; }

  .stats3 { display: grid; grid-template-columns: repeat(3, 1fr); border: 2px solid var(--ink); }
  .stats3 div { padding: 6px 10px; }
  .stats3 div + div { border-left: 1px solid var(--hair); }
  .stats3 small { display: block; }
  .stats3 b { font-size: 26px; line-height: 1.05; }

  h3 { margin: 0 0 8px; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; display: flex; align-items: center; gap: 10px; }
  .comp { margin-bottom: 10px; }
  .comp.muted { opacity: 0.5; }
  .comp-row { display: flex; align-items: center; gap: 8px; width: 100%; background: none; border: 0; padding: 2px 0; text-align: left; }
  .type { font-size: 12px; font-weight: 800; padding: 0 5px; color: var(--paper); background: currentColor; }
  .type { -webkit-text-fill-color: var(--paper); }
  .clabel { font-size: 14px; font-weight: 600; }
  .cdps { margin-left: auto; font-family: var(--font-display); font-stretch: 75%; font-size: 20px; font-weight: 700; }
  .bar { height: 10px; background: var(--paper-2); }
  .bar div { height: 100%; background: currentColor; transition: width var(--t-slow) var(--ease-out); }
  .t-physical { color: var(--dmg-physical); }
  .t-arts { color: var(--dmg-arts); }
  .t-true { color: var(--dmg-true); }
  .t-elemental { color: var(--dmg-elemental); }

  .deriv { list-style: none; margin: 6px 0 0; padding: 6px 10px; background: var(--paper-2); border-left: 3px solid var(--ink); font-size: 13px; }
  .deriv li { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; color: var(--ink-2); border-bottom: 1px dashed var(--hair); }
  .deriv li:last-child { border-bottom: 0; }
  .deriv .total { color: var(--ink); font-weight: 800; }
  .process summary { cursor: pointer; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 800; letter-spacing: 0.14em; color: var(--ink); list-style: none; }
  .process summary::-webkit-details-marker { display: none; }
  .process summary::after { content: '＋'; margin-left: auto; font-family: var(--font-mono); }
  .process[open] summary::after { content: '－'; }
  .steps { list-style: none; counter-reset: st; margin: 10px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
  .steps > li { counter-increment: st; position: relative; padding-left: 34px; font-size: 13px; color: var(--ink-2); }
  .steps > li::before {
    content: counter(st, decimal-leading-zero); position: absolute; left: 0; top: 0; font-family: var(--font-display); font-stretch: 75%;
    font-size: 20px; font-weight: 800; line-height: 1; color: var(--ink);
  }
  .steps > li::after { content: ''; position: absolute; left: 10px; top: 24px; bottom: -10px; width: 1px; background: var(--hair-strong); }
  .steps > li:last-child::after { display: none; }
  .steps h4 { margin: 0 0 4px; font-size: 14px; letter-spacing: 0.1em; color: var(--ink); }
  .steps p { margin: 0 0 4px; }
  .steps b { color: var(--ink); }
  .formula { margin: 4px 0; padding: 6px 10px 6px 24px; background: var(--paper-2); border-left: 3px solid var(--ink); font-size: 13px; }
  .eq { padding: 6px 10px; background: var(--ink); color: var(--paper); font-size: 13px; }
  .eq b { color: var(--signal); }

  @media (max-width: 640px) {
    .big { font-size: 58px; }
    .sub > * { padding: 6px 8px 4px; }
    .sub b { font-size: 22px; }
    .actions { position: static; justify-content: flex-end; margin-bottom: 4px; }
  }
</style>
