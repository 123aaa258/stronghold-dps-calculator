import { duel } from './single-boss.ts';

// https://prts.wiki/w/Mon3tr ：重构体自身持续失血，可供治疗回技；熔毁的每次攻击也会自疗。
export const monstrOverride = duel(({ s, b, t, attack }) => {
  const speed = t(1, 'attack_speed');
  const normal = attack(false, 'heal', { actions: 0, speed });
  const assumptions = ['重构体始终可供治疗回技；按持续治疗维持战术协同攻速，忽略部署后首次治疗前的短暂启动差。'];
  if (s === 3) {
    assumptions.push('开技时移动到已放好的重构体处，单个地面 Boss 持续在攻击范围内。技能期间仅使用发动时的重构体，不另行部署攻击光环；自损与自疗按无外来致命伤处理，技能持续到自然结束。');
    return { normal, skill: attack(true, 'true', { atk: b.atk, delay: b.base_attack_time, speed }), assumptions };
  }
  // 一技能替换一次治疗，二技能加强治疗与攻速；治疗动作不触发对敌附加伤害。
  const skill = attack(true, 'heal', { actions: 0, speed: speed * (b.talent_scale ?? 1), scale: b.heal_scale });
  return { normal, skill, assumptions };
});
