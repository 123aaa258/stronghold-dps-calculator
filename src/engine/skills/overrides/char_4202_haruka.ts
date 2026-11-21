import { duel } from './single-boss.ts';
import { triggerCount, mass } from './duel-effects.ts';
import { bossAttackInterval } from '../../effects/boss-attack.ts';

// 遥只在非技能期普攻；幽隙栖萤第二次使用改变攻击力与持续时长，夏末游鳞按免疫判定。
export const harukaOverride = duel(({ ctx, e, s, b, trait, attack, add }) => {
  const track = s === 2 ? triggerCount(e, 'haruka-second', 'skill', 2) : { count: 0, effects: e };
  const normal = attack(false, 'arts', { effects: track.effects });
  let skill = attack(true, 'none', { effects: track.effects, atk: s === 2 && track.count < 2 ? 0 : b.atk, speed: b.attack_speed, delay: b.base_attack_time });
  if (s === 2) skill = add(skill, { label: '治疗溅射', type: 'arts', scale: b.atk_scale_extra * trait('heal_scale', .75), independent: true });
  if (s === 3 && !ctx.boss.attributes?.immunities.levitateImmune) {
    const seconds = b.levitate_duration / ((mass(ctx) ?? 0) > 3 ? 2 : 1);
    skill = add(skill, { label: '浮空法伤', type: 'arts', scale: b.atk_scale,
      interval: b.interval / Math.min(1, seconds / bossAttackInterval(ctx.boss).interval), independent: true });
  }
  return { normal, skill, battle: track.effects, lifecycle: 'timed', duration: ctx.level.duration, repeatDuration: s === 2 ? Infinity : undefined,
    assumptions: [...(s === 2 ? ['遥每个治疗间隔治疗一名紧邻 Boss 的受伤单位，计一次折算治疗量的法伤；浮泡额外治疗与回技取决于承伤友军，未叠加。'] : []),
      ...(s === 3 ? ['Boss 攻击带泡的单位；免疫浮空时不计浮空期间法伤，重目标按浮空持续减半。'] : [])] };
});