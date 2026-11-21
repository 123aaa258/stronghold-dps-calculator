import { operatorRotation } from './batches/phase-07-09.ts';
// 两个部署技能都是衰减的生存强化，仅标出开技窗口；持续期内继续普攻。
export const override = operatorRotation('physical', ({ skill: s }) => ({
  lifecycle: 'on_deploy', duration: s.duration, active: {},
}));
