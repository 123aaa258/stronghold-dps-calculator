# 数据提取报告

来源：[Kengxxiao/ArknightsGameData](https://github.com/Kengxxiao/ArknightsGameData/tree/7e560050b03c34661db1d322d008733072352b2a/zh_CN/gamedata)

锁定 commit：`7e560050b03c34661db1d322d008733072352b2a`；数据版本：`79.4.0`；活动：`act3autochess/V3_1`。

运行 `npm run data` 提取数据，运行 `npm run assets` 获取素材。

## 数据数量

| 数据 | 数量 |
|---|---:|
| operators | 147 |
| garrisons | 329 |
| tokens | 34 |
| ranges | 46 |
| skills | 402 |
| bonds | 26 |
| equips | 116 |
| bosses | 16 |
| modes | 25 |

DIY/空槽共 12 个，包括 `chess_char_5_diy1_a`、`chess_char_5_diy2_a`、`chess_char_5_diy3_a`、`chess_char_5_diy4_a`、`chess_char_5_diy5_a`、`chess_char_5_diy6_a`、`chess_char_6_diy1_a`、`chess_char_6_diy2_a`、`chess_char_6_diy3_a`、`chess_char_6_diy4_a`、`chess_char_6_diy5_a`、`chess_char_6_diy6_a`。

自选干员包括赤刃明霄陈、丰川祥子、望、维什戴尔。五费与六费自选分别取对应的棋子状态，精锐模组分别为 1 级与 3 级。

五费阿米娅的 tmplId 指向医疗模板 char_1037_amiya3，职业、属性、技能和素材都使用该模板。四档练度倍率来自 autoChessData.cultivateEffectList 关联的 char_attribute_mul 黑板，见 meta.json。

## 精锐模组自选

从 uniequip_table.charEquip 按模板和游戏顺序读取，排除 INITIAL。共 209 个选项，142 名干员有模组，其中 55 名有多个。ISW-A 与 RA-A 共 12 个，仅使用干员和召唤物的属性黑板。

先取当前费用阶的精锐状态，再取 uniEquipVariants[模组 ID]。属性按键覆盖为绝对值，特性与天赋槽按字段覆盖（blackboard 整体替换，null 删除）。同一补丁的天赋槽全部合并后再移除空槽。potentialSteps 存在时整表替换，再按所选潜能执行。缺省字段继承本费用阶的默认模组。召唤物使用相同规则。普通阶没有模组覆盖。

仅属性模组的特性、天赋及潜能覆盖用于还原无模组状态。空弦精锐 1 级模组的攻击均为 427 + (528 − 427) × 59 / 89 + 32 ≈ 525.9551。ISW-A 攻速 106，MAR-X 攻速 100、生命额外 +90。

## Boss 属性与映射

通过 autoChessData.bossInfoDict[bossId].enemyId 映射；有面板 16/16，verified=true 0/16。

| Boss | 敌人 | 面板 | verified |
|---|---|---|---|
| boss_1 假想敌：胄 | enemy_9013_acstmk | DEF 1000 / RES 25 | false |
| boss_2 假想敌：铳 | enemy_9017_achunt | DEF 1100 / RES 60 | false |
| boss_3 假想敌：管 | enemy_9021_acduml | DEF 700 / RES 50 | false |
| boss_4 盐风主教昆图斯 | enemy_1521_dslily | DEF 500 / RES 40 | false |
| boss_6 阿利斯泰尔，帝国余晖 | enemy_9032_aclionk | DEF 1030 / RES 20 | false |
| boss_7 “萨米的意志” | enemy_9033_acdeer | DEF 500 / RES 35 | false |
| boss_8 假想敌：胄 | enemy_9013_acstmk_2 | DEF 1200 / RES 30 | false |
| boss_9 假想敌：铳 | enemy_9017_achunt_2 | DEF 1100 / RES 60 | false |
| boss_10 假想敌：管 | enemy_9021_acduml_2 | DEF 700 / RES 50 | false |
| boss_11 假想敌：械 | enemy_9029_acfnc | DEF 600 / RES 30 | false |
| boss_12 假想敌：茧 | enemy_9035_acspider | DEF 800 / RES 30 | false |
| boss_13 假想敌：鳍 | enemy_9037_aceel | DEF 600 / RES 30 | false |
| boss_14 假想敌：械 | enemy_9029_acfnc_2 | DEF 600 / RES 30 | false |
| boss_15 假想敌：茧 | enemy_9035_acspider_2 | DEF 800 / RES 30 | false |
| boss_16 假想敌：鳍 | enemy_9037_aceel_2 | DEF 600 / RES 30 | false |
| boss_17 矩兽 | enemy_2124_dyjsfg | DEF 1000 / RES 10 | false |

完整来源见 bosses.json.attributeSource；每个模式的缺关卡、修饰器和差异列在下文。

## 装备、模组和技力

装备名称取 character_table[trapId].name（profession=TRAP），缺失时取 effectInfoDataDict[effectId].effectName 并报告；当前使用的来源与覆盖数见问题列表。

实际应用模组 target：`DISPLAY`、`TALENT`、`TALENT_DATA_ONLY`、`TRAIT`、`TRAIT_DATA_ONLY`。

- TALENT：talentIndex≥0 替换对应天赋；负数为新增运行时天赋，保留 prefabKey。
- TRAIT：合并特性描述、替换参数；保留未改的 prefabKey/rangeId。
- TALENT_DATA_ONLY / TRAIT_DATA_ONLY：按键替换参数，保留未提供的原始字段，不进行数值相加。
- DISPLAY：仅合并显示描述，不把空 blackboard 覆盖运行时参数。
- isToken：修正对应召唤物，tiers 分别保存。

技能 spType 原值：`number:8`、`string:INCREASE_WHEN_ATTACK`、`string:INCREASE_WHEN_TAKEN_DAMAGE`、`string:INCREASE_WITH_TIME`。

| 原值 | SpType |
|---|---|
| INCREASE_WITH_TIME / 1 | INCREASE_WITH_TIME |
| INCREASE_WHEN_ATTACK / 2 | ON_ATTACK |
| INCREASE_WHEN_TAKEN_DAMAGE / 4 | ON_DEFEND |
| 8 / PASSIVE | PASSIVE |
| 其他 | UNKNOWN（报告） |

## 图片来源、覆盖率与缺图

来源配置（锁定资源 commit 和路径模板）：

```json
{
  "gameResource": {
    "repository": "yuanyan3060/ArknightsGameResource",
    "commit": "4757eb5bb92366125aaf03ae0bdd42841d42c333",
    "reference": "https://github.com/yuanyan3060/ArknightsGameResource/commits/main/"
  },
  "autochess": {
    "repository": "ArknightsAssets/ArknightsAssets2",
    "commit": "a2d87c86fe4b4dd8b818ffe05b6c1ae2ad65e8ff",
    "reference": "https://github.com/ArknightsAssets/ArknightsAssets2/commits/cn"
  },
  "gameResourceUpdated": {
    "repository": "yuanyan3060/ArknightsGameResource",
    "commit": "18e73996a5a16f78a0af7773a2d2a0f4991ac6ba",
    "reference": "https://github.com/yuanyan3060/ArknightsGameResource/commits/main/"
  },
  "autochessUpdated": {
    "repository": "ArknightsAssets/ArknightsAssets2",
    "commit": "727b9742c9f09db96e5365edfda5188752a8ab5e",
    "reference": "https://github.com/ArknightsAssets/ArknightsAssets2/commits/cn"
  }
}
```

| 类别 | 有图 / 总数 | 缺失 |
|---|---:|---:|
| 干员头像 | 147 / 147 | 0 |
| 干员立绘 | 146 / 147 | 1 |
| Boss | 16 / 16 | 0 |
| 盟约 | 26 / 26 | 0 |
| 装备 | 116 / 116 | 0 |

缺图逐条清单：

- portrait `char_618_acrbot` “暴躁铁皮”：所有明确候选图片均为 HTTP 404/410

## 缺字段、待核对项与跨模式差异

- char_4165_ctrail b 阶 equipLevel=1 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级
- char_4222_taraxa b 阶 equipLevel=1 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级
- char_4230_mcnist b 阶跳过限定模组部件 DISPLAY/data_only：validInGameTag=null，validInMapTag=rogue_6，当前 act3autochess 不确认满足
- char_4230_mcnist b 阶跳过限定模组部件 TALENT/mcnist_equip_1_3_p2：validInGameTag=null，validInMapTag=rogue_6，当前 act3autochess 不确认满足
- char_4230_mcnist b 阶跳过限定模组部件 TALENT/mcnist_equip_1_3_p3：validInGameTag=null，validInMapTag=rogue_6，当前 act3autochess 不确认满足
- char_4230_mcnist b 阶跳过限定模组部件 TALENT_DATA_ONLY/data_only：validInGameTag=null，validInMapTag=rogue_6，当前 act3autochess 不确认满足
- char_4231_clemnt b 阶 equipLevel=3 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级
- char_4244_tocka b 阶 equipLevel=1 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级
- char_4247_oxi b 阶 equipLevel=3 但 defaultUniEquipId=null，无模组属性可叠加，保留原始等级
- 缺召唤物 char_1045_svash2 -> token_10057_svash2_eagle
- 装备 chess_item_6_05_e_a（驱逐者防暴装备）后缀为 a，但 isGolden=true；tier 按 ID 后缀提取
- 装备 chess_item_6_06_e_a（不退者卫护系统）后缀为 a，但 isGolden=true；tier 按 ID 后缀提取
- 装备 chess_item_6_08_e_a（动能轰击弩）后缀为 a，但 isGolden=true；tier 按 ID 后缀提取
- 装备 chess_item_6_10_e_a（汲取者之镰）后缀为 a，但 isGolden=true；tier 按 ID 后缀提取
- 装备 chess_item_6_12_e_a（天马之耀）后缀为 a，但 isGolden=true；tier 按 ID 后缀提取
- 装备名称来源：character_table[trapId].name 116 条，effectInfoDataDict[effectId].effectName 0 条
- boss_1: level 0 未定义字段使用序列化默认值，语义待核对：epDamageResistance, epResistance, teleportImmune, groundBoundImmune
- boss_2: level 0 未定义字段使用序列化默认值，语义待核对：attractImmune, teleportImmune, groundBoundImmune
- boss_2: 跨模式 talent/skills 不一致，全部原始配置按来源保留 abilities：levels/activities/act3autochess/level_act3autochess_h07_02_s.json [mode_single_funny, mode_single_1, mode_single_2, mode_single_3, mode_single_4, mode_single_5, mode_single_6, mode_single_7, mode_single_8, mode_single_9, mode_single_10, mode_single_11, mode_single_12, mode_single_13, mode_single_14, mode_single_15, mode_single_16, mode_single_17, mode_single_18, mode_single_19, mode_single_20]; levels/activities/act3autochess/level_act3autochess_h07_02.json [mode_multi_funny, mode_multi_normal, mode_multi_hard, mode_multi_abyss]
- boss_3: level 0 未定义字段使用序列化默认值，语义待核对：attractImmune, teleportImmune, groundBoundImmune
- boss_4: level 0 未定义字段使用序列化默认值，语义待核对：epDamageResistance, epResistance, palsyImmune, teleportImmune, groundBoundImmune
- boss_6: level 0 未定义字段使用序列化默认值，语义待核对：palsyImmune, teleportImmune, groundBoundImmune
- boss_7: level 0 未定义字段使用序列化默认值，语义待核对：epDamageResistance, epResistance, palsyImmune, teleportImmune, groundBoundImmune
- boss_8: level 0 未定义字段使用序列化默认值，语义待核对：epDamageResistance, epResistance, teleportImmune, groundBoundImmune
- boss_9: level 0 未定义字段使用序列化默认值，语义待核对：attractImmune, teleportImmune, groundBoundImmune
- boss_9: 跨模式 talent/skills 不一致，全部原始配置按来源保留 abilities：levels/activities/act3autochess/level_act3autochess_h08_02.json [mode_multi_normal, mode_multi_hard, mode_multi_abyss]; levels/activities/act3autochess/level_act3autochess_h08_02_s.json [mode_single_5, mode_single_6, mode_single_7, mode_single_8, mode_single_9, mode_single_10, mode_single_11, mode_single_12, mode_single_13, mode_single_14, mode_single_15, mode_single_16, mode_single_17, mode_single_18, mode_single_19, mode_single_20]
- boss_10: level 0 未定义字段使用序列化默认值，语义待核对：attractImmune, teleportImmune, groundBoundImmune
- boss_11: level 0 未定义字段使用序列化默认值，语义待核对：disarmedCombatImmune
- boss_12: level 0 未定义字段使用序列化默认值，语义待核对：disarmedCombatImmune, groundBoundImmune
- boss_13: level 0 未定义字段使用序列化默认值，语义待核对：groundBoundImmune
- boss_14: level 0 未定义字段使用序列化默认值，语义待核对：disarmedCombatImmune
- boss_15: level 0 未定义字段使用序列化默认值，语义待核对：disarmedCombatImmune, groundBoundImmune
- boss_16: level 0 未定义字段使用序列化默认值，语义待核对：groundBoundImmune
- boss_17: level 0 未定义字段使用序列化默认值，语义待核对：epDamageResistance, epResistance, teleportImmune, groundBoundImmune

## 尚未识别语义的 blackboard key

仅清点盟约/装备参数；不声称任何 key 已有伤害模型。

### bonds

`ab_buff_duration_base`、`ab_buff_duration_max`、`ab_buff_duration_per_stack`、`abnormal_buff_count_limit`、`act3autochess_bond_eff_iberia[enemy][speed].max_stack_cnt`、`act3autochess_bond_eff_iberia[enemy][speed].move_speed`、`act3autochess_bond_eff_iberia[enemy][speed].speed_duration`、`act3autochess_bond_eff_lethania[enemy].atk_base`、`act3autochess_bond_eff_lethania[enemy].atk_per_stack`、`act3autochess_bond_eff_lethania[enemy].big_prob_base`、`act3autochess_bond_eff_lethania[enemy].big_prob_max`、`act3autochess_bond_eff_lethania[enemy].big_prob_per_stack`、`act3autochess_bond_eff_lethania[enemy].power_bond_char_cnt`、`act3autochess_bond_eff_lethania[enemy].summon_cnt_max_1`、`act3autochess_bond_eff_lethania[enemy].summon_cnt_max_2`、`act3autochess_bond_eff_lethania[enemy].summon_prob_base`、`act3autochess_bond_eff_lethania[enemy].summon_prob_max`、`act3autochess_bond_eff_lethania[enemy].summon_prob_per_stack`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].first_trigger_interval`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].interval`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].magic_damage_base`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].magic_damage_max`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].magic_damage_per_stack`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage].unmovable_duration`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage_2].magic_damage_base`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage_2].magic_damage_max`、`act3autochess_bond_eff_sargon_power[tile_buff][mag_damage_2].magic_damage_per_stack`、`act3autochess_bond_eff_sargon_power[tile_buff][slow].slow_base`、`act3autochess_bond_eff_sargon_power[tile_buff][slow].slow_max`、`act3autochess_bond_eff_sargon_power[tile_buff][slow].slow_per_stack`、`atk`、`atk_base`、`atk_golden_equip`、`atk_normal_equip`、`atk_per_stack`、`atk_scale`、`atk_scale_base`、`atk_scale_per_stack`、`atk_when_born`、`attack_speed_per_stack`、`base_atk`、`base_attack_speed`、`base_damage`、`base_damage_scale`、`base_damage_value`、`base_def`、`base_duration`、`base_ex_damage_scale`、`base_max_atk_when_born`、`base_max_hp`、`base_prob`、`base_time`、`baseprob`、`big_prob_base`、`big_prob_max`、`big_prob_per_stack`、`bleed_duration`、`bond`、`bond_add_type`、`bond_id`、`bond_type`、`cd_duration`、`count`、`damage_one_minus_base`、`damage_one_minus_max`、`damage_one_minus_per_stack`、`damage_per_stack`、`damage_res_base`、`damage_res_per_stack`、`damage_resistance`、`damage_scale`、`damage_scale_extra`、`damage_scale_normal`、`damage_scale_per_stack`、`damage_value`、`damage_value_base`、`damage_value_per_stack`、`def_per_stack`、`discount`、`dot_atk_scale_base`、`dot_atk_scale_per_stack`、`dot_duration`、`duration_per_stack`、`end_duration`、`ep_break_recover_speed_base`、`ep_break_recover_speed_max`、`ep_break_recover_speed_per_stack`、`ep_heal_base`、`ep_heal_per_stack`、`event`、`ex_atk_scale_base`、`ex_atk_scale_max`、`ex_atk_scale_per_stack`、`ex_bond_char_cnt`、`ex_char_cnt`、`ex_damage_duration`、`ex_damage_scale_per_stack`、`fear`、`heal_base`、`heal_per_stack`、`hp_base`、`hp_per_stack`、`key`、`layer`、`layer_list`、`magic_res_add`、`magic_res_max_base`、`magic_res_max_min`、`magic_res_max_per_stack`、`max_atk_when_born_per_stack`、`max_buff_stack_cnt`、`max_free_respawn_cnt`、`max_hp`、`max_hp_per_stack`、`more_layer`、`no_attack_duration`、`normal_sp`、`pool`、`power_atk`、`power_attack_speed`、`power_bond_char_cnt`、`power_bond_stack_cnt`、`power_char_cnt`、`power_def_penetrate`、`power_magic_resist_penetrate`、`power_sp`、`prob`、`prob_base`、`prob_per_stack`、`probk`、`range_radius`、`respawn_time`、`sp`、`sp_ratio`、`summon_cnt_max_1`、`summon_cnt_max_2`、`summon_prob_base`、`summon_prob_max`、`summon_prob_per_stack`、`temp_bond_stack_cnt`、`temp_bond_stack_cnt[power]`、`time_per_stack`、`weak[limit]`

### equips

`ab_buff_duration`、`at_root`、`atk`、`atk_buff_cnt`、`atk_cell`、`atk_per_hammer`、`atk_scale`、`atk_speed_layer_max`、`attack_speed`、`attract_duration`、`big_hammer`、`block_cnt`、`block_cnt_cell`、`can_double`、`check_hp_ratio`、`choice_cnt`、`choice_event`、`cold`、`count`、`damage`、`damage_scale`、`damage_scale_minus`、`def`、`def_cell`、`def_penetrate`、`delta`、`disarmed_duration`、`double_damage`、`duration`、`ex_interval`、`ex_max_hp`、`hammer_1`、`hammer_2`、`hammer_3`、`hammer_4`、`hammer_5`、`have_splash_damage`、`heal_scale`、`hp`、`hp_cell`、`hp_ratio`、`hp_ratio_base`、`hp_recovery_per_sec_by_max_hp_ratio`、`init_max_hp`、`interval`、`key`、`layer`、`layer_max`、`magic_resist_penetrate`、`magic_resistance`、`max`、`max_hp`、`max_layer`、`max_respawn_cnt`、`max_stack_cnt`、`min`、`n`、`one_minus_status_resistance`、`option_count`、`palsy_prob`、`prob`、`radius`、`range_radius`、`refresh_cnt`、`respawn_time`、`select_count`、`silence`、`sp`、`sp_cost_min`、`sp_cost_scale`、`sp_each_person`、`sp_recovery_per_sec`、`splash_cd`、`stun`、`taunt_level`、`temp_stack_count_add`、`temp_stack_count_max`、`undeadable_duration`、`value`

## 面板手算抽查

蓝毒 b：精二 55 级基础 ATK = 438 + (535 − 438) × (55 − 1) / (80 − 1) = 504.3037974683544；信赖 0 → +0；潜能 0 → +0；uniequip_002_bluep 等级 1 → +20；合计 **524.3037974683544**。

逻各斯 b：精二 60 级基础 ATK = 556 + (671 − 556) × 59 / 89 = 632.2359550561798；信赖 +0、潜能 +0、uniequip_003_logos 等级 3 +60；合计 **692.2359550561798**。

## 推断清单

- 基础面板用游戏属性曲线线性插值并保留小数。天赋、卫戍特质、盟约及装备道具的战斗加成在计算时单独处理。
- favorPoint 先用 favor_table.favorFrames 不超过该点数的帧取 battlePhase，再插值 favorKeyFrames。当前固定棋子两阶 favorPoint 全为 0，故信赖加成为 0。
- 潜能缺省取 shop.backupCharPotRank，目前全部为 0。potentialSteps 逐阈值保存固定属性增量和实际生效的天赋、特性字段。费用和再部署时间的潜能变动不参与输出。模组等级取 status.equipLevel。
- 天赋 candidate 按精英化/等级/潜能选择最高满足项；TALENT/TRAIT 为新增或替换，DATA_ONLY 按键覆盖而不相加；DISPLAY 仅合并描述。
- isToken 有 tokenKey 时精确匹配，无 tokenKey 时应用于实际关联召唤物（多召唤物情形逐项报告）；不把召唤物修正加到主人。
- 模组部件带 validInMapTag 或 validInGameTag 限定时跳过该部件，例如机械师的 rogue_6 部件。根级模组属性仍按数据叠加。
- 召唤物的原始空技能槽不生成引用；只有一个 levels 的固定技能保留真实等级 1，各阶通过 skillLevels[skillId] 指向它，多级技能跟随主人技能等级。
- 召唤物的曲线以自身阶段和等级上限截断，依据主人潜能选择召唤物自己的候选及模组部件。TokenData 顶层天赋与范围使用默认费用阶下的最高已提取阶级。
- spType 原值 8 映射 PASSIVE，依据同仓 skill_table 的被动技能记录（例如宴落地技能），保留 spTypeRaw；1/2/4 为位标记对应自动/攻击/受击回复，未知值标 UNKNOWN。
- Boss 等级按 enemy_database level 0→目标等级继承；只有 m_defined=true 的上层字段覆盖。底层未定义的元素/免疫序列化默认值语义待核对，相关 Boss verified=false。
- Boss attributes.maxHp 为关卡敌人面板；hpByMode 为模式血条，两者分开保留。缺部分模式关卡时可保留已解析面板但不视为验证通过。
- 提取流程保留盟约和装备的原始参数。伤害模型覆盖范围见引擎覆盖报告。

## 缓存与素材获取

- fetch-gamedata.ts 通过解析 JSON 校验缓存，下载成功后原子替换失效文件。
- npm run assets 使用 sharp 转码，缺图路径保留为 null。
