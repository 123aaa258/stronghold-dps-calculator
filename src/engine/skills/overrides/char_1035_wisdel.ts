import tokenData from '../../../data/generated/tokens.json' with { type: 'json' };
import skillData from '../../../data/generated/skills.json' with { type: 'json' };
import { battleEffects } from '../../effects/common.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { resolveTokenTier } from '../../operator-state.ts';
import { firstCrossing, renewalCurve, swiftRefundSucceeds } from '../../swift.ts';
import { integrate, type Segment } from '../../timeline.ts';
import type { DamageComponent, PhaseResult, SkillData, TokenData } from '../../types.ts';
import type { SkillOverride } from './index.ts';
import { actionDamage, dotDps, overrideBase, phase } from './shared.ts';

// PRTS：https://prts.wiki/w/维什戴尔 、https://prts.wiki/w/魂灵之影
// 魂灵一次命中后等概率回复 [sp_min, sp_max) 整数技力。以第一次发射为 t=0，
// u[t] 是该时刻再次开火的概率。补给独立，故 u[t]=Σu[t-间隔]/结果数。
function shadowShots(cost: number, minSp: number, maxSp: number) {
  const shortest = cost - maxSp + 1, longest = cost - minSp;
  const frequency = 2 / (shortest + longest);
  const probability = [1], count = [1];
  let settled = 0;
  // 连续 longest 个概率收敛后，后续都是这些数的凸组合。
  while (settled < longest) {
    const t = count.length;
    let p = 0;
    for (let gap = shortest; gap <= longest; gap++) p += probability[t - gap] ?? 0;
    p /= longest - shortest + 1;
    probability.push(p);
    count.push(count[t - 1]! + p);
    settled = Math.abs(p - frequency) < 1e-13 ? settled + 1 : 0;
  }
  const afterFirst = (age: number) => {
    const tick = Math.floor(age + 1e-9);
    if (tick < 0) return 0;
    const last = count.length - 1;
    return tick <= last ? count[tick]! : count[last]! + (tick - last) * frequency;
  };
  return { frequency, afterFirst };
}

function weighted(c: DamageComponent, weight: number): DamageComponent {
  return { ...c, hitsPerAttack: c.hitsPerAttack * weight, hitsPerSec: c.hitsPerSec * weight, dps: c.dps * weight };
}

export const wisdelOverride: SkillOverride = (context, generic) => {
  const { operator, tier, skill, level } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const shred = new ShredClock(e);
  const bb = level.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1'), s2 = skill.skillId.endsWith('_2'), s3 = skill.skillId.endsWith('_3');
  const talent = tier.talents[0]!.blackboard.nums;
  const trait = tier.trait!.blackboard.nums;
  const source = 'skill:' + skill.skillId;

  // 单个被阻挡的地面Boss：本体每枚弹分别附残影；每次余震独立判定，残影不可叠加。
  // 同枚弹的余震之间不补贴第二个残影。主目标倍率只乘主击/余震，独立爆炸只取面板。
  const body = (active: boolean, overload = false): PhaseResult => {
    const rounds = overload ? 4 : 1; // S2描述给出4连发，每发都只剩Boss可选。
    const quakeCount = 1 + trait['attack@enable_third_attack']! + (active && s1 ? 2 : 0);
    const quakeScale = active && s1 ? bb.append_atk_scale! : trait['attack@append_atk_scale']!;
    const attackScale = talent['attack@main_atk_scale']! * (overload ? bb['attack@atk_scale_ol']! : active && s3 ? bb['attack@atk_scale_3']! : 1);
    const prob = active && s3 ? bb['attack@prob']! : talent['attack@prob']!;
    // ArkDPS「饱和复仇」单目标、X模：连发中残影刷新与余震交错，每发平均0.2582484375次爆炸。
    // 无模组只有一次余震，按每发独立判定。https://ark-dps.com/
    const detonation = overload && quakeCount === 2 ? .2582484375 : 1 - (1 - prob) ** quakeCount;
    const packet = (label: string, origin: string, scale: number, hits: number, ownerActions = 0) => {
      const p = phase(context, e, { ownerActions, type: 'physical', active, scale, hits, damageEvents:shred.count,
        interval: tier.attributes.baseAttackTime + (active ? bb.base_attack_time ?? 0 : 0),
        modifiers: active && bb.atk ? [{ stat: 'atk', bucket: 'pct', value: bb.atk, source }] : [] });
      p.components[0]!.label = label;
      p.components[0]!.source = origin;
      p.components[0]!.derivation.unshift({ label: '本分项攻击倍率', value: scale, source: origin, op: 'info' });
      return p;
    };
    const main = packet(overload ? '过载主击' : '主目标直击', active ? source : 'attack', attackScale, rounds, 1);
    const quake = packet(overload ? '过载余震' : '地面余震', active && s1 ? source : 'trait:bombarder', attackScale * quakeScale, rounds * quakeCount);
    const bomb = packet('好礼·残影爆炸', 'talent:wisdel:1', talent['attack@bomb_atk_scale']!, rounds * detonation);
    bomb.components[0]!.derivation.unshift({ label: '每枚弹期望引爆次数', value: detonation, source: 'talent:wisdel:1', op: 'info' });
    return { stats: main.stats, components: [...main.components, ...quake.components, ...bomb.components], dps: main.dps + quake.dps + bomb.dps };
  };
  const normal = body(false), active = body(true);
  const overloaded = s2 ? body(true, true) : active;
  const token = (tokenData as unknown as Record<string, TokenData>)[tier.talents[1]!.tokenKey!]!;
  const tokenTier = resolveTokenTier(token, operator, tier)!;
  const shadowId = token.skillIds[0]!;
  const shadow = (skillData as unknown as Record<string, SkillData>)[shadowId]!.levels[tokenTier.skillLevel]!;
  const shots = shadowShots(shadow.spCost, shadow.blackboard.nums.sp_min!, shadow.blackboard.nums.sp_max!);
  const tokenEffects = { ...battleEffects(), resReductionFixed: e.resReductionFixed, resShred:e.resShred,
    stats: e.stats.filter(m => m.source === 'bond:lethaniaShip'),
    modifiers: e.modifiers.filter(m => m.kind === 'fragile' || m.source === 'bond:emptyShip') };
  const summonAt = () => phase({ ...context, tier: { ...tier, attributes: tokenTier.attributes } }, tokenEffects,
    { fixedInterval: 1 / shots.frequency, damageEvents:shred.count });
  const summon = summonAt();
  const shadowHit = summon.components[0]!;
  shadowHit.label = '魂灵之影·法术攻击';
  shadowHit.source = 'token:' + token.tokenId;
  // https://prts.wiki/w/卫戍协议#干员 仅明确棋子自身属性。独立面板的召唤物沿用自己的曲线。
  if ((context.cultivation ?? 1) > 1) model.notes.push('近似：魂灵使用独立攻击面板，自身练度映射只作用于维什戴尔；本季魂灵是否也获得练度加成尚缺实测。参照 https://prts.wiki/w/卫戍协议#干员');

  // ArkDPS 爆裂黎明测算：107攻速，间隔140帧，六发共753帧。
  // https://ark-dps.com/ 。这里只有标准场景的技能耗时可对照，按其比例估计首发，后五发逐枚结算。
  const interval = active.stats.attackInterval;
  const clock = s3 ? 30 : 1;
  const shotFrames = Math.max(1, Math.round(interval * 30));
  const firstShotFrames = Math.max(1, Math.round(shotFrames * 53 / 140));
  const ammo = bb['attack@trigger_time'] ?? 1;
  model.duration = s3 ? (firstShotFrames + (ammo - 1) * shotFrames) / clock : s2 ? level.duration : interval;
  model.lifecycle = s3 ? 'ammo' : s2 ? 'timed' : 'instant';
  model.passive = false;
  model.burst = false;
  const activeComponents = s2 ? [...active.components, ...overloaded.components].map(c => weighted(c, .5))
    : active.components.map(c => ({ ...weighted(c, s3 ? interval * ammo / model.duration : 1), hitsPerAttack: c.hitsPerAttack }));
  const shadowsAtCap = s3 ? 3 : 1; // S3描述：最多存在三只，技能结束后保留。
  model.normal = { ...normal, components: [...normal.components, shadowHit], dps: normal.dps + summon.dps };
  model.skill = { stats: active.stats, components: [...activeComponents, weighted(shadowHit, shadowsAtCap)],
    dps: activeComponents.reduce((sum, c) => sum + c.dps, 0) + summon.dps * shadowsAtCap };

  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const wait = (need: number) => {
    if (need <= 0) return 0;
    if (s1) return Math.ceil(need - 1e-10) * normal.stats.attackInterval;
    if (!rate) return Infinity;
    return s3 ? Math.ceil(need / rate * clock - 1e-10) / clock : need / rate;
  };
  const first = wait(cost - Math.max(0, level.initSp + e.initSp));
  const recovery = wait(cost);
  let cast: Segment[];
  if (s3) {
    // 弹药时间轴用整数帧，避免浮点相减使恰在技能结束的末发漏出迅捷前缀。
    cast = [{ duration: firstShotFrames, dps: 0 }];
    // 每发只结算本次射击的伤害分项；伊比利亚持续伤害沿独立每秒时钟连续计入。
    for (let i = 0; i < ammo; i++) cast.push({ duration: i + 1 === ammo ? 0 : shotFrames, dps: dotDps(active) / clock, burst: actionDamage(active) });
    cast[0]!.dps = dotDps(active) / clock;
  } else if (s2) {
    cast = [{ duration: level.duration / 2, dps: active.dps }, { duration: level.duration / 2, dps: overloaded.dps }];
  } else {
    cast = [{ duration: interval, dps: active.dps }];
  }
  cast[0]!.cast = true;
  const segments = (charge: number): Segment[] => [{ duration: s3 ? Math.round(charge * clock) : charge, dps: normal.dps / clock }, ...cast];
  const prefix = segments(first), repeat = segments(recovery);
  const prob = e.skillEndSp ? e.skillEndProbability : 0;
  const curve = prob > 0 ? renewalCurve({ prefix, stock: 0, cost, maxCharges: 1, discreteSp: s1, toBattleTime: cursor => cursor / clock,
    reward: e.skillEndSp, probability: prob, wait, segments, skillDuration: model.duration }) : null;
  const ownerAt = (t: number) => {
    const tick = t * clock;
    return curve ? curve.at(tick) : integrate(prefix, repeat, tick, Infinity).totalDamage;
  };
  const firstEnd = first + model.duration;
  // PRTS魂灵之影：天赋0SP；每次S3新召的第一只3SP、第二只0SP。未阵亡时总共仅部署三只。
  const spawns = [{ at: 0, initial: shadow.initSp, weight: 1 }];
  if (s3) {
    spawns.push({ at: first, initial: bb.sp!, weight: 1 });
    if (bb.max_cnt! >= 2) spawns.push({ at: first, initial: shadow.initSp, weight: 1 });
    else {
      // 第二次开技的时刻由第0次迅捷判定（固定判定序列）决定。
      spawns.push({ at: firstEnd + (swiftRefundSucceeds(0, prob, firstEnd) ? wait(cost - e.skillEndSp) : recovery), initial: bb.sp!, weight: 1 });
    }
  }
  const at = (t: number) => ownerAt(t) + shadowHit.perHit * spawns.reduce((n, s) =>
    n + s.weight * shots.afterFirst(t - s.at - (shadow.spCost - s.initial)), 0);
  const skillBodyDps = model.skill.dps - summon.dps * shadowsAtCap;
  const cycle = { spRecoverSec: curve?.cycle.spRecoverSec ?? recovery, skillDurationSec: model.duration,
    avgDps: (curve ? curve.cycle.avgDps * clock : Number.isFinite(recovery) ? (normal.dps * recovery + skillBodyDps * model.duration) / (recovery + model.duration) : normal.dps)
      + (Number.isFinite(first) ? shadowsAtCap : 1) * summon.dps };
  const curveCasts = curve?.castsUntil;
  model.customTimeline = (t, hp) => {
    const totalDamage = at(t);
    const killTimeSec = firstCrossing(at, hp, hp / cycle.avgDps);
    curve?.finishNotes();
    return { totalDamage, killTimeSec, cycle, at, firstCast: first,
      castsUntil: curveCasts && ((until: number) => curveCasts(until * clock).map(tick => tick / clock)),
      firstSkill: { start: first, end: s1 ? first : firstEnd, includesEndHit: s3 }, notes: curve?.notes ?? [], caveats: [] };
  };
  if (shred.cap) {
    const steady = wisdelOverride(context,{...generic,battle:{...e,resReductionFixed:e.resReductionFixed+e.resShred!.max,resShred:undefined}});
    shred.reset(shred.cap);
    const full = [body(false),body(true),body(true,true)], fullShadow = summonAt().components[0]!.perHit;
    const corrections:{at:number; duration:number; dps:number; burst:number}[]=[];
    const branch=(start:number,count:number,ready:number[],charge:number,mass:number,depth=0)=>{
      shred.reset(count);
      let time=start;
      const add=(duration:number,dps:number,burst=0)=>{ if (dps||burst) corrections.push({at:time,duration,dps:dps*mass,burst:burst*mass}); };
      const stage=(duration:number,kind:number)=>{
        const end=time+duration;
        while (time<end-1e-9 && shred.count<shred.cap) {
          const packet=kind<0?undefined:body(kind!==0,kind===2), tick=shred.step(packet?.components??[]);
          const next=ready.map(at=>time<at-1e-9?at:at+Math.floor(time-at+1e-9)+1);
          const stop=Math.min(end,time+tick.seconds,...next);
          if (!Number.isFinite(stop)) break;
          add(stop-time,packet?packet.dps-full[kind]!.dps:0);
          tick.advance(stop-time);time=stop;
          for (let index=0;index<next.length;index++) if (next[index]!<=time+1e-9) {
            const age=time-ready[index]!, hits=shots.afterFirst(age)-shots.afterFirst(age-1);
            add(0,0,hits*(summonAt().components[0]!.perHit-fullShadow));
            shred.count=Math.min(shred.cap,shred.count+hits);
          }
        }
        time=end;
      };
      stage(charge,0);
      if (shred.count>=shred.cap || !Number.isFinite(time)) return;
      if (s3) {
        if (ready.length<3) ready.push(time+shadow.spCost-bb.sp!);
        if (ready.length<3 && bb.max_cnt!>=2) ready.push(time+shadow.spCost-shadow.initSp);
        stage(firstShotFrames/clock,-1);
        for (let index=0;index<ammo && shred.count<shred.cap;index++) {
          const packet=body(true);
          add(0,0,(packet.dps-full[1]!.dps)*interval);shred.burst(packet.components);
          if (index+1<ammo) stage(interval,-1);
        }
      } else if (s2) {stage(level.duration/2,1);stage(level.duration/2,2);} else stage(interval,1);
      const nextCount=shred.count;
      if (nextCount>=shred.cap || nextCount<=count && time<=start) return;
      // 迅捷：第 depth 次技能结束按固定判定序列判定一次。
      branch(time,nextCount,[...ready],swiftRefundSucceeds(depth,prob,time) ? wait(cost-e.skillEndSp) : recovery,mass,depth+1);
    };
    branch(0,0,[shadow.spCost-shadow.initSp],first,1);
    model.customTimeline=(time,hp)=>{
      const stable=steady.customTimeline!(time,Infinity);
      const delta=(seconds:number)=>corrections.reduce((sum,c)=>seconds<c.at?sum:sum+c.burst+c.dps*Math.min(c.duration,seconds-c.at),0);
      const damageAt=(seconds:number)=>steady.customTimeline!(seconds,Infinity).totalDamage+delta(seconds);
      return {...stable,at:damageAt,totalDamage:stable.totalDamage+delta(time),killTimeSec:firstCrossing(damageAt,hp,hp/(stable.cycle?.avgDps||1))};
    };
    model.notes.push('近似：沿迅捷判定后的实际时间轴逐秒累加各魂灵开火期望与本体攻击次数；没有枚举魂灵随机回技与非线性法抗的联合分布。');
  }
  model.notes.push('近似：魂灵有可部署格且持续存活，忽略施法动作锁定；按0、1、2技力等概率递推每秒开火期望。单个残影爆炸后消耗，未计同枚弹余震间由魂灵重新附着。');
  if (s3) model.notes.push('近似：六发弹药逐发结算。使用ArkDPS六发753帧、间隔140帧的测算估计首发延迟，主击、余震和爆炸合并在同一落点。首轮技能统计包含末发，魂灵从本场各自实际出现时刻计数。');
  if (s2) model.notes.push('近似：过载四连发的引爆判定按无模组单次余震及ArkDPS的X模单目标期望计算，未逐帧还原残影刷新时序。');
  if (s2) model.caveats.push('S2按25秒全程施放；前半只攻击唯一目标一次，后半四发分别锁定同一Boss。面板为两半的时间加权平均，前半与过载分开积分。');
  if (e.modifiers.some(m => m.source === 'bond:emptyShip')) model.notes.push('近似：协防按成员归属伤害对魂灵法伤一并增幅，魂灵不继承本体面板或装备。');
  if (e.timedStats.length) model.notes.push('近似：限时外部属性按部署面板取值，未逐帧模拟到期。');
  model.caveats.push('非技能期面板含部署时一只魂灵；迷彩、停顿、晕眩、溅射扩圈在单个静止且被阻挡的地面目标上不增加伤害。');
  return model;
};
