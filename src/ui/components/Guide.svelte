<script lang="ts">
  import { guideCard } from '../lib/guideCard';
  import { fade, fly } from 'svelte/transition';

  /** 首次进入的分步引导：高亮 [data-guide] 区域。 */
  let { open = $bindable(false) }: { open?: boolean } = $props();

  const STEPS = [
    { target: 'operators', title: '① 选择干员', body: '按费用阶或盟约筛选，点击头像选中要计算的干员。' },
    { target: 'config', title: '② 配置棋子', body: '切换普通 / 精锐阶级（精锐可选模组），设置自身练度与潜能，选择技能，装上装备（可在装备列表顶部输入名字搜索）。' },
    { target: 'bonds', title: '③ 设置盟约', body: '为每个盟约选档位（不激活 / 3 人 / 6 人等）并拖动层数（0–999）。下方「全场盟约」是对所有干员都生效的效果，例如奥术减抗、坚守脆弱、灵巧攻速。' },
    { target: 'boss', title: '④ 选择 Boss', body: '选 Boss，再选个人模拟（规程等级 1–20）或联合模拟（标准 / 险境 / 绝境 / 终极），Boss 的血量会随之变化。' },
    { target: 'result', title: '⑤ 查看结果', body: '大数字是循环平均 DPS。点技能期 / 非技能期切换，点伤害条目展开推导。「加入对比」把配置放进底部对比栏，最多并排比较 10 个。底部「计算过程」写出了这个数字是怎么一步步算出来的。' },
  ];
  let i = $state(0);
  let rect = $state<DOMRect | null>(null);

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const el = document.querySelector(`[data-guide="${STEPS[i].target}"]`);
    if (!el) { rect = null; return; }
    // 立即滚到位再测量：平滑滚动未完成时测到的是旧位置，卡片会被放到屏幕外
    el.scrollIntoView({ block: 'nearest', behavior: 'auto' });
    rect = el.getBoundingClientRect();
  }
  $effect(() => {
    if (!open) return;
    void i;
    measure();
    const t = setTimeout(measure, 350);
    window.addEventListener('resize', measure);
    return () => { clearTimeout(t); window.removeEventListener('resize', measure); };
  });

  const focusStep = (node: HTMLButtonElement) => node.focus({ preventScroll: true });
  function close() {
    open = false;
    i = 0;
    try { localStorage.setItem('gdps.guided', '1'); } catch { /* 隐私模式下忽略 */ }
  }
  const pad = 6;
  const gap = 16;
  /** 卡片实际高度（字号放大后说明较长，不能再按固定 180px 估算，否则按钮会被挤出屏幕） */
  let cardH = $state(220);
  let vw = $state(typeof window === 'undefined' ? 1280 : window.innerWidth);
  let vh = $state(typeof window === 'undefined' ? 800 : window.innerHeight);
  const cardW = $derived(Math.min(300, vw - gap * 2));
  const card = $derived(guideCard(rect, vw, vh, cardW, cardH, gap));
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div class="veil" transition:fade={{ duration: 200 }}>
    {#if rect}
      <div class="hole" style="left:{rect.left - pad}px; top:{rect.top - pad}px; width:{rect.width + pad * 2}px; height:{rect.height + pad * 2}px"></div>
    {/if}
    {#key i}
      <div class="card" style="left:{card.left}px; top:{card.top}px; width:{cardW}px" bind:offsetHeight={cardH} in:fly={{ y: 10, duration: 260 }}>
        <div class="step num">{i + 1} / {STEPS.length}</div>
        <h4>{STEPS[i].title}</h4>
        <p>{STEPS[i].body}</p>
        <div class="btns">
          {#if i < STEPS.length - 1}<button class="ghost" use:focusStep onclick={close}>跳过</button>{/if}
          {#if i > 0}<button class="ghost" onclick={() => i--}>上一步</button>{/if}
          {#if i < STEPS.length - 1}<button class="primary" onclick={() => i++}>下一步</button>
          {:else}<button class="primary" use:focusStep onclick={close}>开始使用</button>{/if}
        </div>
      </div>
    {/key}
  </div>
{/if}

<style>
  .veil { position: fixed; inset: 0; z-index: 100; }
  .hole {
    position: fixed; border: 3px solid var(--signal);
    box-shadow: 0 0 0 9999px rgba(17, 18, 20, 0.72);
    transition: all var(--t-slow) var(--ease-cut); pointer-events: none;
  }
  .card {
    position: fixed; max-height: calc(100vh - 32px); overflow-y: auto; background: var(--ink); color: var(--paper); padding: 14px 16px 12px; border-left: 6px solid var(--signal);
    clip-path: polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%);
    box-shadow: 0 20px 50px -10px rgba(0, 0, 0, 0.7);
    transition: left var(--t-slow) var(--ease-cut), top var(--t-slow) var(--ease-cut);
  }
  .step { font-family: var(--font-display); font-stretch: 75%; font-size: 22px; font-weight: 800; color: var(--signal); line-height: 1; }
  h4 { margin: 6px 0; font-size: 16px; letter-spacing: 0.1em; }
  p { margin: 0 0 12px; color: var(--ink-4); font-size: 14px; }
  .btns { display: flex; gap: 6px; justify-content: flex-end; }
  button { padding: 4px 12px; border: 1px solid rgba(236, 237, 235, 0.35); background: none; color: var(--paper); font-weight: 700; letter-spacing: 0.08em; }
  .primary { background: var(--signal); border-color: var(--signal); color: var(--ink); }
  .ghost:hover { border-color: var(--paper); }
</style>
