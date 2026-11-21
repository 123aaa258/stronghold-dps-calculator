import type { AttributeSet, DerivationStep, StatResult } from './types.ts';
/** 转为游戏帧间隔，消除十进制恰好半帧在二进制浮点运算中向下偏移的误差。 */
export function frameInterval(seconds: number) {
  return Math.max(1, Math.round(seconds * 30 + 1e-9)) / 30;
}
export interface StatModifier {
  stat: 'atk' | 'attackSpeed' | 'attackInterval';
  bucket: 'direct' | 'pct' | 'finalAdd' | 'mul';
  value: number;
  source: string;
}
export function stats(base: Pick<AttributeSet, 'atk' | 'attackSpeed' | 'baseAttackTime'>, modifiers: StatModifier[] = []): StatResult {
  const derivation = {} as StatResult['derivation'];
  const evaluate = (stat: StatModifier['stat'], initial: number) => {
    const steps: DerivationStep[] = [{ label: `基础${stat}`, value: initial, op: 'set', source: 'operator:attributes' }];
    let value = initial;
    for (const bucket of ['direct', 'pct', 'finalAdd', 'mul'] as const) {
      let total = bucket === 'mul' ? 1 : 0;
      for (const item of modifiers) {
        if (item.stat !== stat || item.bucket !== bucket) continue;
        steps.push({ label: `${stat}:${bucket}`, value: item.value, op: bucket === 'pct' ? 'pct' : bucket === 'mul' ? 'mul' : 'add', source: item.source });
        total = bucket === 'mul' ? total * item.value : total + item.value;
      }
      if (bucket === 'mul') value *= total;
      else if (bucket === 'pct') value *= 1 + total;
      else value += total;
    }
    steps.push({ label: '乘区计算结果', value, op: 'set', source: 'formula:stats' });
    derivation[stat] = steps;
    return value;
  };
  const atk = Math.max(0, evaluate('atk', base.atk));
  const rawSpeed = evaluate('attackSpeed', base.attackSpeed);
  // PRTS 数值范围：属性默认下限20；参与间隔计算时限定10~600。https://prts.wiki/w/数值范围
  const attackSpeed = Math.min(600, Math.max(10, rawSpeed));
  derivation.attackSpeed.push({ label: '参与间隔计算的攻速截断 [10,600]', value: attackSpeed, op: 'set', source: 'https://prts.wiki/w/数值范围' });
  const baseInterval = evaluate('attackInterval', base.baseAttackTime);
  if (!Number.isFinite(baseInterval) || baseInterval <= 0) throw new RangeError('攻击间隔必须为有限正数');
  // 按 PRTS《游戏数据基础》的攻速公式，先修正间隔并除以攻速系数，再取整帧。
  const attackInterval = frameInterval(baseInterval * 100 / attackSpeed);
  derivation.attackInterval.push({ label: '除以攻速/100', value: 100 / attackSpeed, op: 'mul', source: 'formula:interval' }, { label: '实际攻击间隔（30帧四舍五入，至少1帧；秒）', value: attackInterval, op: 'set', source: 'formula:interval' });
  return { atk, attackSpeed, attackInterval, derivation };
}
