import { swiftDraw, withSwiftPath } from './swift.ts';

type Cut = { index: number; probability: number };
type Interval = readonly [number, number];

/** 积分变量是每次技能结束的一次独立均匀抽签；重建面板或查询同一时刻不会多抽。 */
export function swiftExpectation(horizon: number, run: () => number) {
  const intervals: (Interval | undefined)[] = [];
  let sampled = false;
  function evaluate(tailSample = 0) {
    const cuts: Cut[] = [];
    const draws: number[] = [];
    const seen = new Map<number, Set<number>>();
    let hasTail = false;
    const damage = withSwiftPath((index, probability, endTime?: number) => {
      const fixed = swiftDraw(index);
      const [lo, hi] = intervals[index] ?? [0, 1];
      if (endTime !== undefined && endTime > horizon + 1e-8) return lo + fixed * (hi - lo) < probability;
      if (index >= 10) {
        // 少量连中会将原本低频的技能推入高频区。按结束序号置换四个概率分层，维持整笔回技。
        hasTail = true;
        const hash = Math.imul(index + 1, 0x9e3779b1) >>> 0;
        const stratum = ((hash >>> 29 | 1) * tailSample + (hash >>> 20)) & 3;
        return (stratum + fixed) / 4 < probability;
      }
      if (probability <= lo) return false;
      if (probability >= hi) return true;
      let levels = seen.get(index);
      if (!levels) seen.set(index, levels = new Set());
      if (!levels.has(probability)) {
        levels.add(probability);
        cuts.push({ index, probability });
      }
      const value = lo + fixed * (hi - lo);
      draws[index] = value;
      return value < probability;
    }, run);
    return { cuts, damage, draws, hasTail };
  }
  function integrate(path: ReturnType<typeof evaluate>): number {
    const cut = path.cuts.find(({ index, probability }) => {
      const [lo, hi] = intervals[index] ?? [0, 1];
      return lo < probability && probability < hi;
    });
    if (!cut) {
      if (!path.hasTail) return path.damage;
      sampled = true;
      let total = path.damage;
      for (let sample = 1; sample < 4; sample++) total += evaluate(sample).damage;
      return total / 4;
    }
    const { index, probability } = cut;
    const previous = intervals[index];
    const [lo, hi] = previous ?? [0, 1];
    const weight = (probability - lo) / (hi - lo);
    // 已计算的轨迹保留在原抽签所在的半区，另一半区才需要重演。
    const success = path.draws[index]! < probability;
    intervals[index] = [lo, probability];
    const yes = integrate(success ? path : evaluate());
    intervals[index] = [probability, hi];
    const no = integrate(success ? evaluate() : path);
    intervals[index] = previous;
    return weight * yes + (1 - weight) * no;
  }
  return { damage: integrate(evaluate()), sampled };
}
