import { expect, it } from 'vitest';
import { calculate } from '../../calc.ts';

function run(id:'brigid'|'mlyss', tier:'a'|'b', skill:number, durationSec = 180, equips:string[] = []) {
  const charId = id === 'brigid' ? 'char_4177_brigid' : 'char_249_mlyss';
  return calculate({ charId, tier, skillId:'skchr_' + id + '_' + skill, bossId:'boss_1',
    modeId:'mode_single_10', durationSec, bonds:[], equips });
}

for (const tier of ['a','b'] as const) {
  const elite = tier === 'b';
  const normal = (elite ? 627.1139240506329 * 1.1 : 518) * .75;
  it('水灯心 ' + tier + ' 相邻一格，精准狙击镜的三格增伤条件未满足', () => {
    for (const skill of [1,2]) {
      const scoped = run('brigid', tier, skill, 180, ['chess_item_3_02_e_' + tier]);
      const bare = run('brigid', tier, skill);
      expect(scoped.assumptions).toContain('【精准狙击镜】狙击镜距离条件未满足');
      expect(scoped.skill!.dps).toBeCloseTo(bare.skill!.dps, 7);
      expect(scoped.totalDamage.value).toBeCloseTo(bare.totalDamage.value, 7);
    }
  });
  it('水灯心 ' + tier + ' S1 单目标每发只命中一次，蓄满后下次投掷强化', () => {
    const every = elite ? 4 : 5;
    const empowered = normal * (elite ? 1.15 : 1.1);
    const strikes = 180 / every;
    expect(run('brigid', tier, 1, every - 1).totalDamage.value).toBeCloseTo((every - 1) * normal, 6);
    expect(run('brigid', tier, 1, every).totalDamage.value).toBeCloseTo((every - 1) * normal + empowered, 6);
    expect(run('brigid', tier, 1).totalDamage.value).toBeCloseTo((180 - strikes) * normal + strikes * empowered, 6);
  });

  it('水灯心 ' + tier + ' S2 首投后每四分之一秒结算一斩，整场只计已命中的段', () => {
    const cast = elite ? 13 : 21;
    const blade = normal * (elite ? 1.35 : 1.2);
    const opening = normal * cast;
    for (const [after, hits] of [[1,1],[1.24,1],[1.25,2],[1.5,3],[1.75,4],[2,6]] as const) {
      expect(run('brigid', tier, 2, cast + after).totalDamage.value).toBeCloseTo(opening + hits * blade, 6);
    }
    // 普通开技在 21、76、131 秒；精锐在 13、65、117、169 秒。技能结束时已可正常投掷。
    const [throws, cuts] = elite ? [83,328] as const : [72,288] as const;
    expect(run('brigid', tier, 2).totalDamage.value).toBeCloseTo((180 - throws) * normal + (throws + cuts) * blade, 6);
  });

  // 胄的 1000 防御使本体所有攻击均走 5% 保底。攻击就绪与技能开关同帧时先切换技能。
  const body = (elite ? 491.6629213483146 : 407) * .05;
  const active = body * (elite ? 1.35 : 1.22);
  for (const skill of [1,2,3]) {
    it('缪尔赛思 ' + tier + ' S' + skill + ' 本体单独上场的初始技力、单击与180秒总伤', () => {
      const result = run('mlyss', tier, skill);
      for (const phase of [result.skill!, result.normal]) {
        expect(phase.components.map(c => c.damageType)).toEqual(['physical']);
      }
      expect(result.normal.components[0]!.perHit).toBeCloseTo(body, 8);
      expect(result.skill!.components[0]!.perHit).toBeCloseTo(active, 8);
      const cast = elite ? 24 : skill === 1 ? 31 : 32;
      expect(run('mlyss', tier, skill, cast - 1).totalDamage.value).toBeCloseTo((cast - 1) * body, 6);
      expect(run('mlyss', tier, skill, cast).totalDamage.value).toBeCloseTo((cast - 1) * body + active, 6);
      // S1 三段15秒以25帧，或四段15秒以22帧攻击；切换时保留攻击进度。S2/S3均有45秒技能期。
      const normalHits = skill === 1 && elite ? 119 : 135;
      const skillHits = skill === 1 ? (elite ? 82 : 54) : 45;
      expect(result.totalDamage.value).toBeCloseTo(normalHits * body + skillHits * active, 6);
    });
  }
}
