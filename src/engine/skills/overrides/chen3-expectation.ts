/** 每次施放各有两个回复时长。用独立概率累计各个实际开技时点的剑气与持续伤害。 */
export interface TimedWavePlan {
  first:number; duration:number; normal:number; active:number; probability:number;
  slow:number; fast:number; floor:number; firstExtra:number; hpScale:number;
}

interface LifeGroup {
  mass:number; sum:number; min:number; max:number;
  parents:{ group:LifeGroup; probability:number; spent:number }[];
}

/** 只有同一开技时点的路径跨越下限时，才按先前的回技结果分别判断。 */
function excess(g:LifeGroup, cutoff:number, retained:number):number {
  if (g.max <= cutoff) return 0;
  if (g.min >= cutoff) return g.sum - cutoff * g.mass;
  return g.parents.reduce((s, { group, probability, spent }) =>
    s + probability * retained * excess(group, (cutoff + spent) / retained, retained), 0);
}

export function expectedTimedWave(plan:TimedWavePlan) {
  const { first, duration, normal, active, slow, fast, probability:p, floor, firstExtra, hpScale } = plan;
  // x 表示剑气按剩余生命计的伤害超出下限的部分。跌破下限后，此路径不会再产生正差。
  // 只在仍可能有正差的组保留父级，故到达稳定期后只需二项概率。
  const retained = 1 - hpScale;
  const nextLife = (group:LifeGroup, probability:number, wait:number, into:LifeGroup|undefined) => {
    const spent = hpScale * (floor + active * duration + normal * wait);
    const max = retained * group.max - spent;
    if (max <= 0) return into;
    const child = into ?? { mass:0, sum:0, min:Infinity, max:-Infinity, parents:[] };
    child.mass += probability * group.mass;
    child.sum += probability * (retained * group.sum - spent * group.mass);
    child.min = Math.min(child.min, retained * group.min - spent);
    child.max = Math.max(child.max, max);
    child.parents.push({ group, probability, spent });
    return child;
  };

  const rows:{ time:number; mass:number; burst:number }[][] = [];
  let weights = [1];
  let life:(LifeGroup|undefined)[] = [{ mass:1, sum:firstExtra, min:firstExtra, max:firstExtra, parents:[] }];
  const shortest = duration + fast;
  const at = (seconds:number) => {
    if (seconds < first) return Math.max(0, seconds) * normal;
    const last = Math.floor((seconds - first) / shortest + 1e-12);
    while (rows.length <= last) {
      const round = rows.length;
      const events = [], nextWeights = Array<number>(p === 1 ? 1 : weights.length + 1).fill(0);
      const nextGroups:(LifeGroup|undefined)[] = [];
      for (let i = 0; i < weights.length; i++) {
        const mass = weights[i]!;
        if (!mass) continue;
        const wins = p === 1 ? round : i;
        const time = first + round * duration + wins * fast + (round - wins) * slow;
        const group = life[i];
        events.push({ time, mass, burst:mass * floor + (group ? excess(group, 0, retained) : 0) });
        if (p < 1) {
          nextWeights[i]! += (1 - p) * mass;
          if (group) nextGroups[i] = nextLife(group, 1 - p, slow, nextGroups[i]);
        }
        const won = p === 1 ? 0 : i + 1;
        nextWeights[won]! += p * mass;
        if (group) nextGroups[won] = nextLife(group, p, fast, nextGroups[won]);
      }
      rows.push(events);
      weights = nextWeights;
      life = nextGroups;
    }
    let damage = seconds * normal;
    for (let i = 0; i <= last; i++) for (const event of rows[i]!) {
      if (event.time <= seconds) damage += event.burst +
        event.mass * (active - normal) * Math.min(duration, seconds - event.time);
    }
    return damage;
  };
  return at;
}
