import { judgmentSource } from '../../effects/judgment.ts';
import { kazimierzSource } from '../../effects/skill-bonds.ts';
import { firstCrossing, renewalCurve, swiftRefundSucceeds } from '../../swift.ts';
import type { SkillOverride } from './index.ts';
import type { StatModifier } from '../../stats.ts';
import { battleEffects } from '../../effects/common.ts';
import { integrateWithCasts, type Segment } from '../../timeline.ts';
import { arcaneOnly, overrideBase, phase } from './shared.ts';

// https://prts.wiki/w/荒芜拉普兰德 ：单元逐击+15%，20秒上限乘1.1，60秒增1单元。
// S3锁定后仍正常攻击，另有不叠加光环；散开时间来自attack@times，追踪距离未提供。
export const whitw2Override: SkillOverride = (context, generic) => {
  const { tier, level, skill } = context;
  const e = generic.battle ?? battleEffects();
  const model = overrideBase(generic);
  const bb = level.blackboard.nums, trait = tier.trait!.blackboard.nums;
  const talent = tier.talents[0]!.blackboard.nums, team = tier.talents[1]!.blackboard.nums;
  const s1 = skill.skillId.endsWith('_1'), s3 = skill.skillId.endsWith('_3');
  const source = `skill:${skill.skillId}`;
  const initial = trait.init_atk_scale!, delta = trait.delta_atk_scale!;
  const cap = (time: number) => trait.max_atk_scale! * (time >= talent.interval! ? talent.scale! : 1);
  // S1被动+1仅写于游戏技能描述，blackboard的attack@cnt=0只表示主动阶段不再追加。
  const baseCount = (time: number) => 1 + (s1 ? 1 : 0) + (time >= talent.interval! * 3 ? 1 : 0);
  let damageEvents = 0;
  const pendingShred = () => !!e.resShred && damageEvents * e.resShred.perHit < e.resShred.max;
  const make = (active: boolean, elapsed: number, activated: boolean, scales: number[], aura: boolean) => {
    const modifiers: StatModifier[] = [];
    if (active) modifiers.push({ stat: 'atk', bucket: 'pct', value: bb.atk!, source });
    if (activated) modifiers.push({ stat: 'attackSpeed', bucket: 'direct', value: team.attack_speed!, source: 'talent:whitw2:2' });
    const body = phase(context, e, { ownerActions: 1, active, elapsed, modifiers, damageEvents });
    // 浮游单元不是本体普攻，不重复触发本体的逐击装备；仍继承面板及外部伤害乘区。
    for (const scale of scales) {
      const [hit, ...extras] = phase(context, arcaneOnly(e), { active, elapsed, modifiers, scale, damageEvents }).components;
      body.components.push({ ...hit!, label: '浮游单元', source: 'trait:whitw2:funnel' }, ...extras);
    }
    if (aura) {
      const [hit, ...extras] = phase(context, { ...arcaneOnly(e), attackScale: 1 }, { active, elapsed, modifiers, damageEvents, fixedInterval: 1, scale: bb['attack@magic_atk_scale'] }).components;
      body.components.push({ ...hit!, label: '浮游周围法术伤害（不叠加）', source }, ...extras);
    }
    body.dps = body.components.reduce((n,c)=>n+c.dps,0);
    return body;
  };
  model.normal = make(false, 0, false, Array(baseCount(0)).fill(initial), false);
  const stableCount = baseCount(Infinity) + (s1 ? 0 : bb['attack@cnt']!);
  model.skill = make(true, Infinity, true, Array(stableCount).fill(cap(Infinity)), s3);
  model.duration = s1 ? Infinity : level.duration;
  model.lifecycle = s1 ? 'permanent' : 'timed';
  model.burst = false;
  model.passive = false;
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? sp / rate : Infinity;
  const first = wait(cost - Math.max(0, level.initSp + e.initSp + team.sp!));
  const recovery = wait(cost);
  let elapsed = 0, activated = false;
  let permanent = Array<number>(baseCount(0)).fill(initial);
  const append = (segments: Segment[], duration: number, active: boolean) => {
    if (active) segments.push({ duration: 0, dps: 0, cast: true });
    const end = elapsed + duration;
    const start = elapsed;
    const extra = active && !s1 ? Array<number>(bb['attack@cnt']!).fill(initial) : [];
    let progress = 0;
    let bodyProgress = 0;
    let auraProgress = 0;
    while (elapsed < end) {
      while (permanent.length < baseCount(elapsed)) permanent.push(initial);
      const travelling = active && s3 && elapsed < start + bb['attack@times']! - 1e-9;
      const scales = travelling ? [] : [...permanent, ...extra];
      const p = make(active, elapsed, activated, scales, active && s3 && !travelling);
      const pendingRamp = !travelling && scales.some(s => s < cap(elapsed) - 1e-9);
      const boundaries = [end, ...e.timedStats.map(t=>t.until), talent.interval!, talent.interval! * 3];
      if (travelling) boundaries.push(start + bb['attack@times']!);
      const proc = p.components.find(c => c.source === judgmentSource);
      if (proc) boundaries.push(e.judgment!.until);
      if (proc || pendingShred()) boundaries.push(elapsed + (1 - bodyProgress) * p.stats.attackInterval);
      const auraHits = active && s3 && !travelling ? 1 + arcaneOnly(e).extraHits.length : 0;
      if (pendingShred() && auraHits) boundaries.push(elapsed + 1 - auraProgress);
      if (pendingRamp) boundaries.push(elapsed + (1 - progress) * p.stats.attackInterval);
      const next = Math.min(...boundaries.filter(t=>t>elapsed+1e-9));
      segments.push({ duration: next - elapsed, dps: p.dps - (proc?.dps ?? 0) });
      if (pendingShred() && auraHits) {
        auraProgress += next - elapsed;
        if (auraProgress >= 1 - 1e-9) { damageEvents += auraHits; auraProgress = 0; }
      }
      if (proc || pendingShred()) {
        bodyProgress += (next - elapsed) / p.stats.attackInterval;
        if (bodyProgress >= 1 - 1e-9) {
          if (proc) segments.push({ duration: 0, dps: 0, burst: proc.perHit });
          damageEvents += p.components.filter(hit => hit.countsTowardDps && hit.source !== judgmentSource && hit.source !== kazimierzSource).reduce((sum, hit) => sum + hit.hitsPerAttack, 0) - auraHits;
          bodyProgress = 0;
        }
      }
      if (!Number.isFinite(next)) { elapsed = next; break; }
      if (!travelling) progress += (next - elapsed) / p.stats.attackInterval;
      elapsed = next;
      if (progress >= 1 - 1e-9) {
        // 上限改变发生在此击之后；连续伤害在一个完整攻击间隔结束后增加一级。
        const limit = cap(elapsed - 1e-9);
        permanent = permanent.map(s=>Math.min(limit, s + delta));
        for (let i=0;i<extra.length;i++) extra[i] = Math.min(limit, extra[i]! + delta);
        progress %= 1;
        if (progress > 1-1e-9) progress = 0;
      }
    }
  };
  model.caveats.push(`非技能期与技能期 DPS 分别取第一次开技能前一刻与开技能时的浮游倍率；时间过程逐单元爬升，${talent.interval! * 3}秒后天赋完全生效。S1切换后保持开启。单Boss击杀前不增加叙拉古盟约层数。`);
  model.notes.push('近似：各阶段浮游攻击同步并在完整攻击间隔后加倍率；保留原单元层数，技能新增单元从初始倍率爬升，阶段切换重置攻击进度。恐惧及减速不改变静止Boss场景。');
  if (s3) model.notes.push('近似：S3按黑板散开时间后即锁定Boss，未计未知距离的追踪时间；散开期间不计浮游和光环伤害，光环只算一份且不受攻速或浮游爬升倍率影响');
  const prefix: Segment[] = [], repeat: Segment[] = [];
  append(prefix, first, false);
  if (Number.isFinite(elapsed)) {
    // 面板快照与时间过程同一时刻：非技能期取第一次开技能前一刻，技能期取第一次开技能时（S3 取散开结束锁定时）。
    const atCast = [...permanent];
    model.normal = make(false, Math.max(0, elapsed - 1e-9), false, atCast, false);
    const added = s1 ? [] : Array<number>(bb['attack@cnt']!).fill(initial);
    model.skill = make(true, elapsed + (s3 ? bb['attack@times']! : 0), true, [...atCast, ...added], s3);
  }
  if (Number.isFinite(elapsed)) {
    activated = true;
    append(prefix, model.duration, true);
    const stable = Math.max(talent.interval! * 3, e.judgment?.until ?? 0, ...e.timedStats.map(t=>t.until));
    if (!s1 && e.skillEndProbability > 0 && e.skillEndSp && Number.isFinite(first)) {
      // 永久单元跨轮保留倍率：先逐路径展开至天赋与单元全满，再共享只看成功/失败的稳态循环。
      const quick = wait(cost - e.skillEndSp);
      const p = e.skillEndProbability;
      const paths: { weight: number; curve: ReturnType<typeof renewalCurve> }[] = [];
      const branchSegments = (seconds: number) => {
        const plan: Segment[] = [];
        append(plan, seconds, false);
        append(plan, model.duration, true);
        return plan;
      };
      const walk = (head: Segment[], weight: number, depth = 0) => {
        const start = elapsed, saved = [...permanent], savedEvents = damageEvents;
        if (!pendingShred() && start >= talent.interval! * 3 && saved.length === baseCount(Infinity) && saved.every(x => x >= cap(start) - 1e-9)) {
          paths.push({ weight, curve: renewalCurve({ prefix: head, stock: 0, cost, maxCharges: 1, reward: e.skillEndSp,
            probability: p, wait, stableAfter: stable > start ? stable : 0, drawOffset: depth, segments: (seconds, time) => {
              elapsed = Number.isFinite(time) ? time : Math.max(start, stable); permanent = [...saved];
              return branchSegments(seconds);
            }, skillDuration: model.duration }) });
          return;
        }
        // 迅捷：第 depth 次技能结束按固定判定序列判定一次，只走实际抽中的一支。
        const seconds = swiftRefundSucceeds(depth, p, start) ? quick : recovery;
        elapsed = start; permanent = [...saved]; damageEvents = savedEvents;
        walk([...head, ...branchSegments(seconds)], weight, depth + 1);
      };
      walk(prefix, 1);
      model.customTimeline = (duration,hp) => {
        const at = (t: number) => paths.reduce((n,path) => n + path.weight * path.curve.at(t), 0);
        const { cycle } = paths[0]!.curve;
        const totalDamage = at(duration), killTimeSec = firstCrossing(at,hp,hp/cycle.avgDps);
        const notes = new Set<string>();
        for (const { curve } of paths) { curve.finishNotes(); curve.notes.forEach(n => notes.add(n)); }
        return { totalDamage, killTimeSec, cycle, notes: [...notes], caveats: [], at,
          firstSkill:{ start:first, end:first + model.duration }, castsUntil:(t:number) => paths[0]!.curve.castsUntil?.(t) ?? [] };
      };
      return model;
    }
    while (!s1 && (elapsed < stable || pendingShred()) && Number.isFinite(elapsed)) { append(prefix, recovery, false); if (Number.isFinite(elapsed)) append(prefix, model.duration, true); }
    if (!s1 && Number.isFinite(elapsed)) { append(repeat, recovery, false); if (Number.isFinite(elapsed)) append(repeat, model.duration, true); }
  }
  const cycle = s1 ? null : { spRecoverSec: recovery, skillDurationSec: model.duration,
    avgDps: Number.isFinite(recovery) ? repeat.reduce((n,s)=>n+s.duration*s.dps,0)/(recovery+model.duration) : make(false, Infinity, activated, permanent, false).dps };
  model.customTimeline = (duration, hp) => ({ ...integrateWithCasts(prefix, repeat, duration, hp), firstSkill:{ start:first, end:first + model.duration }, cycle, notes: [], caveats: [] });
  return model;
};
