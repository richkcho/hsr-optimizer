import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import { spPositiveBufferTendency } from 'lib/autobattle/tendencies/archetypes/spPositiveBuffer'
import { stackDpsTendency } from 'lib/autobattle/tendencies/archetypes/stackDps'
import type {
  BattleState,
  CharacterData,
  ResourceState,
  SlotIndex,
  TeamMember,
  TendencyCtx,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'
import type { CharacterId } from 'types/character'

function makeMember(maxEnergy = 120, characterData: CharacterData = defaultCharacterData): TeamMember {
  return {
    slot: 0,
    characterId: '1000' as CharacterId,
    eidolon: 0,
    lightConeId: '' as TeamMember['lightConeId'],
    lightConeSuperimposition: 1,
    equippedRelics: {},
    path: 'Destruction',
    maxEnergy,
    baseSpd: 100,
    tendency: pureDpsTendency,
    characterData,
    actors: [{ slot: 0, kind: 'primary' }],
  }
}

function makeCtx(opts: {
  sp?: number
  energy?: number
  stacks?: Record<string, number>
  spCostSkill?: number
  member?: TeamMember
}): TendencyCtx {
  const member = opts.member ?? makeMember()
  const resources: ResourceState = {
    skillPoints: opts.sp ?? 5,
    energy: { 0: opts.energy ?? 0 } as Record<SlotIndex, number>,
    stacks: { 0: opts.stacks ?? {} } as Record<SlotIndex, Record<string, number>>,
    fuaTriggerCounters: {} as Record<SlotIndex, Record<string, number>>,
  }
  const state = {
    members: { 0: member } as Record<SlotIndex, TeamMember>,
    resources,
    activeBuffs: [],
  } as unknown as BattleState
  return {
    state,
    self: 0,
    sp: () => resources.skillPoints,
    energy: () => resources.energy[0] ?? 0,
    stacks: (name) => resources.stacks[0]?.[name] ?? 0,
    hasActiveBuff: () => false,
    spCost: (kind) => kind === AbilityKind.SKILL ? (opts.spCostSkill ?? 1) : 0,
    data: () => member.characterData,
  }
}

describe('pureDps tendency', () => {
  test('skill when SP affords', () => {
    const result = pureDpsTendency.decideTurn(makeCtx({ sp: 3 }))
    expect(result.kind).toBe(AbilityKind.SKILL)
  })

  test('basic when SP starved', () => {
    const result = pureDpsTendency.decideTurn(makeCtx({ sp: 0 }))
    expect(result.kind).toBe(AbilityKind.BASIC)
  })

  test('ult when energy full (energy ult)', () => {
    const result = pureDpsTendency.decideUlt(makeCtx({ energy: 120 }))
    expect(result?.kind).toBe(AbilityKind.ULT)
  })

  test('no ult when energy short', () => {
    expect(pureDpsTendency.decideUlt(makeCtx({ energy: 50 }))).toBeNull()
  })
})

describe('spPositiveBuffer tendency', () => {
  test('skill only when sp leaves >=2 headroom', () => {
    expect(spPositiveBufferTendency.decideTurn(makeCtx({ sp: 5, spCostSkill: 1 })).kind).toBe(AbilityKind.SKILL)
    expect(spPositiveBufferTendency.decideTurn(makeCtx({ sp: 3, spCostSkill: 1 })).kind).toBe(AbilityKind.SKILL)
    // 2 SP - 1 cost = 1 left — below 2 headroom, fall back to basic
    expect(spPositiveBufferTendency.decideTurn(makeCtx({ sp: 2, spCostSkill: 1 })).kind).toBe(AbilityKind.BASIC)
  })
})

describe('fieldBuffer tendency', () => {
  test('always basic on regular turn', () => {
    expect(fieldBufferTendency.decideTurn(makeCtx({ sp: 5 })).kind).toBe(AbilityKind.BASIC)
    expect(fieldBufferTendency.decideTurn(makeCtx({ sp: 0 })).kind).toBe(AbilityKind.BASIC)
  })

  test('ult when energy full', () => {
    expect(fieldBufferTendency.decideUlt(makeCtx({ energy: 120 }))?.kind).toBe(AbilityKind.ULT)
    expect(fieldBufferTendency.decideUlt(makeCtx({ energy: 100 }))).toBeNull()
  })
})

describe('stackDps tendency', () => {
  const stackData: CharacterData = {
    ...defaultCharacterData,
    ultResource: 'stacks',
    stacks: {
      name: 'nihility',
      onAction: { [AbilityKind.BASIC]: 1, [AbilityKind.SKILL]: 1 },
      threshold: 9,
      consumeOnUlt: 'all',
    },
  }

  test('skill when SP affords', () => {
    const member = makeMember(120, stackData)
    expect(stackDpsTendency.decideTurn(makeCtx({ sp: 5, member })).kind).toBe(AbilityKind.SKILL)
  })

  test('basic when SP starved', () => {
    const member = makeMember(120, stackData)
    expect(stackDpsTendency.decideTurn(makeCtx({ sp: 0, member })).kind).toBe(AbilityKind.BASIC)
  })

  test('ult when stacks reach threshold', () => {
    const member = makeMember(120, stackData)
    expect(stackDpsTendency.decideUlt(makeCtx({ stacks: { nihility: 9 }, member }))?.kind).toBe(AbilityKind.ULT)
    expect(stackDpsTendency.decideUlt(makeCtx({ stacks: { nihility: 8 }, member }))).toBeNull()
  })

  test('ignores energy ult readiness when ultResource is stacks', () => {
    const member = makeMember(120, stackData)
    expect(stackDpsTendency.decideUlt(makeCtx({ energy: 120, stacks: { nihility: 0 }, member }))).toBeNull()
  })
})
