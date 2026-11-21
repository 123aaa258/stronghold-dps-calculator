import { operatorRotation, amplify } from './batches/phase-07-09.ts';
// 闭环场景中敌人持续被停顿。技力光环与模组奖励分别从生效的天赋读取。
export const override = operatorRotation('arts', ({ effects, slot, skill: s, talent }) => {
  const e = amplify(effects, 'talent:lisa', talent(1).damage_scale - 1, true);
  e.spRecovery += (talent(0).sp_recovery_per_sec ?? 0) + (talent(-1).sp_recovery_per_sec ?? 0);
  return { effects: e, active: { body: slot === 3 ? { type: 'none' } : { atk: s.atk, speed: s.attack_speed } },
    assumptions: ['默认目标已在范围内受到停顿，画地为牢的脆弱条件成立。狐火渺然期间本体停止攻击。'] };
});
