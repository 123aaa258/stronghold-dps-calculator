import { operatorAttack, instant, type RotationScene } from './operator-attack.ts';
import { swiftSucceeds } from '../../swift.ts';
import { actionDamage } from './shared.ts';
import type { PhaseResult } from '../../types.ts';

/** 同一发序、相同成功次数的路径有相同的施放时刻、普攻序号和减防窗口，可以合并概率。 */
function highExplosiveExpectation(scene: RotationScene, normals: PhaseResult[], casts: PhaseResult[]) {
  const { e, ctx, b, talent } = scene;
  const cost = Math.max(e.spCostMin, ctx.level.spCost * e.spCostScale);
  const rate = ctx.level.increment + e.spRecovery;
  if (!(cost > 0 && rate > 0 && e.skillEndSp > 0 && e.skillEndProbability > 0 && e.skillEndProbability < 1)
    || ctx.level.maxChargeTime > 1 || e.timedStats.length || e.stacks.length || e.bondStacks || e.resShred || e.judgment
    || e.atkProc || e.splash || e.dots.length || e.periodic.length || e.burning || e.timedDamageScale.length || e.kazimierz || e.quicksand) return;
  const interval = normals[0]!.stats.attackInterval;
  const first = Math.max(0, cost - Math.max(0, ctx.level.initSp + e.initSp)) / rate;
  const failureGap = cost / rate;
  const successGap = e.skillEndSp >= cost - 1e-9 ? casts[0]!.stats.attackInterval : (cost - e.skillEndSp) / rate;
  const normalHit = normals.map(actionDamage), skillHit = casts.map(actionDamage);
  const critChance = talent(0).prob!;
  const crit = (action: number) => Number(swiftSucceeds(action, critChance, 1));
  const hitsBefore = (time: number) => Math.max(0, Math.ceil((time - 1e-8) / interval) - 1);
  return (duration: number) => {
    const lastHit = Math.floor((duration + 1e-8) / interval);
    let total = 0;
    for (let hit = 1; hit <= Math.min(lastHit, hitsBefore(first)); hit++) total += normalHit[crit(hit - 1)]!;
    let states = new Map([[0, 1]]);
    for (let fired = 0; states.size; fired++) {
      const next = new Map<number, number>();
      for (const [wins, mass] of states) {
        const time = first + wins * successGap + (fired - wins) * failureGap;
        if (time > duration + 1e-8) continue;
        const priorHits = hitsBefore(time);
        total += mass * skillHit[crit(priorHits + fired)]!;
        for (const success of [false, true]) {
          const weight = mass * (success ? e.skillEndProbability : 1 - e.skillEndProbability);
          const following = time + (success ? successGap : failureGap);
          // 同帧先释放高爆弹，再让普攻击中，因此下一发开技边界的普攻留给下一状态。
          for (let hit = priorHits + 1; hit <= Math.min(lastHit, hitsBefore(following)); hit++) {
            const debuffed = hit * interval < time + b.duration! - 1e-8;
            total += weight * normalHit[crit(hit + fired) + (debuffed ? 2 : 0)]!;
          }
          if (following <= duration + 1e-8) {
            const count = wins + Number(success);
            next.set(count, (next.get(count) ?? 0) + weight);
          }
        }
      }
      states = next;
    }
    return total;
  };
}

// 来源：干员当前阶级的特性、天赋及所选技能黑板；卫戍属性由公共入口注入。
export const meteoOverride = operatorAttack('physical', scene => {
  const { b, n, talent, trait, hit, notes } = scene;
  const t = talent(0), defPen = trait.def_penetrate_fixed;
  const options = (crit:boolean, debuff:boolean) => ({ defPen, defDown:debuff ? -(b.def ?? 0) : 0, atk:crit ? t.atk : 0 });
  const normal = [false,true].flatMap(debuff => [false,true].map(crit => hit(false, options(crit,debuff))));
  const casts = [false,true].map(crit => hit(true, { ...options(crit,n === 2), scale:b.atk_scale }));
  notes.push('破片杀伤对每次攻击或施放按固定序列独立判定；高爆弹先减防再结算这一击，减防随持续时间到期。');
  if (n === 2) notes.push('同帧就绪时按先自动释放高爆弹、再结算普攻处理；该顺序尚无本模式逐帧实测。');
  return { ...instant(normal[0]!, casts[0]!, n === 1),
    expectedSwiftDamage: n === 2 ? highExplosiveExpectation(scene, normal, casts) : undefined,
    sequence:{ discreteAttacks:n === 2, select:s => {
    // 高爆弹作为一次攻击在 attack-sequence 内递增 attacks，和普攻共用同一判定序列。
    const critical = +swiftSucceeds(s.attacks, t.prob!, 1);
    if (s.active) return casts[critical]!;
    return normal[critical + (n === 2 && s.time < s.lastCast + b.duration! - 1e-8 ? 2 : 0)]!;
  }, next:s => n === 2 && s.time < s.lastCast + b.duration! - 1e-8 ? s.lastCast + b.duration! : Infinity } };
});
