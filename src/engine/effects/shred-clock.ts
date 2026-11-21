import type { DamageComponent, PhaseResult } from '../types.ts';
import type { Segment } from '../timeline.ts';
import type { BattleEffects } from './common.ts';
import { judgmentSource } from './judgment.ts';
import { isDotSource, kazimierzSource } from './skill-bonds.ts';

const countsDamageEvent = (hit: DamageComponent) =>
  hit.countsTowardDps && hit.source !== judgmentSource && hit.source !== kazimierzSource && !isDotSource(hit.source);

export class ShredClock {
  count = 0;
  readonly cap: number;
  private progress = new Map<string, number>();

  constructor(effects: BattleEffects, extraEventCap = 0) {
    this.cap = Math.max(extraEventCap, effects.resShred ? Math.ceil(effects.resShred.max / effects.resShred.perHit) : 0);
  }

  reset(count: number) { this.count = count; this.progress.clear(); }

  burst(components: DamageComponent[]) {
    for (const hit of components) if (countsDamageEvent(hit))
      this.count = Math.min(this.cap, this.count + hit.hitsPerAttack);
  }

  append(parts: Segment[], duration: number, phase: (count: number) => PhaseResult) {
    let left = duration;
    while (left > 1e-9) {
      const current = phase(this.count), tick = this.step(current.components);
      const seconds = Math.min(left, tick.seconds);
      parts.push({duration: seconds, dps:current.dps});
      if (!Number.isFinite(seconds)) break;
      tick.advance(seconds);
      left -= seconds;
    }
  }

  step(components: DamageComponent[]) {
    if (this.count >= this.cap) return { seconds: Infinity, advance: () => {} };
    const timers = components.flatMap((hit, index) => {
      if (!countsDamageEvent(hit) || !(hit.hitsPerSec > 0 && hit.hitsPerAttack > 0)) return [];
      const key = `${index}:${hit.source}`, progress = this.progress.get(key) ?? 0;
      const interval = hit.hitsPerAttack / hit.hitsPerSec;
      return [{ key, progress, interval, hits: hit.hitsPerAttack, next: (1 - progress) * interval }];
    });
    return { seconds: Math.min(...timers.map(timer => timer.next)), advance: (seconds: number) => {
      this.progress.clear();
      for (const timer of timers) {
        const complete = seconds >= timer.next - 1e-9;
        this.progress.set(timer.key, complete ? 0 : timer.progress + seconds / timer.interval);
        if (complete) this.count = Math.min(this.cap, this.count + timer.hits);
      }
    } };
  }
}
