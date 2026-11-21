<script lang="ts">
  import { flip } from 'svelte/animate';
  import { fly, scale } from 'svelte/transition';
  import { bosses, calculate, modes, opById, skills } from '../data';
  import { applyInput, opShopLevel, compare, removeCompare, COMPARE_MAX } from '../state.svelte';
  import { headlineOf } from '../lib/headline';
  import Avatar from './Avatar.svelte';

  /** 对比项：每次重新计算（数据或引擎更新后仍准确） */
  const rows = $derived(
    compare.items.flatMap((input, idx) => {
      const op = opById.get(input.charId);
      if (!op) return [];
      const r = calculate(input);
      return [{
        idx, input, op,
        head: r && headlineOf(r),
        skill: skills[input.skillId]?.name ?? input.skillId,
        boss: bosses.find((b) => b.bossId === input.bossId)?.name ?? input.bossId,
        mode: modes.find((m) => m.modeId === input.modeId)?.name.replace('规程等级', 'Lv.') ?? input.modeId,
        bonds: input.bonds.filter((b) => b.stacks > 0).length,
      }];
    }),
  );
  const max = $derived(Math.max(1, ...rows.map((x) => (x.head?.value ?? -1))));
  const best = $derived(rows.reduce((bi, x, i) => ((x.head?.value ?? -1) > (rows[bi]?.head?.value ?? -1) ? i : bi), 0));
  const f0 = (n: number) => Math.round(n).toLocaleString('zh-CN');
</script>

<section class="cmp" aria-label="配置对比">
  <div class="title">
    <span class="slab"><span class="no">08</span>COMPARE</span><span class="num">{compare.items.length}/{COMPARE_MAX}</span>
  </div>
  {#if compare.items.length === 0}
    <p class="empty">在结果卡点「加入对比」，最多并排比较 {COMPARE_MAX} 个配置</p>
  {:else}
    <div class="items">
      {#each rows as row, i (row.input)}
          <div class="item" class:best={i === best && rows.length > 1} animate:flip={{ duration: 260 }} in:scale={{ start: 0.9, duration: 260 }} out:fly={{ y: 20, duration: 200 }}>
            <button class="load" onclick={() => applyInput(row.input)} title="载入这个配置">
              <span class="av" class:gold={row.input.tier === 'b'}><Avatar src={row.op.images.avatar} name={row.op.name} level={opShopLevel(row.op, row.input.diyShopLevel ?? 6)} /></span>
              <span class="meta">
                <b>{row.op.name}</b>
                <small>{row.input.tier === 'b' ? '精锐' : '普通'}{row.input.tier === 'b' && row.input.uniEquipId ? ` · ${row.op.uniEquips?.find((u) => u.uniEquipId === row.input.uniEquipId)?.typeIcon ?? ''}` : ''} · {row.skill}</small>
                <small>{row.boss} · {row.mode}{row.input.equips.length ? ` · 装备${row.input.equips.length}` : ''}{row.bonds ? ` · 盟约${row.bonds}` : ''}</small>
              </span>
              <span class="val">
                <b class="num">{row.head ? f0(row.head.value) : '—'}</b>
                <small>{row.head?.label.replace(' DPS', '') ?? '计算出错'}</small>
              </span>
            </button>
            <div class="bar"><div style="width: {((row.head?.value ?? 0) / max) * 100}%"></div></div>
            <button class="x" onclick={() => removeCompare(row.idx)} aria-label="移出对比">×</button>
          </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .cmp {
    display: flex; align-items: stretch; gap: 14px; padding: 10px 18px 12px; min-height: 66px;
    border-top: 2px solid var(--ink); background: var(--sheet);
  }
  .title { display: flex; flex-direction: column; justify-content: center; gap: 4px; min-width: 96px; }
  .title > span.num { font-family: var(--font-display); font-stretch: 75%; font-size: 18px; font-weight: 800; color: var(--ink-3); }
  .empty { margin: 0; align-self: center; color: var(--ink-3); font-size: 13px; letter-spacing: 0.06em; }
  .items { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; max-height: 34vh; overflow-y: auto; }
  .item { position: relative; background: var(--sheet-2); border: 2px solid var(--ink); overflow: hidden; transition: background var(--t-mid); }
  .item.best { background: var(--signal); }
  .load { display: flex; align-items: center; gap: 8px; width: 100%; padding: 6px 28px 10px 6px; background: none; border: 0; text-align: left; }
  .av { flex: 0 0 40px; height: 40px; overflow: hidden; background: var(--paper-2); border-bottom: 3px solid var(--ink); }
  .av.gold { border-bottom-color: var(--signal-deep); }
  .meta { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.3; }
  .meta b { font-size: 14px; display: flex; align-items: center; gap: 4px; letter-spacing: 0.06em; }
  .meta small { font-size: 12px; color: var(--ink-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .best .meta small { color: var(--ink-2); }
  .val { display: flex; flex-direction: column; align-items: flex-end; }
  .val b { font-family: var(--font-display); font-stretch: 75%; font-size: 26px; font-weight: 800; line-height: 1; }
  .val small { font-size: 12px; color: var(--ink-3); white-space: nowrap; }
  .bar { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; background: var(--paper-2); }
  .bar div { height: 100%; background: var(--ink); transition: width var(--t-slow) var(--ease-out); }
  .x { position: absolute; top: 2px; right: 4px; width: 20px; height: 20px; padding: 0; line-height: 1; background: none; border: 0; color: var(--ink-3); font-size: 16px; }
  .x:hover { color: var(--alert); }
  .load:hover .meta b { text-decoration: underline; text-decoration-color: var(--signal-deep); text-decoration-thickness: 3px; }

  @media (max-width: 1100px) {
    .cmp { padding: 10px 12px; }
  }
  @media (max-width: 640px) {
    .cmp { flex-direction: column; gap: 6px; }
    .title { flex-direction: row; gap: 8px; align-items: center; }
    .items { grid-template-columns: minmax(0, 1fr); max-height: 50vh; }
  }
</style>
