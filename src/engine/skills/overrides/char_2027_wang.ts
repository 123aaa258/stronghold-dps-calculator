import tokensJson from '../../../data/generated/tokens.json' with { type: 'json' };
import type { TokenData } from '../../types.ts';
import { resolveTokenTier } from '../../operator-state.ts';
import { battleEffects } from '../../effects/common.ts';
import { castMark, integrate, integrateWithCasts, type Segment } from '../../timeline.ts';
import type { SkillOverride } from './index.ts';
import { overrideBase, phase } from './shared.ts';
import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';

// https://prts.wiki/w/卫戍协议/帮助 ：休整期预设召唤物位置，开局免费部署一次；退场后仅原格再部署。
// https://prts.wiki/w/望 、https://prts.wiki/w/棋子 ：原子不可落在地面敌人脚下，跟子可优先生成在敌格。
// 部署先于敌人入场。选取首枚跟子按优先级落在未来Boss格的预设方向；后续再部署时跟子优先有敌格。
// Boss由旁格阻挡，所在格无我方单位。只结算此二子连线，S3明确取范围内只有这两格可生成跟子的最小布阵。
export const wangOverride: SkillOverride = (context, generic) => {
  const { tier, skill, level } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const clock = new ShredClock(e);
  const bb = level.blackboard.nums;
  const placement = tier.talents[0]!;
  const tokenId = placement.tokenKey!;
  const token = resolveTokenTier((tokensJson as unknown as Record<string, TokenData>)[tokenId]!, context.operator, tier)!;
  const talent = tier.talents[1]!.blackboard.nums;
  const stacks = Math.min(2, talent['attack@max_trigger_cnt']!);
  const boost = stacks * talent['attack@per_atk_scale']!;
  const penetration = stacks * talent['attack@per_magic_resist_penetrate_fixed']!;
  const s1 = skill.skillId.endsWith('_1');
  const s3 = skill.skillId.endsWith('_3');
  const scale = s3 ? bb.atk_scale! : bb['attack@atk_scale']!;
  // 召唤物棋子借用望的攻击面板，使用自己的穿透/增伤；跟子伤害来源是望。S1持续伤害预计算后无来源。
  const stone = (summoned: boolean, active: boolean, interval = 1, hits = 1) => {
    const effect = summoned ? { ...e, attackScale: 1, resPenetrationFixed: 0, resPenetrationPct: 0,
      extraHits: [], modifiers: e.modifiers.filter(m => m.kind === 'fragile') } : { ...e, extraHits: s1 ? [] : e.extraHits };
    const p = phase(context, { ...effect, modifiers: [...effect.modifiers,
      { group: '料敌机先', kind: 'increase', value: boost, source: 'talent:wang:2' }] },
    { active, type: 'arts', scale, resPenetrationFixed: penetration, fixedInterval: interval, hits, damageEvents: clock.count });
    p.components[0]!.label = summoned ? '棋子' : '跟子';
    p.components[0]!.source = summoned ? `token:${tokenId}` : 'talent:wang:1';
    return p;
  };
  const normalAt = () => phase(context, e, { ownerActions: 1, type: 'physical', damageEvents: clock.count });
  model.normal = normalAt();
  const strike = (summoned: boolean, active: boolean) => {
    const packet = stone(summoned, active);
    clock.burst(packet.components);
    return packet.dps;
  };
  model.burst = false;
  model.passive = false;
  const normal = model.normal.dps;
  model.notes.push('近似：固定一枚棋子在 Boss 邻格，由旁格阻挡；按自动部署触发铸子且部署费充足，首个跟子落在预定 Boss 格，以入场为零时刻。两子相连，各取两层料敌机先。其他地形、落点或三子连线会改变结果。');
  if (e.timedStats.length) model.notes.push('近似：限时外部属性取部署值，尚未在到期时重算。');
  if (!s3) {
    // S1/S2只检测本格。跟子落于Boss格而触发，原子不触发、不会退场重部署；库存满时技能阻回。
    const dot = s1 ? bb['attack@sluggish']! : 0;
    const opening: Segment[] = [];
    if (s1) clock.append(opening, dot, () => {
      const body = normalAt(), hit = stone(false, false);
      return {...body, components:[...body.components,...hit.components], dps:body.dps + hit.dps};
    });
    else opening.push({ duration:0, dps:0, burst:strike(false,false) });
    clock.append(opening, Infinity, normalAt);
    model.lifecycle = 'instant';
    model.duration = 0;
    model.skill = model.normal;
    model.caveats.push(`主动只补充${bb.cnt}枚棋子；初始${level.initSp}、消耗${level.spCost}技力，首次补满后停止回复。技能面板显示持续的本体普攻；仅开局跟子有额外伤害。`);
    if (s1) model.notes.push(`近似：取势每秒造成一次法伤，持续${dot}秒；首跳时刻未确认，按持续伤害率积分。停顿不改变被阻挡目标。`);
    else model.caveats.push('连星只触发一次，连线两侧三格包含脚下 Boss；移速降低不改变静止目标。');
    model.customTimeline = (duration, hp) => ({ ...integrate(opening, [], duration, hp),
      cycle: null, notes: [], caveats: [] });
    return model;
  }

  // S3被动 x-6 是本格及上下左右各两格，原子和跟子都会触发；跟子并无独立攻击面板。
  // 模组额外同时部署上限、部署费优惠不改变固定一格的再部署时间。
  const cooldown = token.attributes.respawnTime;
  // 棋子自身的三潜天赋另加一格手牌库存，与望的铸子初始持有量分开生效。
  const capacity = token.maxDeckStackCnt! + token.talents![0]!.blackboard.nums.max_deck_stack_cnt!;
  const casts = Math.min(capacity, bb.cnt!);
  const ammo = bb.trigger_time!;
  model.lifecycle = 'ammo';
  // 描述“额外至多部署3枚棋子并消耗等量弹药”。此布局仅有一个相邻跟子落点，一组实际生成一枚/耗一弹。
  const refund = Math.min(capacity, ammo - casts);
  model.notes.push(`近似：天下劫按两格布阵计算：技能范围内只有预设格和相邻 Boss 格可生成棋子。每隔${cooldown}秒，原格部署一枚原子并向 Boss 格投一枚跟子，实耗1弹。打完${casts}组后以剩余${ammo - casts}发填回${refund}枚库存，冷却期照常落子。开技溢出先向 Boss 格、再向预设格生成；按同批每格只落一枚、同格覆盖后检测连线。逐帧触发先后未核实。`);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const stored = Math.min(cost, Math.max(0, level.initSp + e.initSp));
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? sp / rate : Infinity;
  const first = wait(cost - stored);
  const recovery = wait(cost);
  const makeCycle = (seconds: number, firstCycle = false) => {
    const parts: Segment[] = [];
    let at = 0;
    let ready = firstCycle ? 0 : cooldown;
    // 开局预设免费；之后每次花一枚。技能就绪与再部署冷却同时完成时先开技。
    let available = firstCycle ? 1 + placement.blackboard.nums.cnt! : refund;
    while (available > 0 && (ready < seconds || firstCycle && ready === 0)) {
      clock.append(parts, ready - at, normalAt);
      parts.push({duration:0,dps:0,burst:strike(true,false)+strike(false,false)});
      available--;
      at = ready;
      ready += cooldown;
    }
    clock.append(parts, seconds - at, normalAt);
    const overflow = Math.max(0, available + bb.cnt! - capacity);
    // 两枚溢出跟子可于开技立即相连，各按望造成一击。只有一枚时孤子等待原子，
    // 下一次生成在Boss同格的跟子覆盖旧子后再检测，只剩一对；其间的再部署CD仍照走。
    const overflowHits = overflow >= 2 ? 2 : 0;
    const delay = Math.max(0, ready - seconds);
    const activeSeconds = delay + (casts - 1) * cooldown;
    if (Number.isFinite(seconds)) {
      parts.push(castMark());
      parts.push({ duration: delay, dps: 0, burst: overflowHits ? strike(false,true)+strike(false,true) : 0 });
      for (let i = 0; i < casts; i++) parts.push({ duration: i + 1 === casts ? 0 : cooldown, dps: 0, burst: strike(true,true)+strike(false,true) });
    }
    return { parts, activeSeconds, overflowHits };
  };
  const opening = makeCycle(first, true);
  const prefix = opening.parts;
  const firstCount = clock.count;
  const warmup: Segment[] = [];
  while (clock.count < clock.cap && Number.isFinite(recovery)) {
    const previous = clock.count;
    warmup.push(...makeCycle(recovery).parts);
    if (previous === clock.count) break;
  }
  const slow = makeCycle(recovery);
  // 首轮从部署库存和已消耗的再部署冷却开始。之后迅捷回技不能改变首轮实际时长。
  model.duration = opening.activeSeconds;
  const overflowHits = opening.overflowHits;
  const main = stone(true, true, model.duration, casts);
  const follow = stone(false, true, model.duration, casts + overflowHits);
  model.skill = { stats: main.stats, components: [...main.components, ...follow.components], dps: main.dps + follow.dps };
  const period = recovery + slow.activeSeconds;
  const amount = slow.parts.reduce((sum, s) => sum + (s.burst ?? 0) + (s.dps ? s.dps * s.duration : 0), 0);
  model.customTimeline = (duration, hp) => ({ ...integrateWithCasts([...prefix,...warmup], slow.parts, duration, hp),
    cycle: { spRecoverSec: recovery, skillDurationSec: slow.activeSeconds,
      avgDps: Number.isFinite(period) ? amount / period : normal }, notes: [], caveats: [] });
  swiftCycles(model, level, cost, stored, prefix, wait, seconds => makeCycle(seconds).parts, 0, clock, firstCount);
  const inner = model.customTimeline!;
  model.customTimeline = (duration, hp) => ({ ...inner(duration, hp),
    firstSkill: { start: first, end: first + opening.activeSeconds, includesEndHit: true } });
  return model;
};
