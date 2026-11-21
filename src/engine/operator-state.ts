import meta from '../data/generated/meta.json' with { type: 'json' };
import type {
  AttributeSet, CalcInput, DerivationStep, GameDataMeta, OperatorData, OperatorTierData,
  PotentialStep, TalentData, TokenData, TokenTierData,
} from './types.ts';

const cultivation = (meta as GameDataMeta).cultivation;
const cultivationNames: Record<number, string> = { 1: '未精英化', 1001: '精一', 2001: '精二', 2060: '精二 60 级' };

function talentChanges(base: TokenTierData, patch: Pick<PotentialStep, 'trait' | 'talents'>) {
  const changes: Pick<TokenTierData, 'trait' | 'talents'> = {};
  if (patch.trait !== undefined) changes.trait = patch.trait === null ? null : { ...base.trait, ...patch.trait } as TalentData;
  if (patch.talents) {
    const talents: (TalentData | null)[] = [...base.talents ?? []];
    for (const [slot, value] of Object.entries(patch.talents)) {
      talents[+slot] = value === null ? null : { ...talents[+slot], ...value } as TalentData;
    }
    changes.talents = talents.filter((talent): talent is TalentData => talent !== null);
  }
  return changes;
}

function withModule<T extends TokenTierData>(base: T, id: string): T {
  const patch = base.uniEquipVariants?.[id];
  if (!patch) return base;
  const { attributes, talents, trait, ...fields } = patch;
  return { ...base, ...fields, attributes: attributes ? { ...base.attributes, ...attributes } : base.attributes,
    ...talentChanges(base, { talents, trait }) };
}

function withPotential<T extends OperatorTierData | TokenTierData>(base: T, rank: number): T {
  let state = base;
  for (const step of base.potentialSteps ?? []) {
    if (step.rank > rank) break;
    state = { ...state, ...talentChanges(state, step) };
    if (step.attributes) {
      state.attributes = { ...state.attributes };
      for (const [key, delta] of Object.entries(step.attributes)) state.attributes[key as keyof AttributeSet] += delta;
    }
  }
  return state;
}

export function resolveOperatorState(operator: OperatorData, input: Pick<CalcInput, 'tier' | 'diyShopLevel' | 'potential' | 'cultivation' | 'uniEquipId'>) {
  const variant = operator.diy && input.diyShopLevel === 5 && operator.diyVariants?.[5];
  if (variant) operator = { ...operator, shopLevel: 5, tiers: variant };
  let base = operator.tiers[input.tier];
  const options = input.tier === 'b' && base.uniEquipLevel > 0 ? operator.uniEquips : undefined;
  const module = options?.find(option => option.uniEquipId === input.uniEquipId) ?? options?.find(option => option.uniEquipId === base.uniEquipId);
  if (module && module.uniEquipId !== base.uniEquipId) base = { ...withModule(base, module.uniEquipId), uniEquipId: module.uniEquipId };
  const rank = input.potential ?? base.potentialRank;
  if (!Number.isInteger(rank) || rank < 0 || rank > 5) throw new RangeError('潜能索引必须是 0 至 5 的整数');
  const steps: DerivationStep[] = [];
  if (module) {
    steps.push({ label: `模组：${module.typeIcon} ${base.uniEquipLevel} 级`, op: 'info', value: base.uniEquipLevel, source: module.uniEquipId });
    if (module.attrOnly) steps.push({ label: `${module.typeIcon === 'RA-A' ? '生息演算' : '集成战略'}模组：仅计属性`, op: 'info', value: base.uniEquipLevel, source: module.uniEquipId });
  }
  if (variant && input.tier === 'b') {
    steps.push({ label: `5 阶自选：模组 ${base.uniEquipLevel} 级`, op: 'info', value: base.uniEquipLevel, source: base.chessId });
  }
  let tier = base;
  if (rank !== base.potentialRank) {
    tier = { ...withPotential(base, rank), potentialRank: rank };
    const delta = tier.attributes.atk - base.attributes.atk;
    steps.push({ label: `自身潜能：${rank + 1} 潜`, op: delta ? 'add' : 'info', value: delta || rank + 1, source: `potential:${operator.charId}:${rank}` });
  }
  if (input.cultivation !== undefined) {
    const mul = cultivation[input.cultivation];
    if (!mul) throw new RangeError(`未知自身练度：${input.cultivation}`);
    if (mul.atk !== 1 || mul.def !== 1 || mul.maxHp !== 1) {
      // 本季档位见 PRTS 模拟配置；幽灵鲨实测 547×1.1×1.14，练度先乘基础面板。
      // https://prts.wiki/w/卫戍协议·规程#模拟配置  https://www.bilibili.com/opus/1136643681679310855
      const a = tier.attributes;
      tier = { ...tier, attributes: { ...a, atk: a.atk * mul.atk, def: a.def * mul.def, maxHp: a.maxHp * mul.maxHp } };
      steps.push({ label: `自身练度：${cultivationNames[input.cultivation]} 攻击 ×${mul.atk}`, op: 'mul', value: mul.atk, source: `cultivateEffectList:${input.cultivation}` });
    }
  }
  return { operator, tier, baseAtk: base.attributes.atk, steps };
}

/** 召唤物按主人选中的模组、潜能取自己的面板和天赋。借用主人攻击力的伤害由干员模型处理。 */
export function resolveTokenTier(token: TokenData, operator: OperatorData, tier: OperatorTierData): TokenTierData | undefined {
  const key = tier.chessId.endsWith('_b') ? 'b' : 'a';
  const variant = operator.diy ? token.diyVariants?.[operator.shopLevel]?.[key] : undefined;
  const base = variant ?? token.tiers[key];
  if (!base) return;
  const selected = key === 'b' && tier.uniEquipId ? withModule(base, tier.uniEquipId) : base;
  return tier.potentialRank === operator.tiers[key].potentialRank ? selected : withPotential(selected, tier.potentialRank);
}
