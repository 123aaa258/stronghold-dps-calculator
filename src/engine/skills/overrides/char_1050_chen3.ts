import { damage, type CombatTarget } from '../../damage.ts';
import { battleEffects } from '../../effects/common.ts';
import type { StatModifier } from '../../stats.ts';
import { firstCrossing, renewalCurve, swiftRefundSucceeds } from '../../swift.ts';
import { integrate, type Segment } from '../../timeline.ts';
import type { DamageComponent, PhaseResult } from '../../types.ts';
import type { SkillOverride } from './index.ts';
import { actionDamage, dotDps, isBlocked, overrideBase, phase } from './shared.ts';
import { swiftCycles } from './swift.ts';
import { ShredClock } from '../../effects/shred-clock.ts';
import { expectedTimedWave } from './chen3-expectation.ts';

// https://prts.wiki/w/赤刃明霄陈 ：形意洞照对自身造成的物法伤害逐段择弱，伤判增减在择弱之后。
// 寒暑觉知的治疗、闪避不造成伤害。按目标被阻挡的默认场景计算；选中未阻挡状态时触发 AFT-X 攻速。固定攻击已计入阶级面板。
export const chen3Override: SkillOverride = (context, generic) => {
  const { tier, level, skill, boss } = context;
  const model = overrideBase(generic);
  const e = generic.battle ?? battleEffects();
  const clock = new ShredClock(e);
  const reduction = () => e.resReductionFixed + Math.min(e.resShred?.max ?? 0, clock.count * (e.resShred?.perHit ?? 0));
  const bb = level.blackboard.nums;
  const talent = tier.talents.find(t => t.index === 0)!.blackboard.nums;
  const source = `skill:${skill.skillId}`;
  const modifiers: StatModifier[] = [
    { stat: 'atk', bucket: 'pct', value: talent.atk, source: 'talent:chen3:1' },
    { stat: 'attackSpeed', bucket: 'direct', value: talent.attack_speed, source: 'talent:chen3:1' },
  ];
  const moduleSpeed = tier.trait?.blackboard.nums.attack_speed;
  if (moduleSpeed && !isBlocked(boss)) modifiers.push({
    stat: 'attackSpeed', bucket: 'direct', value: moduleSpeed, source: `module:${tier.uniEquipId}`,
  });
  const weakHit = (attack: number, original: 'arts' | 'physical') => {
    const physical = { attack, type: 'physical' as const, defense: boss.attributes?.def,
      reductionFixed: e.defReductionFixed, penetrationFixed: e.defPenetrationFixed, penetrationPct: e.defPenetrationPct };
    const arts = { attack, type: 'arts' as const, resistance: boss.attributes?.magicResistance,
      reductionFixed: reduction(), penetrationFixed: e.resPenetrationFixed, penetrationPct: e.resPenetrationPct };
    const p = damage(physical).perHit, a = damage(arts).perHit;
    const type: 'arts' | 'physical' = Math.abs(p - a) < 1e-9 ? original : p > a ? 'physical' : 'arts';
    const result = damage({ ...(type === 'physical' ? physical : arts), target: boss, modifiers: e.modifiers });
    return { damageType: type, perHit: result.perHit, derivation: [...e.derivation,
      { label: `形意洞照·理论物理伤害（防御 ${physical.defense ?? 0}）`, value: p, op: 'set' as const, source: 'talent:chen3:1' },
      { label: `形意洞照·理论法术伤害（法抗 ${arts.resistance ?? 0}）`, value: a, op: 'set' as const, source: 'talent:chen3:1' },
      { label: `形意洞照选取${type === 'physical' ? '物理' : '法术'}，以下按该类型结算`, value: type === 'physical' ? p : a, op: 'set' as const, source: 'talent:chen3:1' },
      ...result.derivation] };
  };
  const attack = (active: boolean, scale = 1, hits = 1, bonus = 0, fixedInterval?: number) => {
    const result = phase(context, e, { ownerActions: 1, active, damageEvents:clock.count, modifiers: bonus ? [...modifiers,
      { stat: 'atk', bucket: 'pct', value: bonus, source }] : modifiers, scale, hits, fixedInterval });
    const c = result.components[0]!;
    const multiplier = scale * e.attackScale;
    if (!e.weakness) Object.assign(c, weakHit(result.stats.atk * multiplier, 'arts'));
    c.derivation.unshift({ label: '攻击面板', value: result.stats.atk, op: 'set', source: 'operator:attributes' },
      { label: '该段攻击倍率', value: multiplier, op: 'mul', source: c.source });
    c.dps = c.perHit * c.hitsPerSec;
    result.dps = result.components.reduce((sum, c) => sum + c.dps, 0);
    return result;
  };
  model.normal = attack(false);
  model.lifecycle = 'timed';
  model.burst = model.passive = false;
  model.duration = level.duration;
  model.caveats.push('术战者原始伤害为法术；形意洞照逐段选取理论物理、法术伤害的较高者，再结算增减伤。自身治疗与闪避不影响输出。');
  if (e.extraHits.length) model.notes.push('近似：装备和盟约的逐伤害附伤按其原类型结算一次，各附伤能否触发形意洞照的伤害计算事件尚待核实。');
  if (e.timedStats.length) model.notes.push('近似：外部限时属性按部署时快照，未逐段重建失效时刻。');

  if (skill.skillId.endsWith('_1')) {
    // 技能描述明确二连击；沉默不直接扣血，Boss 机制开关仍以用户选择为准。
    model.skill = attack(true, 1, 2, bb.atk);
    if (clock.cap) model.rebuild = (_stats,_time,count) => { clock.reset(count); return {...model,normal:attack(false),skill:attack(true,1,2,bb.atk)}; };
    model.caveats.push('赤霄·奔夜的两击分别过防抗；沉默本身不造成伤害。');
    return model;
  }
  const cost = Math.max(e.spCostMin, level.spCost * e.spCostScale);
  const initial = Math.max(0, level.initSp + e.initSp);
  const rate = Math.max(0, level.increment + e.spRecovery);
  const wait = (sp: number) => sp <= 0 ? 0 : rate > 0 ? sp / rate : Infinity;
  const first = wait(cost - initial);
  const normal = model.normal.dps;
  const opening: Segment = { duration: first, dps: normal };
  const weight = (p: PhaseResult, seconds: number): DamageComponent[] => p.components.map(c => ({
    ...c, hitsPerSec: c.hitsPerSec * seconds / model.duration, dps: c.dps * seconds / model.duration,
  }));

  if (skill.skillId.endsWith('_2')) {
    // 十斩来自技能描述，0.4 秒间隔见 PRTS；6 秒指移动后的强化时间，不含十斩。
    const count = 10, gap = 0.4;
    const slash = attack(true, bb.atk_scale, 1, 0, gap);
    const enhanced = attack(true, 1, 1, bb['chen3_s2[respawn_buff].atk']);
    model.duration = count * gap + level.duration;
    slash.components[0]!.label = '赤霄斩击';
    enhanced.components[0]!.label = '移动后强化攻击';
    const components = [...weight(slash, count * gap), ...weight(enhanced, level.duration)];
    model.skill = { stats: enhanced.stats, components, dps: components.reduce((n, c) => n + c.dps, 0) };
    const recovery = wait(cost);
    const repeat = (seconds: number) => {
      const parts: Segment[] = [];
      clock.append(parts,seconds,()=>attack(false));
      for (let index=0;index<count;index++) {
        const packet=attack(true,bb.atk_scale,1,0,gap);
        parts.push({duration:gap,dps:dotDps(packet),burst:actionDamage(packet)});
        clock.burst(packet.components);
      }
      clock.append(parts,level.duration,()=>attack(true,1,1,bb['chen3_s2[respawn_buff].atk']));
      return parts;
    };
    const prefix = repeat(first), initialCount = clock.count, warmup: Segment[] = [];
    while (clock.count<clock.cap && Number.isFinite(recovery)) warmup.push(...repeat(recovery));
    const steady = repeat(recovery);
    model.customTimeline = (t, hp) => ({ ...integrate([...prefix,...warmup], steady, t, hp),
      cycle: { skillDurationSec: model.duration, spRecoverSec: recovery,
        avgDps: (normal * recovery + model.skill!.dps * model.duration) / (recovery + model.duration) },
      notes: [], caveats: [] });
    swiftCycles(model, level, cost, initial, prefix, wait, repeat, 0, clock, initialCount);
    model.notes.push('近似：十斩从开启时起每0.4秒命中一次，第4秒起计移动后的6秒强化。忽略部署动画，按强化结束后从零回复技力，单 Boss 不触发击倒转移。');
    return model;
  }

  // PRTS：剑气预计算 max(常规当前生命×6%, ATK×下限倍率)，再过防抗；同一直线只判定一次。
  // https://prts.wiki/w/假想敌：胄 ：本体不死。规程总血条与敌人常规血量没有已核实的同步公式。
  const strikes = attack(true, bb['attack@atk_scale'], 3); // 三段来自技能描述，额外地面目标不重复。
  // https://prts.wiki/w/伤害分类 ：标注为预计算的剑气没有 ON_CALCULATE_DAMAGE 事件，无法择弱。
  // 这里只触发一组“造成伤害时”附伤（骨刺刀、天马之耀、奥术）；各附伤不递归触发。
  const waveAt = () => phase(context, { ...e, attackScale: 1 }, { active: true, modifiers, damageEvents:clock.count,
    scale: bb.projectile_min_atk_scale, fixedInterval: level.duration });
  const floorWave = waveAt();
  const waveHit = (attack: number) => damage({ attack, type: 'arts', target: boss, modifiers: e.modifiers,
    reductionFixed: reduction(), penetrationFixed: e.resPenetrationFixed, penetrationPct: e.resPenetrationPct });
  const minAttack = strikes.stats.atk * bb.projectile_min_atk_scale;
  const enabled = (boss as CombatTarget).enabledMechanics ?? [];
  const thresholds: Record<string, string> = {
    low_hp_armor: '1.hp_ratio', advance: 'advance.hp_ratio', directional_armor: 'Armor.hp_ratio', evade: 'Evade.hp_ratio',
  };
  let initialRatio = 1;
  for (const m of enabled) {
    // madness 仅在 enemy_2054_smdeer 游戏图鉴中写明“生命值低于一半”，没有对应数值黑板。
    const threshold = m.id === 'madness' ? 0.5 : boss.abilities
      .map(a => a.blackboard?.nums[thresholds[m.id]]).find(x => x !== undefined);
    // 普通械有半血触发键；隐秘核心同名护甲从开场就存在，不应扣去一半生命。
    if (threshold === undefined) continue;
    const ratio = m.id === 'evade' ? 1 - threshold : threshold;
    initialRatio = Math.min(initialRatio, ratio);
    model.notes.push(`近似：开启「${m.name}」，剑气从该阶段起始本体生命上界（最大生命的${ratio * 100}%）估算。`);
  }
  const bodyHp = (boss.attributes?.maxHp ?? 0) * initialRatio;
  const hpRatio = bb.hp_ratio;
  const rawWave = (remaining: number) => Math.max(minAttack, hpRatio * Math.max(1, remaining));
  const firstRaw = rawWave(bodyHp - first * normal);
  const firstWave = waveHit(firstRaw);
  const wave = floorWave.components[0]!;
  const minimumMain = wave.perHit;
  const extraPerWave = floorWave.components.slice(1).reduce((n, c) => n + c.perHit * c.hitsPerAttack, 0);
  const minimum = minimumMain + extraPerWave;
  Object.assign(wave, { label: '开技剑气（首轮）', perHit: firstWave.perHit, dps: firstWave.perHit / level.duration,
    derivation: [...e.derivation, ...firstWave.derivation] });
  wave.derivation.unshift({ label: '开技时推算本体生命', value: Math.max(1, bodyHp - first * normal), op: 'info', source },
    { label: '当前生命取值比例', value: hpRatio, op: 'mul', source },
    { label: '剑气攻击倍率下限', value: minAttack, op: 'info', source });
  const components = [...strikes.components, ...floorWave.components];
  model.skill = { stats: strikes.stats, components, dps: components.reduce((n, c) => n + c.dps, 0) };
  model.notes.push('近似：按单 Boss 正面直线命中一次，地图转向再命中不计。按 PRTS，剑气属于预计算法术伤害，读取本体当前生命；以阶段起始本体生命减累计伤害、最低1推算，协议血条与本体同步细节未核实。技能面板含首轮剑气，循环为本体降至攻击倍率下限后的稳态。');

  const p = e.skillEndProbability && e.skillEndSp ? e.skillEndProbability : 0;
  const slow = wait(cost), fast = wait(Math.max(0, cost - e.skillEndSp));
  if (context.staticSwift && p > 0 && p < 1 && !clock.cap) {
    // 固定法抗下，预计算法伤与原始攻击成正比。额外剑气只在该路径的生命倍率高于下限时存在。
    model.expectedSwiftDamage = expectedTimedWave({ first, duration:level.duration, normal, active:strikes.dps,
      probability:p, slow, fast, floor:minimum, firstExtra:firstWave.perHit - minimumMain,
      hpScale:minAttack > 0 ? hpRatio * minimumMain / minAttack : 0 });
  }
  if (clock.cap) {
    const strike = () => attack(true,bb['attack@atk_scale'],3);
    const total = (parts: Segment[]) => parts.reduce((sum,s)=>sum+(s.burst??0)+(s.dps?s.duration*s.dps:0),0);
    clock.reset(clock.cap);
    const idle = attack(false).dps, steadyStrike = strike().dps, steadyWave = waveAt().dps*level.duration;
    const steadySkill = {duration:level.duration,dps:steadyStrike,burst:steadyWave};
    const cycleParts = (seconds:number) => [{duration:seconds,dps:idle},steadySkill];
    const curve = renewalCurve({prefix:cycleParts(first),stock:0,cost,maxCharges:1,reward:e.skillEndSp,probability:p,wait,
      segments:cycleParts,skillDuration:level.duration});
    const corrections: {time:number;weight:number;parts:Segment[]}[] = [];
    const downtime = (time:number,seconds:number,weight:number) => {
      const parts: Segment[] = [];
      clock.append(parts,seconds,()=>attack(false));
      corrections.push({time,weight,parts:parts.map(part=>({...part,dps:part.dps-idle}))});
      return total(parts);
    };
    clock.reset(0);
    const remaining = bodyHp-downtime(0,first,1);
    type State = {time:number;count:number;mass:number;hpSum:number;cast:number};
    let states:State[] = [{time:first,count:clock.count,mass:1,hpSum:remaining,cast:0}];
    while (states.length) {
      const next = new Map<string,State>();
      for (const state of states) {
        const hp = state.hpSum/state.mass;
        if (!Number.isFinite(state.time) || state.count>=clock.cap && rawWave(hp)<=minAttack) continue;
        clock.reset(state.count);
        const packet = waveAt(), hit = waveHit(rawWave(hp)).perHit+packet.dps*level.duration-packet.components[0]!.perHit;
        clock.burst(packet.components);
        const parts:Segment[]=[];
        clock.append(parts,level.duration,strike);
        corrections.push({time:state.time,weight:state.mass,parts:[{duration:0,dps:0,burst:hit-steadyWave},...parts.map(part=>({...part,dps:part.dps-steadyStrike}))]});
        const count = clock.count, post = hp-hit-total(parts), end=state.time+level.duration;
        if (count===state.count && post>=hp) continue;
        // 迅捷：第 cast 次技能结束按固定判定序列判定一次。
        const ok = swiftRefundSucceeds(state.cast, p, end);
        for (const [probability,seconds] of [[ok ? 0 : 1,slow],[ok ? 1 : 0,fast]] as const) {
          const mass=probability*state.mass;
          if (!mass) continue;
          clock.reset(count);
          const remaining=post-downtime(end,seconds,mass), time=end+seconds;
          const key=`${time.toFixed(8)}:${clock.count.toFixed(8)}`;
          const group=next.get(key)??{time,count:clock.count,mass:0,hpSum:0,cast:state.cast+1};
          group.mass+=mass; group.hpSum+=mass*remaining; next.set(key,group);
        }
      }
      states=[...next.values()];
    }
    model.customTimeline=(seconds,hp)=>{
      const at=(time:number)=>corrections.reduce((sum,c)=>sum+(time<c.time?0:c.weight*integrate(c.parts,[],time-c.time,Infinity).totalDamage),curve.at(time));
      const totalDamage=at(seconds),killTimeSec=firstCrossing(at,hp,hp/curve.cycle.avgDps);
      curve.finishNotes();
      return {totalDamage,killTimeSec,cycle:curve.cycle,notes:[...curve.notes,'近似：剑气按时间过程推算的本体剩余生命结算。'],caveats:[]};
    };
    return model;
  }

  const active = { duration: level.duration, dps: strikes.dps, burst: minimum };
  const baseline = renewalCurve({ prefix: [opening, active], stock: 0, cost, maxCharges: 1,
    reward: e.skillEndSp, probability: p, wait, skillDuration: level.duration,
    segments: seconds => [{ duration: seconds, dps: normal }, active] });
  // 在按下限结算的稳态时间轴上，仅补前期剑气的差额。同轮施放时间只由迅捷成功次数决定。
  const extras: { time: number; amount: number }[] = [];
  let states = new Map([[0, { mass: 1, hpSum: bodyHp - first * normal }]]);
  for (let cast = 0; states.size; cast++) {
    const next = new Map<number, { mass: number; hpSum: number }>();
    for (const [wins, { mass, hpSum }] of states) {
      const remaining = hpSum / mass;
      if (rawWave(remaining) <= minAttack) continue;
      const hit = waveHit(rawWave(remaining)).perHit;
      const time = first + cast * level.duration + (cast - wins) * slow + wins * fast;
      extras.push({ time, amount: mass * (hit - minimumMain) });
      const postSkill = remaining - hit - extraPerWave - level.duration * strikes.dps;
      if (postSkill >= remaining) continue; // 这一分支完全免伤，后续剑气同样不会增加伤害。
      // 迅捷：第 cast 次技能结束按固定判定序列判定一次。
      const ok = swiftRefundSucceeds(cast, p, time + level.duration);
      for (const [win, probability, seconds] of [[0, ok ? 0 : 1, slow], [1, ok ? 1 : 0, fast]] as const) {
        const branchMass = mass * probability;
        if (!branchMass) continue;
        const hp = postSkill - normal * seconds;
        const key = wins + win;
        const group = next.get(key) ?? { mass: 0, hpSum: 0 };
        group.mass += branchMass;
        group.hpSum += branchMass * hp;
        next.set(key, group);
      }
    }
    states = next;
  }
  model.customTimeline = (t, hp) => {
    const at = (seconds: number) => extras.reduce((n, x) => n + (x.time <= seconds ? x.amount : 0), baseline.at(seconds));
    const totalDamage = at(t);
    const killTimeSec = firstCrossing(at, hp, baseline.cycle.avgDps > 0 ? hp / baseline.cycle.avgDps : t);
    baseline.finishNotes();
    return { totalDamage, killTimeSec, cycle: baseline.cycle, notes: p ? baseline.notes : [], caveats: [] };
  };
  return model;
};
