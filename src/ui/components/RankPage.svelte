<script lang="ts">
  import type { CalcInput, RankInput } from '../../engine/types';
  import { bestRankRows, type RankLite } from '../lib/rankRow';
  import { bondById, bonds as allBonds, bosses, modes, opById, skills } from '../data';
  import { assumedNotes } from '../lib/assumed';
  import { applyInput, AUTO_BONDS, ensureAllBonds, HIDDEN_BONDS, rankInput, resetBonds } from '../state.svelte';
  import { rankAsync, type RankResult } from '../lib/rankClient';
  import { go } from '../router.svelte';
  import Avatar from './Avatar.svelte';
  import BossPanel from './BossPanel.svelte';
  import BondCard from './BondCard.svelte';
  import TrainingPanel from './TrainingPanel.svelte';

  /** DPS 排行：当前 Boss + 当前盟约（档位、层数），全部干员 × 普通/精锐 × 全部技能，不带装备。 */
  ensureAllBonds();

  const PROF: Record<string, string> = {
    PIONEER: '先锋', WARRIOR: '近卫', TANK: '重装', SNIPER: '狙击', CASTER: '术师', MEDIC: '医疗', SUPPORT: '辅助', SPECIAL: '特种',
  };
  const CORE = ['yanShip', 'sargonShip', 'victoriaShip', 'kjeragShip', 'egirShip', 'siracusaShip', 'kazimierzShip', 'ursusShip', 'iberiaShip', 'lethaniaShip'];
  const coreBonds = CORE.filter((id) => bondById.has(id));
  // 助力、奇迹、聚合与 DPS 无关，调和自动生效，都不列出
  const otherBonds = allBonds.map((b) => b.bondId).filter((id) => !CORE.includes(id) && !AUTO_BONDS.has(id) && !HIDDEN_BONDS.has(id));

  type Metric = 'head' | 'skill' | 'normal' | 'kill';
  const METRIC: Record<Metric, string> = { head: '平均 DPS', skill: '技能期 DPS', normal: '非技能期 DPS', kill: '击杀用时' };
  let metric = $state<Metric>('head');
  let query = $state('');
  let prof = $state<string | null>(null);
  let tierFilter = $state<'all' | 'a' | 'b'>('all');
  let bestOnly = $state(true);
  /** 每名干员每个技能只看伤害最高的模组 */
  let bestMod = $state(true);
  let limit = $state(60);

  const draft = $derived(rankInput());
  const key = $derived(JSON.stringify(draft));
  let completed = $state.raw<{ key: string; input: RankInput; result: RankResult } | null>(null);
  const result = $derived(completed?.result);
  const rows = $derived(result?.rows ?? []);
  let active = $state.raw<AbortController | null>(null);
  const busy = $derived(active !== null);
  let elapsed = $state(0);
  let hasStarted = $state(false);
  let failed = $state('');

  function cancelPending() {
    active?.abort();
    active = null;
    failed = '';
  }

  // 离开页面或更改战斗输入时取消旧请求。排序、职业与搜索只筛选已有结果。
  $effect(() => {
    void key;
    return cancelPending;
  });

  async function startRanking() {
    if (active) return;
    const requested = key;
    const controller = new AbortController();
    active = controller;
    hasStarted = true;
    failed = '';
    elapsed = 0;
    const start = performance.now();
    const timer = setInterval(() => elapsed = Math.floor((performance.now() - start) / 1000), 1000);
    try {
      const input: RankInput = JSON.parse(requested);
      const value = await rankAsync(input, controller.signal);
      if (!controller.signal.aborted && requested === key) completed = { key: requested, input, result: value };
    } catch (err) {
      if (!controller.signal.aborted && requested === key) failed = err instanceof Error ? err.message : String(err);
    } finally {
      clearInterval(timer);
      if (active === controller) active = null;
    }
  }

  const valueOf = (r: RankLite, m: Metric) =>
    m === 'head' ? r.head
    : m === 'skill' ? (r.skill ?? 0)
    : m === 'normal' ? r.normal
    : r.killTimeSec;

  const shown = $derived.by(() => {
    const q = query.trim();
    let list = rows.filter((r) => {
      const op = opById.get(r.charId);
      if (!op) return false;
      if (tierFilter !== 'all' && r.tier !== tierFilter) return false;
      if (prof && op.profession !== prof) return false;
      if (q && !op.name.includes(q) && !op.appellation.toLowerCase().includes(q.toLowerCase())) return false;
      return Number.isFinite(valueOf(r, metric === 'kill' ? 'head' : metric));
    });
    const asc = metric === 'kill';
    list = list.sort((x, y) => {
      const a = valueOf(x, metric), b = valueOf(y, metric);
      return asc ? (a === b ? 0 : !Number.isFinite(a) ? 1 : !Number.isFinite(b) ? -1 : a - b) : b - a;
    });
    return bestRankRows(list, bestOnly, bestMod);
  });
  const top = $derived(Math.max(1, ...shown.slice(0, 1).map((r) => r.head)));

  function open(input: CalcInput) {
    applyInput(input);
    go('calc');
  }
  const displayedInput = $derived(completed?.input ?? draft);
  const boss = $derived(bosses.find((b) => b.bossId === displayedInput.bossId));
  const mode = $derived(modes.find((m) => m.modeId === displayedInput.modeId));
  const activeBonds = $derived(displayedInput.bonds.filter((b) => b.activeChars > 0 && !AUTO_BONDS.has(b.bondId)));
  /** 已激活、默认按满足条件 / 叠到上限计算的盟约 */
  const assumed = $derived(assumedNotes(activeBonds, bondById).join('；'));
  const f0 = (n: number) => Math.round(n).toLocaleString('zh-CN');
  const fKill = (n: number) => (Number.isFinite(n) ? `${n.toFixed(1)}s` : '—');
</script>

<div class="rank">
  <aside class="side corners">
    <BossPanel />
    <div class="train">
      <h3>干员练度</h3>
      <TrainingPanel showDiy={false} />
    </div>
    <div class="bonds">
      <div class="bonds-head">
        <h3><span class="slab"><span class="no">05</span>COVENANT</span>阵容盟约</h3>
        <button class="reset" onclick={resetBonds} title="所有盟约归零并设为不激活">↺ 重置盟约</button>
      </div>
      <h4>核心盟约</h4>
      {#each coreBonds as id (id)}<BondCard {id} compact />{/each}
      <h4>其他盟约</h4>
      {#each otherBonds as id (id)}<BondCard {id} compact />{/each}
    </div>
  </aside>

  <section class="board corners" aria-label="DPS 排行">
    <header class="board-head">
      <h2><span class="slab"><span class="no">09</span>RANKING</span>DPS 排行</h2>
      <div class="cond micro">
        TARGET // {boss?.name ?? '—'} · {mode?.name ?? '—'} · 盟约 {activeBonds.length} 项激活 · 不带装备
      </div>
      {#if assumed}<p class="assumed">{assumed}</p>{/if}
    </header>

    <div class="run">
      <button class="start" disabled={busy} onclick={startRanking}>{busy ? '正在计算…' : '开始计算'}</button>
      <span role="status">
        {#if busy}正在计算全部干员的技能与模组，可能需要数十秒。
        {:else if failed}排行计算出错，可再次点击重试。{failed}
        {:else if completed && completed.key !== key}条件已更改，当前显示上次结果。点击「开始计算」更新排行。
        {:else if result}已完成 · {rows.length} 个组合
        {:else if hasStarted}条件已更改，点击「开始计算」更新排行。
        {:else}选好战斗条件后，点击「开始计算」生成排行。{/if}
      </span>
      {#if busy}<span class="time" aria-live="off">已用 {elapsed} 秒</span>{/if}
    </div>

    <div class="filters">
      <div class="seg" role="radiogroup" aria-label="排序指标">
        {#each Object.entries(METRIC) as [k, label]}
          <button role="radio" aria-checked={metric === k} class:on={metric === k} onclick={() => (metric = k as Metric)}>{label}</button>
        {/each}
      </div>
      <div class="seg" role="radiogroup" aria-label="阶级">
        <button class:on={tierFilter === 'all'} onclick={() => (tierFilter = 'all')}>全部阶级</button>
        <button class:on={tierFilter === 'a'} onclick={() => (tierFilter = 'a')}>普通</button>
        <button class:on={tierFilter === 'b'} onclick={() => (tierFilter = 'b')}>精锐</button>
      </div>
      <label class="best"><input type="checkbox" bind:checked={bestOnly} />每名干员只看最佳技能</label>
      <label class="best"><input type="checkbox" bind:checked={bestMod} />只看最高模组</label>
      <input class="search" aria-label="搜索干员" placeholder="搜索干员…" bind:value={query} />
    </div>
    <div class="chips" role="group" aria-label="职业">
      <button class:on={prof === null} onclick={() => (prof = null)}>全部职业</button>
      {#each Object.entries(PROF) as [k, v]}<button class:on={prof === k} onclick={() => (prof = prof === k ? null : k)}>{v}</button>{/each}
    </div>

    {#if result}
    <div class="table" class:by-kill={metric === 'kill'}>
      <div class="row head">
        <span>#</span><span>干员</span><span>技能</span><span class="r">{METRIC[metric === 'kill' ? 'head' : metric]}</span><span class="r">技能期</span><span class="r">击杀</span>
      </div>
      {#each shown.slice(0, limit) as r, i (r.charId + r.tier + r.skillId + (r.uniEquipId ?? ''))}
        {@const op = opById.get(r.charId)!}
        {@const mod = r.uniEquipId ? op.uniEquips?.find((u) => u.uniEquipId === r.uniEquipId) : undefined}
        {@const v = metric === 'kill' || metric === 'head' ? r.head : valueOf(r, metric)}
        <button class="row" class:podium={i < 3} onclick={() => open(r.input)} title="在计算器中打开">
          <span class="no display">{i + 1}</span>
          <span class="who">
            <span class="av"><Avatar src={op.images.avatar} name={op.name} level={op.shopLevel} golden={r.tier === 'b'} /></span>
            <span class="nm"><b>{op.name}</b><small class:elite={r.tier === 'b'}>{r.tier === 'b' ? '精锐' : '普通'} · {PROF[op.profession] ?? ''} · {op.shopLevel}阶</small></span>
          </span>
          <span class="sk">{skills[r.skillId]?.name ?? r.skillId}{#if mod}<em class="mod" title={mod.name}>{mod.typeIcon}</em>{/if}</span>
          <span class="val r">
            <b class="display">{f0(v)}</b>
            <i class="bar" style="width: {Math.min(100, (r.head / top) * 100)}%"></i>
          </span>
          <span class="r num sub">{r.skill !== null ? f0(r.skill) : '—'}</span>
          <span class="r num sub">{fKill(r.killTimeSec)}</span>
        </button>
      {:else}
        <p class="empty">没有符合条件的干员</p>
      {/each}
      {#if shown.length > limit}
        <button class="more" onclick={() => (limit += 60)}>再显示 60 名（共 {shown.length}）</button>
      {/if}
    </div>
    <footer class="foot micro">计算耗时 {(result.costMs / 1000).toFixed(1)} 秒 · 点任意一行在计算器中打开</footer>
    {/if}
  </section>
</div>

<style>
  .rank { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(320px, 400px) minmax(0, 1fr); gap: 14px; padding: 14px 18px; }
  .side, .board { min-height: 0; min-width: 0; overflow-y: auto; background: var(--sheet); border: 1px solid var(--hair); padding: 14px; box-shadow: 0 18px 30px -24px rgba(17, 18, 20, 0.35); }
  .side { display: flex; flex-direction: column; gap: 16px; }
  .bonds { display: flex; flex-direction: column; gap: 6px; }
  h3, h2 { margin: 0; display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 800; letter-spacing: 0.14em; }
  h4 { margin: 8px 0 0; font-size: 13px; letter-spacing: 0.16em; padding-top: 6px; border-top: 2px solid var(--ink); }
  .train { display: flex; flex-direction: column; gap: 8px; }
  .train h3 { margin: 0; font-size: 14px; letter-spacing: 0.14em; }
  .bonds-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .reset { padding: 3px 10px; background: none; border: 2px solid var(--ink); font-size: 13px; font-weight: 800; letter-spacing: 0.08em; white-space: nowrap; transition: background var(--t-fast), color var(--t-fast); }
  .reset:hover { background: var(--ink); color: var(--paper); }

  .board { display: flex; flex-direction: column; gap: 10px; }
  .board-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  .run { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; min-height: 40px; color: var(--ink-2); font-size: 13px; }
  .start { border: 2px solid var(--ink); padding: 6px 18px; background: var(--signal); color: var(--ink); font-weight: 800; }
  .start:hover:enabled { background: var(--ink); color: var(--paper); }
  .start:disabled { background: var(--paper-2); cursor: wait; }
  .time { font-variant-numeric: tabular-nums; }
  .cond { color: var(--ink-3); }
  .assumed { margin: 6px 0 0; font-size: 13px; line-height: 1.5; color: var(--ink-3); }
  .assumed::before { content: '※ '; color: var(--signal); }
  .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .seg { display: flex; border: 2px solid var(--ink); }
  .seg button { padding: 3px 12px; background: none; border: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; color: var(--ink-3); white-space: nowrap; }
  .seg button + button { border-left: 1px solid var(--ink); }
  .seg button:hover { color: var(--ink); background: var(--paper-2); }
  .seg button.on { background: var(--ink); color: var(--paper); }
  .best { display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--ink-2); cursor: pointer; }
  .best input { accent-color: var(--ink); }
  .sk .mod { margin-left: 6px; padding: 0 4px; font: 700 11px var(--font-mono); font-style: normal; letter-spacing: 0.04em; background: var(--paper-2); color: var(--ink-2); white-space: nowrap; }
  .search { margin-left: auto; background: transparent; border: 0; border-bottom: 2px solid var(--ink); padding: 4px 2px; width: 150px; font-size: 14px; }
  .search:focus { outline: none; border-color: var(--signal-deep); }
  .chips { display: flex; flex-wrap: wrap; gap: 4px; }
  .chips button { background: transparent; border: 1px solid var(--hair-strong); padding: 1px 9px; font-size: 13px; color: var(--ink-2); }
  .chips button:hover { border-color: var(--ink); color: var(--ink); }
  .chips button.on { background: var(--ink); border-color: var(--ink); color: var(--paper); }

  .table { position: relative; display: flex; flex-direction: column; transition: opacity var(--t-mid); }
  .row {
    display: grid; grid-template-columns: 44px minmax(150px, 1.4fr) minmax(90px, 1fr) minmax(140px, 1.3fr) 80px 70px; gap: 10px; align-items: center;
    padding: 5px 8px; background: none; border: 0; border-bottom: 1px solid var(--hair); text-align: left; color: var(--ink);
    transition: background var(--t-fast);
  }
  .row:not(.head):hover { background: var(--paper-2); }
  .row.head { position: sticky; top: -14px; z-index: 2; background: var(--ink); color: var(--paper); font-size: 13px; font-weight: 800; letter-spacing: 0.12em; padding: 6px 8px; }
  .r { text-align: right; justify-self: end; }
  .no { font-size: 22px; color: var(--ink-3); line-height: 1; }
  .podium .no { color: var(--ink); }
  .who { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .av { flex: none; width: 36px; height: 36px; clip-path: polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%); }
  .nm { display: flex; flex-direction: column; min-width: 0; }
  .nm b { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nm small { font-size: 12px; color: var(--ink-3); letter-spacing: 0.06em; }
  .nm small.elite { color: var(--ink); font-weight: 700; }
  .sk { font-size: 13px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .val { position: relative; width: 100%; display: flex; justify-content: flex-end; }
  .val b { position: relative; z-index: 1; font-size: 20px; line-height: 1.1; }
  .bar { position: absolute; left: 0; bottom: 1px; height: 5px; background: var(--ink); transition: width var(--t-slow) var(--ease-out); }
  .podium .bar { background: var(--signal-deep); }
  .sub { font-size: 13px; color: var(--ink-2); }
  .empty { color: var(--ink-3); text-align: center; padding: 30px 0; }
  .more { margin: 10px auto 0; padding: 4px 16px; background: var(--ink); color: var(--paper); border: 0; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; }
  .more:hover { background: var(--signal); color: var(--ink); }
  .foot { color: var(--ink-4); margin-top: auto; padding-top: 6px; }

  @media (max-width: 1100px) {
    .rank { min-width: 0; grid-template-columns: minmax(0, 1fr); padding: 12px; }
    .side { max-height: none; overflow: visible; }
    .board { overflow: visible; }
  }
  @media (max-width: 700px) {
    .seg { max-width: 100%; flex-wrap: wrap; }
    .row { grid-template-columns: 30px minmax(0, 1.4fr) minmax(0, 1fr) 72px; gap: 6px; }
    .row > :nth-child(5), .row > :nth-child(6) { display: none; }
    .by-kill .row > :nth-child(4) { display: none; }
    .by-kill .row > :nth-child(6) { display: block; }
    .val b { font-size: 16px; }
    .search { margin-left: 0; width: 100%; }
  }
</style>
