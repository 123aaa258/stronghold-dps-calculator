import { duel } from './single-boss.ts';
import { isBlocked } from './shared.ts';

export const override = duel(({ ctx, s, b, trait, attack, add }) => {
  const make = (active: boolean) => {
    const ranged = !isBlocked(ctx.boss) && !(active && s === 2);
    const main = attack(active, active && s === 2 ? 'arts' : 'physical', {
      atk: active ? b.atk : 0, scale: ranged ? trait('atk_scale') : 1 });
    const scale = trait('atk_scale_m');
    return scale ? add(main, { label:'领主模组附加法伤', type:'arts', scale }) : main;
  };
  return { normal: make(false), skill: make(true), assumptions:['单个 Boss 近身被阻挡，狼魂的第二目标不增加段数；选择未阻挡机制时使用远程普攻。'] };
});
