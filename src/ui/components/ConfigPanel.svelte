<script lang="ts">
  import { fly, slide } from 'svelte/transition';
  import type { ChessTier, EquipData } from '../../engine/types';
  import { equipCoverage } from '../../engine/effects/equips';
  import { bondById, equips, opById, skills } from '../data';
  import { cfg, defaultUniEquip, ensureBonds, memberBondIds, opShopLevel, opTiers, resetBondsAndEquips, selectedUniEquip, setUniEquip, shownMemberBonds, SPECIAL_HAMMERS, hasUltimateHammer, TEAM_BONDS } from '../state.svelte';
  import Avatar from './Avatar.svelte';
  import RichText from './RichText.svelte';
  import BondCard from './BondCard.svelte';
  import TrainingPanel from './TrainingPanel.svelte';

  const PROF: Record<string, string> = {
    PIONEER: '先锋', WARRIOR: '近卫', TANK: '重装', SNIPER: '狙击', CASTER: '术师', MEDIC: '医疗', SUPPORT: '辅助', SPECIAL: '特种',
  };
  const op = $derived(opById.get(cfg.charId)!);
  const tiers = $derived(opTiers(op));
  const tier = $derived(tiers[cfg.tier]);
  const lvShown = $derived(opShopLevel(op));
  /** 精锐阶模组：可选列表、当前选择、默认 */
  const mods = $derived(op.uniEquips ?? []);
  const modSel = $derived(selectedUniEquip(op));
  const modDef = $derived(defaultUniEquip(op));
  const modCur = $derived(cfg.tier === 'b' ? mods.find((u) => u.uniEquipId === modSel) : undefined);
  /**
   * 可选装备：去掉「装备时/装备后销毁」类道具（换资金、晋升、刷新等），
   * 以及只有生存、控制、局外效果的装备（不影响输出）。
   * 赠送盟约的装备保留（可与变形同构体配对取得盟约），天马之盔保留（与天马之枪组合）。
   * 同名普通/进阶相邻，按费用阶、名字排序。
   */
  const affectsOutput = (e: EquipData) => !!e.giveBondId || e.name === '天马之盔' || equipCoverage(e).status !== '与 DPS 无关';
  const equipPool = equips
    .filter((e) => (e.tier === 'a' || e.tier === 'b') && !/销毁/.test(e.desc ?? '') && affectsOutput(e))
    .sort((x, y) => {
      const lv = (n: string) => Math.min(...equips.filter((e) => e.name === n).map((e) => e.shopLevel));
      return lv(x.name) - lv(y.name) || x.name.localeCompare(y.name, 'zh-CN') || (x.tier === 'a' ? -1 : 1);
    });
  let equipQuery = $state('');
  /** 打开装备列表时把光标放进搜索框（autofocus 只在页面首次加载时生效） */
  const focusOnOpen = (node: HTMLInputElement) => { requestAnimationFrame(() => node.focus({ preventScroll: true })); };
  const plain = (t: string | null | undefined) => (t ?? '').replace(/<[^>]*>/g, '');
  const equipShown = $derived(
    equipQuery.trim() ? equipPool.filter((e) => e.name.includes(equipQuery.trim()) || plain(e.desc).includes(equipQuery.trim())) : equipPool,
  );
  let slotOpen = $state<number | null>(null);
  /** 成员盟约（含变形同构体赠送的）；全场盟约区只列本干员不是成员的那些 */
  const memberIds = $derived(memberBondIds(op, cfg.equips));
  /** 盟约区显示的成员盟约（去掉与 DPS 无关的；调和干员加上全部核心盟约） */
  const shownIds = $derived(shownMemberBonds(op, cfg.equips));
  const teamIds = $derived(TEAM_BONDS.filter((id) => !memberIds.includes(id)));

  /** 全场盟约：非成员时生效的部分（只计全场部分，见引擎 effects/bonds.ts） */
  const TEAM_NOTE: Record<string, string> = {
    arcaneShip: '在场 3 名【奥术】：敌人法术抗性降低，按减抗上限计（上限随层数提高）',
    steadShip: '在场 3 名【坚守】：Boss 攻击坚守干员后受到 40% 脆弱，按 Boss 持续攻击坚守干员计',
    swiftShip: '40 层起，所有干员技能结束时有概率额外回复 15 技力。180 秒内开技不超过 10 次按分支概率算总伤，超过 10 次按均匀序列逐次判定。',
    skillfulShip: '激活后默认本干员处于【灵巧】干员周围，攻击速度提升（受层数影响）',
    raidShip: '达到 50 层：所有干员攻击速度 +50',
    preciShip: '在场 3 名【精准】：所有远程干员攻击力提升，并无视一定防御力和法术抗性',
    suntShip: '精锐干员：在场 2 名精锐攻击力 +30%，5 名精锐技力消耗 -30%',
  };

  function setTier(t: ChessTier) {
    cfg.tier = t;
    cfg.equips = cfg.equips.slice(0, tiers[t].equipSlotNum);
  }
  function pickEquip(slot: number, id: string | null) {
    const next = [...cfg.equips];
    if (id === null) next.splice(slot, 1);
    else next[slot] = id;
    cfg.equips = next.filter(Boolean);
    slotOpen = null;
    equipQuery = '';
    ensureBonds(); // 变形同构体可能赠送新的盟约

  }
  const phaseName = (p: number) => ['精英零', '精英一', '精英二'][p];
  const skillLvName = (lv: number) => (lv > 7 ? `专精 ${lv - 7}` : `等级 ${lv}`);
</script>

<section class="cfg" data-guide="config">
  {#key op.charId}
    <div class="hero" in:fly={{ x: -24, duration: 420, opacity: 0 }} style="--lv: var(--lv-{lvShown})">
      <div class="ghost display" aria-hidden="true">{op.appellation}</div>
      <div class="avatar" class:golden={cfg.tier === 'b'}>
        <Avatar src={op.images.avatar} name={op.name} level={lvShown} golden={cfg.tier === 'b'} />
      </div>
      <div class="meta">
        <div class="cls"><span class="lvbox display">{lvShown}</span><span>{PROF[op.profession] ?? op.profession}</span><span class="stars">{'★'.repeat(op.rarity)}</span></div>
        <h1>{op.name}</h1>
        <div class="en micro">{op.appellation} // {op.charId}</div>
        <div class="tags">
          {#if op.diy}<span class="tag diy" title="玩家自带的干员（自选棋子）">自选干员</span>{/if}
          {#each memberIds as id (id)}
            {@const gifted = !op.bondIds.includes(id)}
            <span class="tag" class:gifted title={gifted ? '由变形同构体赠送' : ''} in:fly={{ y: -6, duration: 260 }}>{bondById.get(id)?.name ?? id}{#if gifted}<i>同构</i>{/if}</span>
          {/each}
        </div>
        <div class="tier-status num">
          {phaseName(tier.evolvePhase)} Lv.{tier.level} · 技能{skillLvName(tier.skillLevel)}{tier.uniEquipLevel ? ` · ${modCur?.typeIcon ?? ''} 模组 ${tier.uniEquipLevel} 级${modCur?.attrOnly ? '（仅属性）' : ''}` : ''}
        </div>
      </div>
    </div>
  {/key}

  <div class="block">
    <h3><span class="slab"><span class="no">02</span>TIER</span>棋子阶级</h3>
    <div class="tier-toggle" role="radiogroup">
      <button class:on={cfg.tier === 'a'} onclick={() => setTier('a')} role="radio" aria-checked={cfg.tier === 'a'}>
        <b>普通</b><small>{phaseName(tiers.a.evolvePhase)} Lv.{tiers.a.level}</small>
      </button>
      <button class="gold" class:on={cfg.tier === 'b'} onclick={() => setTier('b')} role="radio" aria-checked={cfg.tier === 'b'}>
        <b>精锐</b><small>{phaseName(tiers.b.evolvePhase)} Lv.{tiers.b.level}</small>
      </button>
    </div>
    {#if tier.chessDesc}<p class="chess-desc"><RichText text={tier.chessDesc} /></p>{/if}
    {#if cfg.tier === 'b' && mods.length}
      <div class="mods">
        <span class="k">模组</span>
        <div class="mod-list" role="radiogroup" aria-label="精锐阶模组">
          {#each mods as u (u.uniEquipId)}
            <label class:on={modSel === u.uniEquipId} title="{u.name}{u.attrOnly ? '：其他模式专用模组，卫戍协议中只计属性加成' : ''}">
              <input type="radio" name="elite-module" checked={modSel === u.uniEquipId} onchange={() => setUniEquip(op, u.uniEquipId)} />
              <b>{u.typeIcon}</b>{#if u.uniEquipId === modDef}<small>默认</small>{/if}{#if u.attrOnly}<small>仅属性</small>{/if}
            </label>
          {/each}
        </div>
      </div>
    {/if}
    <TrainingPanel showDiy={!!op.diy} />
  </div>

  <div class="block">
    <h3><span class="slab"><span class="no">03</span>SKILL</span>技能</h3>
    <div class="skills">
      {#each op.skillIds as sid, i}
        {@const s = skills[sid]}
        {@const lv = s?.levels[String(tier.skillLevel)]}
        <button class="skill" class:on={cfg.skillId === sid} onclick={() => (cfg.skillId = sid)}>
          <div class="sk-head">
            <span class="sk-no num">S{i + 1}</span>
            <b>{s?.name ?? sid}</b>
            {#if lv}<span class="sp num">{lv.spCost} SP{lv.duration > 0 ? ` · ${lv.duration}s` : ''}</span>{/if}
          </div>
          {#if cfg.skillId === sid && lv}
            <p transition:slide={{ duration: 220 }}><RichText text={lv.description} bb={lv.blackboard} /></p>
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <div class="block" data-guide="equips">
    <h3><span class="slab"><span class="no">04</span>EQUIP</span>装备 <small class="num">{cfg.equips.length}/{tier.equipSlotNum}</small></h3>
    <div class="slots">
      {#each Array(tier.equipSlotNum) as _, slot}
        {@const e = equips.find((x) => x.chessId === cfg.equips[slot])}
        <div class="slot-wrap">
          <button class="slot" class:filled={!!e} class:golden={e?.tier === 'b'} onclick={() => (slotOpen = slotOpen === slot ? null : slot)}>
            {#if e}<b>{e.name}</b><small><RichText text={e.desc} /></small>{:else}<span class="plus">＋</span><small>空槽位</small>{/if}
          </button>
          {#if slotOpen === slot}
            <div class="pop" transition:fly={{ y: -6, duration: 180 }}>
              <input class="eq-search" aria-label="搜索装备名或效果" placeholder="输入装备名或效果…" bind:value={equipQuery} use:focusOnOpen />
              {#if e}<button class="pop-item clear" onclick={() => pickEquip(slot, null)}>卸下</button>{/if}
              {#each equipShown as eq (eq.chessId)}
                <button class="pop-item" class:golden={eq.tier === 'b'} onclick={() => pickEquip(slot, eq.chessId)}>
                  <b>{eq.name}<span class="eq-tier">{eq.tier === 'b' ? '进阶' : '普通'}</span></b><small><RichText text={eq.desc} /></small>
                </button>
              {:else}
                <p class="eq-empty">没有匹配的装备</p>
              {/each}
            </div>
          {/if}
        </div>
      {/each}
    </div>
    {#if hasUltimateHammer(cfg.equips)}
      <fieldset class="hammers" transition:slide={{ duration: 180 }}>
        <legend>终极维式重锤 · 场上有哪些维式重锤</legend>
        {#each SPECIAL_HAMMERS as h (h)}
          <label><input type="checkbox" checked={cfg.fieldHammers.includes(h)}
            onchange={(ev) => (cfg.fieldHammers = ev.currentTarget.checked ? SPECIAL_HAMMERS.filter((x) => x === h || cfg.fieldHammers.includes(x)) : cfg.fieldHammers.filter((x) => x !== h))} />{h.replace('维式重锤', '')}</label>
        {/each}
      </fieldset>
    {/if}
  </div>

  <div class="block" data-guide="bonds">
    <div class="bond-heading">
      <h3><span class="slab"><span class="no">05</span>COVENANT</span>盟约</h3>
      <button type="button" class="reset" onclick={resetBondsAndEquips} title="卸下全部装备，所有盟约归零并设为不激活">重置盟约与装备</button>
    </div>
    {#each shownIds as id (id)}<BondCard {id} gifted={memberIds.includes(id) && !op.bondIds.includes(id)} />{/each}

    <h4 class="team-title"><span>全场盟约</span><small>对所有干员生效的部分 · 不激活即不计</small></h4>
    {#each teamIds as id (id)}<BondCard {id} team note={TEAM_NOTE[id] ?? null} />{/each}
  </div>
</section>

<style>
  .cfg { display: flex; flex-direction: column; gap: 18px; overflow-y: auto; min-height: 0; padding-right: 4px; }

  /* —— 干员主视觉 —— */
  .hero { position: relative; display: grid; grid-template-columns: 104px 1fr; gap: 16px; align-items: center; padding-top: 8px; }
  .ghost {
    position: absolute; left: -6px; top: -14px; right: 0; z-index: 0; font-size: 84px; line-height: 0.82;
    color: transparent; -webkit-text-stroke: 1px rgba(17, 18, 20, 0.16); white-space: nowrap; overflow: hidden; pointer-events: none;
  }
  .avatar {
    position: relative; z-index: 1; width: 104px; height: 104px; overflow: hidden; background: var(--paper-2);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%);
    box-shadow: inset 0 -4px 0 var(--ink);
  }
  .avatar :global(img) { position: relative; z-index: 0; }
  .avatar::before { content: ''; position: absolute; inset: auto 0 0 0; height: 4px; background: var(--ink); z-index: 1; }
  .avatar.golden::before { background: var(--signal); }
  .avatar.golden::after {
    content: '精锐'; position: absolute; top: 0; right: 0; z-index: 1; padding: 1px 6px; font-size: 12px; font-weight: 900; letter-spacing: 0.1em;
    background: var(--signal); color: var(--ink);
  }
  .meta { position: relative; z-index: 1; }
  .cls { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; letter-spacing: 0.12em; color: var(--ink-2); }
  .lvbox { display: inline-grid; place-items: center; width: 24px; height: 24px; background: var(--ink); color: var(--paper); font-size: 18px; border-left: 4px solid var(--lv); }
  .stars { color: var(--signal-deep); letter-spacing: 0; font-size: 13px; }
  h1 { margin: 4px 0 0; font-size: 36px; line-height: 1.05; font-weight: 900; letter-spacing: 0.06em; }
  .en { margin-top: 2px; }
  .tags { display: flex; gap: 4px; margin: 8px 0 6px; flex-wrap: wrap; }
  .tag { font-size: 13px; padding: 0 7px; background: var(--ink); color: var(--paper); letter-spacing: 0.08em; }
  .tag.gifted { background: var(--signal); color: var(--ink); font-weight: 800; }
  .tag.diy { background: var(--signal); color: var(--ink); font-weight: 800; outline: 2px solid var(--ink); outline-offset: -2px; }
  .tag i { font-style: normal; font-size: 11px; margin-left: 4px; padding: 0 3px; background: var(--ink); color: var(--signal); }
  .mods { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .mods .k { flex: none; width: 64px; font-size: 13px; font-weight: 700; color: var(--ink-2); letter-spacing: 0.06em; }
  .mod-list { display: flex; flex-wrap: wrap; border: 1px solid var(--ink); }
  .mod-list input { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; opacity: 0; cursor: pointer; }
  .mod-list label:has(:focus-visible) { outline: 2px solid var(--ink); box-shadow: 0 0 0 4px var(--signal); z-index: 1; }
  .mod-list label:active { transform: translateY(1px); }
  .mod-list label {
    position: relative; display: flex; align-items: baseline; gap: 4px; padding: 2px 10px; background: none; border: 0; color: var(--ink-3); white-space: nowrap;
    transition: background var(--t-fast), color var(--t-fast);
  }
  .mod-list label + label { border-left: 1px solid var(--ink); }
  .mod-list label:hover { color: var(--ink); background: var(--paper-2); }
  .mod-list label.on { background: var(--signal); color: var(--ink); }
  .mod-list b { font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.04em; }
  .mod-list small { font-size: 11px; font-weight: 700; color: inherit; opacity: 0.75; }
  .tier-status { font-size: 13px; color: var(--ink-2); border-top: 1px solid var(--hair); padding-top: 6px; }

  /* —— 分区 —— */
  .block { display: flex; flex-direction: column; gap: 8px; }
  h3 { margin: 0; font-size: 14px; font-weight: 800; color: var(--ink); letter-spacing: 0.16em; display: flex; align-items: center; gap: 10px; }
  h3 small { color: var(--ink-3); letter-spacing: 0; }
  .bond-heading { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .reset { padding: 3px 10px; background: none; border: 2px solid var(--ink); font-size: 13px; font-weight: 800; letter-spacing: 0.08em; }
  .reset:hover { color: var(--paper); background: var(--ink); }

  .tier-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 2px solid var(--ink); }
  .tier-toggle button {
    display: flex; flex-direction: column; align-items: flex-start; padding: 8px 12px; background: var(--sheet); border: 0;
    transition: background var(--t-mid) var(--ease-out), color var(--t-mid);
  }
  .tier-toggle button + button { border-left: 2px solid var(--ink); }
  .tier-toggle b { font-size: 15px; letter-spacing: 0.2em; }
  .tier-toggle small { color: var(--ink-3); font-size: 13px; }
  .tier-toggle button.on { background: var(--ink); color: var(--paper); }
  .tier-toggle button.on small { color: var(--ink-4); }
  .tier-toggle .gold.on { background: var(--signal); color: var(--ink); }
  .tier-toggle .gold.on small { color: var(--ink-2); }
  .chess-desc { margin: 0; font-size: 13px; color: var(--ink-2); padding: 6px 10px; border-left: 4px solid var(--ink); background: var(--paper-2); }

  .skills { display: flex; flex-direction: column; gap: 4px; }
  .skill {
    position: relative; text-align: left; background: var(--sheet); border: 1px solid var(--hair); padding: 8px 12px 8px 14px;
    transition: border-color var(--t-fast), background var(--t-fast);
  }
  .skill::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: transparent; transition: background var(--t-mid); }
  .skill:hover { border-color: var(--ink); }
  .skill.on { border-color: var(--ink); background: var(--sheet-2); }
  .skill.on::before { background: var(--signal); }
  .sk-head { display: flex; align-items: center; gap: 10px; }
  .sk-no { font-family: var(--font-display); font-stretch: 75%; font-size: 16px; font-weight: 800; color: var(--ink-4); }
  .skill.on .sk-no { color: var(--ink); }
  .sp { margin-left: auto; font-size: 13px; color: var(--ink-3); }
  .skill p { margin: 6px 0 0; font-size: 13px; color: var(--ink-2); }

  .slots { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
  .hammers { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0 0; padding: 8px 10px; border: 1px solid var(--line, rgba(17, 18, 20, 0.15)); }
  .hammers legend { padding: 0 4px; font-size: 13px; color: var(--ink-3); }
  .hammers label { display: inline-flex; align-items: center; gap: 4px; font-size: 14px; cursor: pointer; }
  .slot-wrap { position: relative; }
  .slot {
    width: 100%; min-height: 58px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; text-align: left;
    background: transparent; border: 1px dashed var(--hair-strong); padding: 6px 10px; transition: all var(--t-fast);
  }
  .slot:hover { border-color: var(--ink); border-style: solid; }
  .slot.filled { border: 2px solid var(--ink); background: var(--sheet-2); }
  .slot.golden { border-color: var(--ink); box-shadow: inset 4px 0 0 var(--signal); }
  .slot small { font-size: 13px; color: var(--ink-3); }
  .plus { font-size: 20px; line-height: 1; font-weight: 300; }
  .pop {
    position: absolute; z-index: 20; top: calc(100% + 4px); left: 0; width: 280px; max-height: 300px; overflow-y: auto;
    background: var(--sheet-2); border: 2px solid var(--ink); padding: 4px; box-shadow: 8px 8px 0 rgba(17, 18, 20, 0.12);
  }
  .pop-item { display: flex; flex-direction: column; align-items: flex-start; width: 100%; text-align: left; background: none; border: 0; padding: 6px 8px; border-bottom: 1px solid var(--paper-2); }
  .pop-item:hover { background: var(--signal); }
  .pop-item small { font-size: 13px; color: var(--ink-3); }
  .pop-item.golden b::after { content: ' ◆'; color: var(--signal-deep); }
  .eq-tier { margin-left: 6px; font-size: 12px; font-weight: 700; color: var(--ink-3); }
  .eq-search {
    position: sticky; top: -4px; z-index: 1; width: 100%; margin: -4px 0 4px; padding: 6px 8px; font-size: 13px;
    background: var(--sheet-2); border: 0; border-bottom: 2px solid var(--ink);
  }
  .eq-search:focus { outline: none; border-color: var(--signal-deep); }
  .eq-empty { margin: 0; padding: 10px; font-size: 13px; color: var(--ink-3); }
  .pop-item.clear { color: var(--alert); font-weight: 700; }

  .team-title { margin: 8px 0 0; display: flex; align-items: baseline; gap: 10px; padding-top: 8px; border-top: 2px solid var(--ink); font-size: 14px; letter-spacing: 0.16em; }
  .team-title small { font-size: 13px; font-weight: 400; color: var(--ink-3); letter-spacing: 0.04em; }

  @media (max-width: 700px) {
    .slot-wrap:nth-child(even) .pop { left: auto; right: 0; }
    .pop { max-width: calc(100vw - 56px); }
  }
</style>
