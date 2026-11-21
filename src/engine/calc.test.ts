import { expect, it } from 'vitest';
import { calculate, memberBondIds } from './index.ts';
import operators from '../data/generated/operators.json' with { type: 'json' };
import bosses from '../data/generated/bosses.json' with { type: 'json' };
import equips from '../data/generated/equips.json' with { type: 'json' };
import type { BossData, CalcInput, EquipData, OperatorData } from './types.ts';
import { swiftSucceeds } from './swift.ts';
const input = (name: string, index?: number): CalcInput => {
  const op = operators.find(o => o.name === name)!;
  return { charId: op.charId, tier: 'b', skillId: op.skillIds[index ?? op.defaultSkillIndex], equips: [], bonds: [], bossId: 'boss_1', modeId: 'mode_single_10', durationSec: 30 };
};
const close = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.max(1, Math.abs(expected)) * 1e-6);
it('进阶逻各斯用维式重锤与变形同构体获得维多利亚', () => {
  const operator = (operators as unknown as OperatorData[]).find(o => o.name === '逻各斯')!;
  const hammer = 'chess_item_1_01_e_a';
  const isomorph = 'chess_item_6_03_e_a';
  const config = { ...input('逻各斯'), bonds: [{ bondId: 'victoriaShip', stacks: 0, activeChars: 3 }] };
  expect(memberBondIds(operator, [hammer, isomorph], equips as EquipData[])).toEqual([...operator.bondIds, 'victoriaShip']);
  expect(memberBondIds(operator, [isomorph], equips as EquipData[])).toEqual(operator.bondIds);
  const paired = calculate({ ...config, equips: [hammer, isomorph] });
  // 固定同一把重锤的面板加攻，维多利亚0层3人额外乘 base_damage_scale=1.25。
  close(paired.normal.dps, calculate({ ...config, equips: [hammer] }).normal.dps * 1.25);
  expect(paired.normal.components[0].derivation).toContainEqual(expect.objectContaining({ source: 'bond:victoriaShip', value: 1.25 }));
  close(calculate({ ...config, equips: [isomorph] }).normal.dps, calculate(input('逻各斯')).normal.dps);
});
it('三坚守向非成员施加全场脆弱', () => {
  const config = input('蓝毒', 1);
  const base = calculate(config);
  const withStead = (activeChars: number) => calculate({ ...config, bonds: [{ bondId: 'steadShip', stacks: 0, activeChars }] });
  // 3人时每段伤判×1.4，2人时倍率为1，无反伤分项。
  close(withStead(2).normal.dps, base.normal.dps);
  const reinforced = withStead(3);
  close(reinforced.normal.dps, base.normal.dps * 1.4);
  close(reinforced.skill!.dps, base.skill!.dps * 1.4);
  close(reinforced.totalDamage.value, base.totalDamage.value * 1.4);
  expect(reinforced.normal.components).toHaveLength(base.normal.components.length);
  expect(reinforced.normal.components[0].derivation).toContainEqual(expect.objectContaining({
    label: expect.stringContaining('假设 Boss 持续攻击坚守干员'), value: 1.4,
  }));
});
it('迅捷40层按概率为非成员回复技力，39层不变，成员叠加', () => {
  const config = { ...input('蓝毒', 1), durationSec: 103 };
  const base = calculate(config);
  const swift = (stacks: number, equips: string[] = []) =>
    calculate({ ...config, equips, bonds: [{ bondId: 'swiftShip', stacks, activeChars: 2 }] });
  // 首轮30..56秒。成功时第91秒再开，103秒内多12秒技能；失败时第106秒再开，权重分别为.34与.66。
  const reinforced = swift(40);
  const extra = .34 * 12;
  close(reinforced.totalDamage.value, (77 - extra) * base.normal.dps + (26 + extra) * base.skill!.dps);
  // 回复时长取模拟各轮的平均：成功 50−15=35 秒，失败 50 秒。
  expect(reinforced.cycle!.spRecoverSec).toBeGreaterThanOrEqual(35);
  expect(reinforced.cycle!.spRecoverSec).toBeLessThanOrEqual(50);
  close(reinforced.cycle!.avgDps, reinforced.totalDamage.value / 103);
  close(swift(39).cycle!.spRecoverSec, 50);
  close(swift(39).totalDamage.value, base.totalDamage.value);
  // 同构体＋迅捷作战粮使蓝毒成为成员：成功回 12+15=27，回复 23 秒；失败 50 秒。
  const member = swift(40, ['chess_item_3_04_e_a', 'chess_item_6_03_e_a']).cycle!.spRecoverSec;
  expect(member).toBeGreaterThanOrEqual(23);
  expect(member).toBeLessThanOrEqual(reinforced.cycle!.spRecoverSec);
  // 极光S2耗尽弹药时判定：成功后缺5SP，失败缺20SP。
  const ammo = calculate({ ...input('极光', 1), bonds: reinforced.input.bonds }).cycle!.spRecoverSec;
  expect(ammo).toBeGreaterThanOrEqual(5);
  expect(ammo).toBeLessThanOrEqual(20 + 1e-9);
});
it('非成员灵巧吃覆盖内攻速，突袭从50层起全场提速', () => {
  const config = input('蓝毒', 1);
  const speed = calculate(config).normal.stats.attackSpeed;
  // 灵巧40层+10+40=50，突袭50层+50，两条各自按2人激活。
  const skillful = { bondId: 'skillfulShip', stacks: 40, activeChars: 2 };
  const raid = { bondId: 'raidShip', stacks: 50, activeChars: 2 };
  close(calculate({ ...config, bonds: [{ ...skillful, inRange: true }] }).normal.stats.attackSpeed, speed + 50);
  close(calculate({ ...config, bonds: [{ ...skillful, inRange: false }] }).normal.stats.attackSpeed, speed);
  close(calculate({ ...config, bonds: [raid] }).normal.stats.attackSpeed, speed + 50);
  close(calculate({ ...config, bonds: [{ ...raid, stacks: 49 }] }).normal.stats.attackSpeed, speed);
});
it('三奥术让非成员从首击起按满减抗计入总伤，成员附加法伤不外溢', () => {
  const config = input('深靛', 0);
  const base = calculate(config);
  const { atk, attackInterval } = base.normal.stats;
  const durationSec = 2 * attackInterval;
  const inactive = calculate({ ...config, durationSec, bonds: [{ bondId:'arcaneShip', stacks:10, activeChars:2 }] });
  expect(inactive.totalDamage.value).toBe(calculate({ ...config,durationSec }).totalDamage.value);
  const result = calculate({ ...config, durationSec, bonds: [{ bondId: 'arcaneShip', stacks: 10, activeChars: 3 }] });
  // 两个普攻间隔都在首轮技能前。Boss初始25法抗，固定减抗30.5点后降为0。
  expect(result.normal.components).toHaveLength(1);
  close(result.totalDamage.value, 2 * atk);
});
it('三奥术开场按满减抗结算火山和逻各斯S3的本体、天赋与附伤', () => {
  const config = { bossId: 'boss_2', bonds: [{ bondId: 'arcaneShip', stacks: 0, activeChars: 3 }] };
  // 铳法抗60，奥术固定减30，火山法穿10，逻各斯天赋减10，故各段均乘0.8。
  const volcano = calculate({ ...input('艾雅法拉', 2), ...config });
  const lava = 647.9213483146068 * 1.99;
  close(volcano.skill!.dps, (lava + .2 * lava) * .8 / .5);
  const logos = calculate({ ...input('逻各斯', 2), ...config });
  // 主击和期望0.8次天赋各带一次20%奥术附伤，每段独立加150后过法抗。
  const atk = 692.2359550561798 * 3.2;
  const extra = .2 * atk + 150;
  close(logos.skill!.dps, ((atk + 150 + extra) + .8 * (.65 * atk + 150 + extra)) * .8 / 1.6);
});
it('史尔特尔打铳时三奥术按30点固定减抗计算技能期DPS，零档和两人档一致', () => {
  const config = { ...input('史尔特尔', 2), bossId: 'boss_2' };
  const withArcane = (activeChars: number) =>
    calculate({ ...config, bonds: [{ bondId: 'arcaneShip', stacks: 0, activeChars }] });
  const base = calculate(config);
  expect(withArcane(0).skill).toEqual(base.skill);
  expect(withArcane(2).skill).toEqual(base.skill);
  const reinforced = withArcane(3);
  // 铳的60法抗降为30；史尔特尔固定法穿20，黄昏攻击3.4倍，阻挡时模组法术脆弱×1.1。
  const normalAt30Res = 688.8539325842696 * .9 * 1.1 / (38 / 30);
  close(reinforced.normal.dps, normalAt30Res);
  // 分项为开技时快照；技能期 DPS 是首轮（自损致死前 + 余烬攻速段）的区间积分，余烬加攻速，故不低于快照。
  close(reinforced.skill!.components.reduce((n, c) => n + (c.countsTowardDps ? c.dps : 0), 0), normalAt30Res * 3.4);
  expect(reinforced.skill!.dps).toBeGreaterThanOrEqual(normalAt30Res * 3.4 - 1e-6);
  expect(reinforced.skill!.dps).toBeGreaterThan(base.skill!.dps);
  expect(reinforced.skill!.components[0].derivation).toContainEqual(expect.objectContaining({
    source: 'bond:arcaneShip', label: '全场奥术减抗：按敌人已叠满减抗计算（直接按上限）', value: 30,
  }));
  expect(reinforced.notes).toContain('近似：bond:arcaneShip 全场奥术减抗：按敌人已叠满减抗计算（直接按上限）');
  expect(reinforced.assumptions).toContain('【奥术】默认敌人已叠满法术抗性降低');
});
it('精准与绝技保持非成员作用域', () => {
  const ranged = input('蓝毒', 1);
  const base = calculate(ranged);
  const preci = { bondId: 'preciShip', stacks: 0, activeChars: 3 };
  const reinforced = calculate({ ...ranged, bonds: [preci] });
  // 精准3人：远程ATK×1.1，DEF1000穿透30%→700；近战非成员无增益。
  close(reinforced.normal.stats.atk, base.normal.stats.atk * 1.1);
  expect(reinforced.normal.components[0].derivation).toContainEqual(expect.objectContaining({ label: '穿透后有效防御/法抗', value: 700 }));
  const melee = input('拜松', 0);
  close(calculate({ ...melee, bonds: [preci] }).normal.dps, calculate(melee).normal.dps);
  const sunt = { bondId: 'suntShip', stacks: 0, activeChars: 5 };
  // 绝技5人：精锐ATK×1.3、技力50×0.7=35；普通阶无增益。
  const elite = calculate({ ...ranged, bonds: [sunt] });
  close(elite.normal.stats.atk, base.normal.stats.atk * 1.3);
  close(elite.cycle!.spRecoverSec, 35);
  const ordinary = { ...ranged, tier: 'a' as const };
  close(calculate({ ...ordinary, bonds: [sunt] }).normal.dps, calculate(ordinary).normal.dps);
});
it('史尔特尔进阶默认技能：非技能期法穿与普攻DPS', () => {
  // 真实数据：ATK=688.8539325842696，ASPD=100，基础间隔1.25，Boss RES=25。
  // 熔火无视20法抗 → 有效RES=max(0,25−20)=5；倍率1。
  // 单击=max(0.05×688.8539325842696,688.8539325842696×0.95)=654.4112359550561。
  // 频率=1/1.25=0.8；DPS=654.4112359550561×0.8=523.5289887640449。
  // 默认按目标被阻挡计算，模组法术脆弱×1.1；黄昏自损离散时点仍为approx。
  const result = calculate(input('史尔特尔'));
  close(result.normal.stats.atk, 688.8539325842696);
  close(result.normal.stats.attackInterval, 38 / 30);
  close(result.normal.components[0].perHit, 654.4112359550561 * 1.1);
  close(result.normal.dps, 654.4112359550561 * 30 / 38 * 1.1);
  expect(result.accuracy).toBe('approx');
  expect(result.model).toBe('override');
  expect(result.notes.join('\n')).not.toContain('damage_scale');
  expect(result.notes.join('\n')).not.toContain('忽略了 magic_resist_penetrate_fixed');
});
it('蓝毒地面模组攻速、神经毒素与首轮技能分别积分', () => {
  // 102基础攻速叠加8点地面模组攻速，30帧四舍五入后间隔27帧。
  // 普攻与技能的物理段均触发5%保底，75点毒素每秒过25法抗。额外目标不重复命中。
  const atk = 524.3037974683544, gap = 27 / 30, poison = 75 * .75;
  const normal = atk * .05 / gap + poison, active = atk * 1.3 * .05 / gap + poison;
  const result = calculate(input('蓝毒', 1));
  close(result.normal.dps, normal);
  close(result.skill!.dps, active);
  close(result.cycle!.spRecoverSec, 50);
  close(result.cycle!.skillDurationSec, 26);
  close(result.totalDamage.value, 30 * normal);
  close(result.cycle!.avgDps, normal);
  // 首轮在30秒，第二轮在106秒，180秒内合计52秒使用技能。
  const long = calculate({ ...input('蓝毒', 1), durationSec: 180 });
  close(long.totalDamage.value, 128 * normal + 52 * active);
  close(long.cycle!.avgDps, long.totalDamage.value / 180);
});
it('鸿雪的三连射同步触发相邻打字机，用召唤物独立面板逐段结算', () => {
  const result = calculate(input('鸿雪', 1));
  const machine = result.skill!.components.find(c => c.label === '打字机')!;
  // 打字机面板798.584、倍率2、附近减防23%，每段扣770防。
  close(machine.perHit, 798.5842696629213 * 2 - 770);
  expect(machine.hitsPerAttack).toBe(3);
  expect(result.assumptions?.join('')).toContain('打字机');
});
it('极光+25%间隔与深靛乘0.65不可混用', () => {
  // 极光b：基础1.6，攻速100→技能间隔1.6×(1+0.25)=2，9发弹药→18秒。
  const aurora = calculate(input('极光', 1));
  close(aurora.skill!.stats.attackInterval, 2);
  close(aurora.cycle!.skillDurationSec, 18);
  expect(aurora.lifecycle).toBe('ammo');
  // 深靛b：基础3，攻速103→技能间隔3×0.65/1.03=1.8932038834951455。
  close(calculate(input('深靛', 1)).skill!.stats.attackInterval, 57 / 30);
});
it('宴二技能是部署后15秒而非常驻', () => {
  // PASSIVE字段、duration=-1，但描述duration=15秒内→部署触发15秒；不循环。
  const result = calculate(input('宴', 1));
  expect(result.lifecycle).toBe('on_deploy');
  expect(result.skill).not.toBeNull();
  expect(result.cycle).toBeNull();
  close(result.totalDamage.value, result.skill!.dps * 15 + result.normal.dps * 15);
});
it('输入边界与经济装备静默跳过', () => {
  // 时长−1无定义→拒绝；经济装备不改变DPS、不会产生盟约或装备未建模提示。
  expect(() => calculate({ ...input('蓝毒'), durationSec: -1 })).toThrow(RangeError);
  expect(() => calculate({ ...input('蓝毒'), skillId: 'missing' })).toThrow(RangeError);
  const result = calculate({ ...input('蓝毒'), equips: ['chess_item_3_11_e_a'] });
  expect(result.accuracy).toBe('approx');
  expect(result.caveats).not.toContainEqual(expect.stringMatching(/^盟约\/装备效果尚未建模/));
  close(result.normal.dps, calculate(input('蓝毒')).normal.dps);
});
it('不攻击时装填不能误判为禁止攻击，通常不攻击与技能攻击分开', () => {
  // 雪猎“不攻击时装填”仍能普攻；ATK>0、5%保底>0→普通/技能DPS均>0。
  const hunter = calculate(input('雪猎'));
  expect(hunter.normal.dps).toBeGreaterThan(0);
  expect(hunter.skill!.dps).toBeGreaterThan(0);
  // 玛恩纳通常不攻击→普通0；技能2进入攻击状态→物理伤害且保底>0。
  const mlynar = calculate(input('玛恩纳', 1));
  expect(mlynar.normal.dps).toBe(0);
  expect(mlynar.skill!.components[0].damageType).toBe('physical');
  expect(mlynar.skill!.dps).toBeGreaterThan(0);
  // 圣聆初雪技能2激活攻击→法术伤害>0；普通状态0。
  const priestess = calculate(input('圣聆初雪', 1));
  expect(priestess.normal.dps).toBe(0);
  expect(priestess.skill!.components[0].damageType).toBe('arts');
  expect(priestess.skill!.dps).toBeGreaterThan(0);
  // 卡涅利安S2一份技力就能开启，第二份只增强同一次技能。平时停攻，开技后造成法伤。
  const carnelian = calculate(input('卡涅利安', 1));
  expect(carnelian.lifecycle).toBe('timed');
  expect(carnelian.normal.dps).toBe(0);
  expect(carnelian.skill?.components[0].damageType).toBe('arts');
});
it('工匠辅助普攻按物理防御计算', () => {
  // 罗比菈塔ATK取生成面板A，目标DEF1000→每击max(0.05A,A−1000)，不能用RES25乘0.75。
  const result = calculate(input('罗比菈塔', 0));
  expect(result.normal.components[0].damageType).toBe('physical');
  close(result.normal.components[0].perHit, Math.max(result.normal.stats.atk * 0.05, result.normal.stats.atk - 1000));
});
it('慕斯炸毛的40秒技能期按固定连击序列积分', () => {
  const oneHit = 626.6086956521739 * 1.45 * .75, interval = 38 / 30;
  // 首轮50秒开、90秒结束。第k个完整攻击间隔用天赋序列第k项，开技继承普攻进度。
  let dealt = 0;
  for (let k = Math.floor(50 / interval); k * interval < 90; k++) {
    const overlap = Math.min((k + 1) * interval, 90) - Math.max(k * interval, 50);
    dealt += oneHit * (1 + Number(swiftSucceeds(k, .2, 1))) * overlap / interval;
  }
  const result = calculate(input('慕斯', 1));
  close(result.skill!.components[0]!.perHit, oneHit);
  close(result.skill!.dps, dealt / 40);
  expect(result.ignoredKeys).toContain('skill:skchr_frncat_2:def');
});
it('纯防御技能可exact，全局装备与Boss注意事项不降低局部精度', () => {
  // 拜松a防御强化、天赋均为己方防御；三个阻挡容量不影响单体伤害。
  const config = { ...input('拜松', 0), tier: 'a' as const };
  const base = calculate(config);
  const equipped = calculate({ ...config, equips: ['chess_item_3_11_e_a'] });
  expect(base.accuracy).toBe('exact');
  expect(base.notes).toEqual([]);
  expect(base.caveats.length).toBeGreaterThan(0);
  expect(equipped.accuracy).toBe('exact');
  expect(equipped.ignoredKeys.some(k => k.endsWith(':def'))).toBe(true);
});

const swiftMeal = ['chess_item_3_04_e_a', 'chess_item_6_03_e_a'];
const swift = (stacks: number) => [{ bondId: 'swiftShip', stacks, activeChars: 2 }];

it.each([[0, .2], [20, .27], [40, .34], [229, 1]])('蓝毒迅捷成员强力击，%i层按完整普攻次数计算', (stacks, p) => {
  const result = calculate({ ...input('蓝毒', 0), bossId: 'boss_2', equips: swiftMeal, bonds: swift(stacks) });
  // 精锐S1消耗3。成功立即续开，失败需要3次普攻，两种分支都包含1次技能攻击。
  // 成功和失败的等待分别是0或3个普攻间隔，只有满概率时每轮都能直接接强力击。
  const interval = result.normal.stats.attackInterval;
  close(result.cycle!.skillDurationSec, interval);
  if (p === 1) close(result.cycle!.spRecoverSec, 0);
  else {
    expect(result.cycle!.spRecoverSec).toBeGreaterThan(0);
    expect(result.cycle!.spRecoverSec).toBeLessThan(3 * interval);
    expect(result.cycle!.avgDps).toBeLessThan(result.skill!.dps * .95);
  }
  close(result.cycle!.avgDps, result.totalDamage.value / 30);
  // 作战粮使部署时已有一次强力击。高频轴上成功接下一次强力击，失败先打三次普攻；最后一段按窗口截断。
  let skillSeconds = 0;
  let cast = 0;
  for (let t = 0; t < 30; cast++) {
    skillSeconds += Math.min(interval, 30 - t);
    const draw = (.5 + cast * (Math.sqrt(5) - 1) / 2) % 1;
    t += interval * (draw < p ? 1 : 4);
  }
  close(result.totalDamage.value, skillSeconds * result.skill!.dps + (30 - skillSeconds) * result.normal.dps);
});

it.each([[0, .2, 12], [229, 1, 27]])('蓝毒迅捷成员自然回复，%i层的循环与首轮库存分开计算', (stacks, p, refund) => {
  const result = calculate({ ...input('蓝毒', 1), bossId: 'boss_2', equips: swiftMeal, bonds: swift(stacks), durationSec: 100 });
  if (p === 1) close(result.cycle!.spRecoverSec, 50 - refund);
  close(result.cycle!.avgDps, result.totalDamage.value / 100);
  // 作战粮共给6初始技力，首轮24..50。失败时100秒再开，成功时100−R秒再开。
  const skillSec = 26 + p * Math.min(26, refund);
  close(result.totalDamage.value, (100 - skillSec) * result.normal.dps + skillSec * result.skill!.dps);
});

it('玛恩纳独立时间轴保留0层非成员的结果，40层按休整时长分别计伤', () => {
  const config = { ...input('玛恩纳', 1), bossId: 'boss_2', durationSec: 62 };
  const base = calculate(config);
  const inactive = calculate({ ...config, bonds: swift(0) });
  expect(inactive.cycle).toEqual(base.cycle);
  expect(inactive.totalDamage.value).toBe(base.totalDamage.value);
  expect(inactive.killTimeSec).toBe(base.killTimeSec);
  const certain = calculate({ ...config, bonds: swift(229) });
  const mixed = calculate({ ...config, bonds: swift(40) });
  close(certain.cycle!.spRecoverSec, 15);
  // 只出现一次影响当前窗口的判定（第0次）。缩短休整使第二轮更早开始，特性沿用上限。
  expect(certain.totalDamage.value).toBeGreaterThan(base.totalDamage.value);
  close(mixed.totalDamage.value, .34 * certain.totalDamage.value + .66 * base.totalDamage.value);
  close(mixed.cycle!.avgDps, mixed.totalDamage.value / 62);
});

it.each([['蓝毒', 1], ['慕斯', 1]] as const)('铳隐秘核心对%s的普攻与技能默认减伤80%，关闭后等同普通铳', (name, index) => {
  const boss = (bosses as BossData[]).find(b => b.bossId === 'boss_9')!;
  const shield = boss.mechanics!.find(mechanic => mechanic.effect?.damageTakenScale === .2)!;
  const config = { ...input(name, index), bossId: boss.bossId };
  const normal = calculate({ ...config, bossId: 'boss_2' });
  const on = calculate(config);
  const off = calculate({ ...config, bossMechanics: { [shield.id]: false } });
  for (const [lhs, rhs, enabled] of [[on, normal, true], [off, normal, false]] as const) {
    const scale = enabled ? .2 : 1;
    close(lhs.normal.dps, scale * rhs.normal.dps);
    close(lhs.skill!.dps, scale * rhs.skill!.dps);
    close(lhs.cycle!.avgDps, scale * rhs.cycle!.avgDps);
    close(lhs.totalDamage.value, scale * rhs.totalDamage.value);
    for (const component of [...lhs.normal.components, ...lhs.skill!.components]) {
      expect(component.derivation.some(step => step.source === 'boss:boss_9:' + shield.id)).toBe(enabled);
    }
  }
});

it('铳隐秘核心只减免玛恩纳三技能的物理部分', () => {
  const hidden = calculate({ ...input('玛恩纳', 2), bossId: 'boss_9' }).skill!;
  const normal = calculate({ ...input('玛恩纳', 2), bossId: 'boss_2' }).skill!;
  for (const type of ['physical', 'true'] as const) {
    const value = normal.components.find(c => c.damageType === type)!.dps;
    expect(value).toBeGreaterThan(0);
    close(hidden.components.find(c => c.damageType === type)!.dps, value * (type === 'physical' ? .2 : 1));
  }
});

it('绝技使强力击消耗变为2.1，迅捷失败后仍要三次普攻', () => {
  const result = calculate({
    ...input('蓝毒', 0), bossId: 'boss_2', equips: swiftMeal,
    bonds: [...swift(20), { bondId: 'suntShip', stacks: 0, activeChars: 5 }],
  });
  // 消耗 3×0.7=2.1：成功回 12 即可续开；失败仍要 ceil(2.1)=3 次普攻。各轮平均落在 0 与 3 个间隔之间。
  const interval = result.normal.stats.attackInterval;
  expect(result.cycle!.spRecoverSec).toBeGreaterThan(0);
  expect(result.cycle!.spRecoverSec).toBeLessThan(3 * interval + 1e-9);
  const sampled = result.cycle!.spRecoverSec / (3 * interval);
  // 失败比例接近 1−.27=.73。
  expect(Math.abs(sampled - .73)).toBeLessThan(.15);
});
