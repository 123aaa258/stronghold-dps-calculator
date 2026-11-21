import type { BossData } from '../types.ts';

export interface BossAttackInterval {
  /** Boss 攻击间隔（秒）：baseAttackTime ÷ (attackSpeed / 100)。 */
  interval: number;
  baseAttackTime: number;
  attackSpeed: number;
  /** 取值说明（数据来源，缺省值的取法）。 */
  source: string;
}

/** 未能取到 baseAttackTime 时的缺省攻击间隔（秒）。来源：模型假设，取本模式 Boss 数据的常见值。 */
export const fallbackBossAttackInterval = 4;

/**
 * Boss 攻击间隔：取提取时记录在 attributeSource 里的 enemy_database 属性（按等级依次覆盖，关卡 overwrittenData 最后覆盖）。
 * attackSpeed 为 0 或缺失的视为未定义字段，按 100 计。
 */
export function bossAttackInterval(boss: Pick<BossData, 'attributeSource'>): BossAttackInterval {
  let baseAttackTime: number | undefined;
  let attackSpeed: number | undefined;
  let from: string | undefined;
  for (const line of boss.attributeSource) {
    const match = line.match(/^(.*?)\.attributes(?:\(m_defined=true\))?=(\{.*\})$/);
    if (!match) continue;
    let values: Record<string, unknown>;
    try { values = JSON.parse(match[2]!) as Record<string, unknown>; } catch { continue; }
    if (typeof values.baseAttackTime === 'number') { baseAttackTime = values.baseAttackTime; from = match[1]; }
    if (typeof values.attackSpeed === 'number') attackSpeed = values.attackSpeed;
  }
  if (baseAttackTime === undefined || !(baseAttackTime > 0)) {
    return { interval: fallbackBossAttackInterval, baseAttackTime: fallbackBossAttackInterval, attackSpeed: 100,
      source: `Boss 数据缺少攻击间隔，按 ${fallbackBossAttackInterval} 秒计（模型假设）` };
  }
  const speed = attackSpeed && attackSpeed > 0 ? attackSpeed : 100;
  return { interval: baseAttackTime / (speed / 100), baseAttackTime, attackSpeed: speed,
    source: `${from}.baseAttackTime=${baseAttackTime}${attackSpeed && attackSpeed > 0 ? `，attackSpeed=${attackSpeed}` : '，attackSpeed 未定义按 100'}` };
}
