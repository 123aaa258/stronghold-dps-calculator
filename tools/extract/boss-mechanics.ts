import type { BossData, BossMechanic, BossMechanicEffect, DamageType } from '../../src/engine/types.ts';

const physArts: DamageType[] = ['physical', 'arts'];
const allDamage: DamageType[] = ['physical', 'arts', 'true', 'elemental'];
const pct = (ratio: number) => `${Number((ratio * 100).toFixed(4))}%`;
const taken = (damageTakenScale: number, damageTypes = physArts): BossMechanicEffect => ({ damageTakenScale, damageTypes });

// 触发条件来自锁定版图鉴；黑板只给参数。逐条记录实际生效的关卡覆盖或数据库字段。
export function bossMechanics(boss: BossData, abilities: BossData['abilities'], handbookId: string): BossMechanic[] {
  const handbook = `excel/enemy_handbook_table.json:enemyData.${handbookId}.abilityList`;
  const sources = new Set<string>();
  const result: BossMechanic[] = [];
  function value(key: string, skill?: string): number {
    const suffix = skill ? `:skill:${skill}` : ':talentBlackboard';
    const ability = abilities.find(a => a.key?.endsWith(suffix));
    const n = ability?.blackboard?.nums[key];
    if (n === undefined) throw new Error(`${boss.bossId} 缺少机制字段 ${suffix}.${key}`);
    sources.add(`${ability!.key}.${key}`);
    return n;
  }
  function add(id: string, name: string, desc: string, effect: BossMechanicEffect | null = null, defaultOn = false, extra?: string) {
    result.push({ id, name, desc, effect, defaultOn, source: [handbook, ...sources, ...(extra ? [extra] : [])].join('；') });
    sources.clear();
  }
  switch (boss.bossId) {
    case 'boss_1':
    case 'boss_8': {
      const threshold = value('1.hp_ratio'), scale = value('1.damage_scale');
      add('low_hp_armor', '残血甲胄', `生命低于${pct(threshold)}时，物理和法术伤害降至${pct(scale)}。默认按高血量计算，开启可查看残血阶段。`, taken(scale));
      // PRTS 对死亡集群的实测明确了 hp_ratio 对应无人机死亡时的反馈伤害。
      add('drone_feedback', '死亡集群', `击落召唤的无人机会使胄受到其最大生命值${pct(value('hp_ratio', '2'))}的真实伤害。单体计算只统计直接攻击胄的伤害。`, null, false, 'https://prts.wiki/w/假想敌：胄');
      if (boss.hidden) add('linked_weapons', '旧日的剑与锤', '剑与锤初始无敌，飞行中可被击落。击落后攻击部件会使胄流失生命，社区实测为等量传递。单体计算只统计直接攻击本体的伤害。', null, false, 'enemy_handbook_table.json:enemy_9014_acstma、enemy_9015_acstmb；https://prts.wiki/w/斩胄之剑');
      break;
    }
    case 'boss_2':
      add('charge', '最终之罚', '冲锋时无法被阻挡。计算按干员能持续攻击本体处理。');
      break;
    case 'boss_9': {
      const scale = value('4.damage_scale');
      // 图鉴明确减伤类型；其他铳或簧在场的检测条件见 PRTS 的实测说明。
      add('core_damage_scale', '本体减伤', `隐秘核心有其他假想敌：铳或碎铳之簧在场时，本体受到的物理和法术伤害降至${pct(scale)}，默认近似按连结单位在场计算。场上只剩本体时关闭。`, taken(scale), true, 'https://prts.wiki/w/假想敌：铳');
      add('spring_link', '盲信之誓', '受击的碎铳之簧可向本体传伤，社区实测本体流失等量生命。末日布道期间移动中的簧免疫伤害。计算只统计直接攻击本体的伤害。', null, false, 'https://prts.wiki/w/碎铳之簧');
      break;
    }
    case 'boss_3':
    case 'boss_10': {
      const high = value('1.acduml_t_1[high_hp].interval'), low = value('1.acduml_t_1[low_hp].interval'), hp = value('1.hp_ratio');
      add('echo', '召唤余音', `生命低于${pct(hp)}后，余音召唤间隔从${high}秒缩短至${low}秒。计算假定干员始终攻击管。`);
      if (boss.hidden) add('invincible_string', '假想敌：弦', '弦与管一同在场。弦永久无敌，管被击倒时弦退场。计算只选取管作为目标。', null, false, 'enemy_handbook_table.json:enemy_9022_acdumm');
      break;
    }
    case 'boss_4': {
      const first = value('growup1.interval'), second = value('growup2.interval');
      add('growth', '阶段变化', `损失生命超过${pct(value('growup1.hp_ratio'))}或经过${first}秒时进入第二阶段；下一阶段的生命损失步长为${pct(value('growup2.hp_ratio'))}，计时参数为${second}秒。阶段改变其攻击和技能，沿用本体防御和法术抗性面板。`);
      add('tentacle', '断裂生殖', '召唤子代缠绕干员，晕眩会打断输出。计算按干员持续攻击处理。');
      break;
    }
    case 'boss_6': {
      const hp = value('advance.hp_ratio'), def = value('advance.def'), res = value('advance.magic_resistance');
      add('advance', '半血强化', `生命降至${pct(hp)}及以下后，防御提升${pct(def)}，法术抗性增加${res}。默认按高血量面板计算。`, { defScale: 1 + def, resAdd: res });
      const barrier = value('dynamic', 'store'), reduction = value('damage_resistance', 'store');
      // PRTS「莫非王土」的实测将 store 黑板对应到活化防护背心及盾侧；数据未区分元素伤害。
      add('vest_guard', '防护背心', `活化防护背心时获得${barrier}点屏障；屏障存在时，来自盾侧的伤害降低${pct(reduction)}。默认关闭，开启近似模拟持续从盾侧攻击期间的物理、法术及真实伤害；屏障消耗和元素伤害适用性未计入。`, { damageTakenScale: 1 - reduction }, false, 'https://prts.wiki/w/阿利斯泰尔，帝国余晖');
      break;
    }
    case 'boss_7': {
      const reduction = value('Madness.damage_resistance');
      add('madness', '半血减伤', `生命低于一半时，受到的物理和法术伤害降低${pct(reduction)}。默认按高血量计算，开启可查看低血量阶段。`, taken(1 - reduction));
      add('lasso', '自然涌动', '被选中的干员会晕眩，半血后额外选取目标。计算假定干员能持续攻击。');
      break;
    }
    case 'boss_11':
    case 'boss_14': {
      const scale = value('Armor.damage_scale');
      const trigger = boss.hidden ? '登场即召唤冲击之械进入护甲形态，撞回本体可解除护甲' : `生命低于${pct(value('Armor.hp_ratio'))}时召唤冲击之械进入护甲形态`;
      // PRTS 战斗记录补充了无来源伤害、横坐标及伤害类型判定（含元素伤害，非元素损伤积累）。
      add('directional_armor', '冲击之械护甲', `${trigger}。护甲使无来源伤害及来自不同列的伤害降至${pct(scale)}。默认关闭，开启近似模拟所有伤害均满足方向条件。`, taken(scale, allDamage), false, 'https://prts.wiki/w/假想敌：械');
      if (boss.hidden) add('impact_zone', '威光冲击', '两台冲击之械之间的干员攻击速度降低。单体计算按干员位于减速区外处理。', null, false, 'enemy_handbook_table.json:enemy_9027_acfnca');
      break;
    }
    case 'boss_12':
    case 'boss_15': {
      const hp = value('Evade.hp_ratio'), chance = value('Evade.prob'), duration = value('Evade.duration');
      add('evade', '伪装闪避', `每损失${pct(hp)}最大生命值，进入${duration}秒伪装，物理与法术闪避率为${pct(chance)}。默认按伪装外计算，开启按该阶段可被闪避的伤害取期望。`, taken(1 - chance));
      add('web', '淤困捕食', '淤困之茧捆绑干员，使其无法攻击、阻挡或开启技能。计算按干员未被捆绑处理。');
      if (boss.hidden) add('acid_rain', '悲惨之雨', `酸雨持续${value('duration', 'AcidRain')}秒，场内干员攻速降低${-value('attack_speed', 'AcidRain')}。计算按干员位于酸雨外处理。`);
      break;
    }
    case 'boss_13':
    case 'boss_16': {
      const reduction = value('damage_resistance', 'ShieldGen');
      add('unblocked_shield', '未阻挡护盾', `未被阻挡时获得护盾，物理与法术伤害降低${pct(reduction)}；被阻挡后消耗护盾。默认按已阻挡计算，开启可查看未阻挡阶段。`, taken(1 - reduction));
      break;
    }
    case 'boss_17': {
      const low = value('Huge.enemy_dyjsfg_low_damage_resistance.damage_resistance');
      add('might', '明力', `阻挡或停止移动时，物理和法术伤害降低${pct(low)}。默认按此状态计算。`, taken(1 - low), true);
      const high = value('Huge.enemy_dyjsfg_high_damage_resistance.damage_resistance');
      add('moving_might', '移动中的明力', `未被阻挡且移动时，物理和法术总减伤提升至${pct(high)}。默认关闭；计算移动状态时同时开启明力与本项。`, taken((1 - high) / (1 - low)));
      break;
    }
  }
  return result;
}
