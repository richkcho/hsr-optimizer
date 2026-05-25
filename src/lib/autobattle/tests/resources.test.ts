import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import {
  changeEnergy,
  changeSkillPoints,
  changeStacks,
  consumeUlt,
  createResourceState,
  energyForAction,
  isUltReady,
  MAX_SKILL_POINTS,
} from 'lib/autobattle/state/resources'
import type { SlotIndex, TeamMember } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import { describe, expect, test } from 'vitest'
import type { CharacterId } from 'types/character'

function makeMember(slot: SlotIndex, maxEnergy = 120): TeamMember {
  return {
    slot,
    characterId: '1000' as CharacterId,
    eidolon: 0,
    lightConeId: '' as TeamMember['lightConeId'],
    lightConeSuperimposition: 1,
    equippedRelics: {},
    path: 'Destruction',
    maxEnergy,
    baseSpd: 100,
    errPercent: 0,
    tendency: pureDpsTendency,
    characterData: defaultCharacterData,
    actors: [{ slot, kind: 'primary' }],
  }
}

describe('Skill points', () => {
  test('starts full at MAX_SKILL_POINTS', () => {
    const r = createResourceState({ 0: makeMember(0) } as Record<SlotIndex, TeamMember>)
    expect(r.skillPoints).toBe(MAX_SKILL_POINTS)
  })

  test('clamps at 0 on under-spend', () => {
    const r = createResourceState({ 0: makeMember(0) } as Record<SlotIndex, TeamMember>)
    r.skillPoints = 0
    changeSkillPoints(r, -3)
    expect(r.skillPoints).toBe(0)
  })

  test('clamps at MAX_SKILL_POINTS on over-gain', () => {
    const r = createResourceState({ 0: makeMember(0) } as Record<SlotIndex, TeamMember>)
    changeSkillPoints(r, +3)
    expect(r.skillPoints).toBe(MAX_SKILL_POINTS)
  })
})

describe('Energy', () => {
  test('starts at 50% of maxEnergy by default; clamps at member.maxEnergy', () => {
    const member = makeMember(0, 100)
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    expect(r.energy[0]).toBe(50)
    changeEnergy(r, member, 200)
    expect(r.energy[0]).toBe(100)
  })

  test('scenario startingEnergyPercent overrides default', () => {
    const member = makeMember(0, 100)
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>, 0.25)
    expect(r.energy[0]).toBe(25)
  })

  test('characterData.startingEnergyPercent overrides scenario value', () => {
    const member = makeMember(0, 100)
    member.characterData = { ...defaultCharacterData, startingEnergyPercent: 0.75 }
    // Scenario 0.25 is ignored because the per-character override wins.
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>, 0.25)
    expect(r.energy[0]).toBe(75)
  })

  test('changeEnergy scales positive deltas by (1 + errPercent)', () => {
    const member = makeMember(0, 200)
    member.errPercent = 0.5
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    const start = r.energy[0]!
    changeEnergy(r, member, 20)            // gains 20 × 1.5 = 30
    expect(r.energy[0]).toBe(start + 30)
  })

  test('energyForAction uses defaults', () => {
    const member = makeMember(0)
    expect(energyForAction(member, AbilityKind.BASIC)).toBe(20)
    expect(energyForAction(member, AbilityKind.SKILL)).toBe(30)
    expect(energyForAction(member, AbilityKind.FUA)).toBe(5)
    expect(energyForAction(member, AbilityKind.ULT)).toBe(5)
  })

  test('energyForAction honors characterData override', () => {
    const member = makeMember(0)
    member.characterData = { ...defaultCharacterData, energyOnAction: { ...defaultCharacterData.energyOnAction, [AbilityKind.BASIC]: 30 } }
    expect(energyForAction(member, AbilityKind.BASIC)).toBe(30)
  })
})

describe('isUltReady / consumeUlt', () => {
  test('energy ult: ready when energy >= maxEnergy', () => {
    const member = makeMember(0, 100)
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    // 50% start at maxEnergy=100 ⇒ 50; not ready until we top up to 100.
    expect(r.energy[0]).toBe(50)
    expect(isUltReady(r, member)).toBe(false)
    changeEnergy(r, member, 100)
    expect(isUltReady(r, member)).toBe(true)
  })

  test('consumeUlt subtracts maxEnergy then applies ult refund', () => {
    const member = makeMember(0, 100)
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    changeEnergy(r, member, 100)
    consumeUlt(r, member)
    expect(r.energy[0]).toBe(5)  // 5 ult refund from defaults (errPercent=0 so no scaling)
  })

  test('stack ult: ready when stacks >= threshold', () => {
    const member = makeMember(0)
    member.characterData = {
      ...defaultCharacterData,
      ultResource: 'stacks',
      stacks: { name: 'nihility', onAction: {}, threshold: 9, consumeOnUlt: 'all' },
    }
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    expect(isUltReady(r, member)).toBe(false)
    changeStacks(r, member, 'nihility', 9)
    expect(isUltReady(r, member)).toBe(true)
    consumeUlt(r, member)
    expect(r.stacks[0]?.nihility).toBe(0)
  })

  test('consumeOnUlt with numeric amount only consumes that many stacks', () => {
    const member = makeMember(0)
    member.characterData = {
      ...defaultCharacterData,
      ultResource: 'stacks',
      stacks: { name: 'foo', onAction: {}, threshold: 5, consumeOnUlt: 3 },
    }
    const r = createResourceState({ 0: member } as Record<SlotIndex, TeamMember>)
    changeStacks(r, member, 'foo', 5)
    consumeUlt(r, member)
    expect(r.stacks[0]?.foo).toBe(2)
  })
})
