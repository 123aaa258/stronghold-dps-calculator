import { duel } from './single-boss.ts';
import { actionDamage, isBlocked } from './shared.ts';
import { duelClock } from './duel-clock.ts';
import type { SkillOverride } from './index.ts';

// 红桃K、地雷、D12 对单个目标各命中一次，免晕 Boss 不吃晕眩增伤。
const rotation = duel(({ ctx, s, b, t, trait, e, attack }) => {
  const vulnerable = !ctx.boss.attributes?.immunities.stunImmune;
  const effects = vulnerable ? { ...e, modifiers: [...e.modifiers, { kind: 'fragile' as const, group: 'physical-fragile', types: ['physical' as const],
    value: t(1, 'damage_scale') - 1, source: 'talent:cqbw:2' }] } : e;
  const scale = isBlocked(ctx.boss) ? trait('atk_scale', 1) : 1;
  const skill = attack(true, 'physical', { effects, scale: scale * b.atk_scale, actions: s === 1 ? 1 : 0 });
  return { normal: attack(false, 'physical', { scale, effects }), skill, lifecycle: 'instant', duration: s === 2 ? skill.stats.attackInterval : 0,
    burst: s !== 2, burstAttack: s === 1, assumptions: [
      ...(s === 2 ? ['W 的地雷按放在 Boss 当前可触发位置且立即爆炸计算。'] : []),
      ...(s === 3 ? ['W 只对单个 Boss 挂一枚炸弹，附着三秒后依所缓存的攻击力爆炸。'] : []),
      ...(vulnerable ? ['目标可被晕眩，默认其他来源维持晕眩使落井下石生效。'] : [])] };
});
export const cqbwOverride: SkillOverride = (ctx,base)=>{
  const model=rotation(ctx,base);
  if(!ctx.skill.skillId.endsWith('_3'))return model;
  // PRTS https://prts.wiki/w/W ：D12附着后延迟三秒爆炸，攻击与技力回复不因炸弹在场停止。
  const waiting:number[]=[],blast=actionDamage(model.skill!);
  return duelClock(ctx,model,{normal:model.normal,skill:model.skill!,length:()=>0,panel:()=>model.normal,
    onCast:st=>{waiting.push(st.time+3);return 0;},nextEvent:()=>waiting[0]??Infinity,event:()=>{waiting.shift();return blast;}});
};
