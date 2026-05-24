import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { CharacterId } from 'types/character'
import { describe, expect, test } from 'vitest'

describe('characterData registry', () => {
  test('unknown character falls back to defaults', () => {
    const data = resolveCharacterData('0000' as CharacterId)
    expect(data).toBe(defaultCharacterData)
    expect(data.energyOnAction?.[AbilityKind.BASIC]).toBe(20)
    expect(data.ultResource ?? 'energy').toBe('energy')
  })

  test('Acheron: stack-based ult with nihility stacks', () => {
    const data = resolveCharacterData('1308' as CharacterId)
    expect(data.ultResource).toBe('stacks')
    expect(data.stacks?.name).toBe('nihility')
    expect(data.stacks?.threshold).toBe(9)
    expect(data.stacks?.consumeOnUlt).toBe('all')
    // Self stack gain on basic/skill
    expect(data.stacks?.onAction?.[AbilityKind.BASIC]).toBe(1)
    expect(data.stacks?.onAction?.[AbilityKind.SKILL]).toBe(1)
    // Teammate stack gain on skill/ult
    expect(data.stacks?.onTeammateAction?.[AbilityKind.SKILL]).toBe(1)
    expect(data.stacks?.onTeammateAction?.[AbilityKind.ULT]).toBe(1)
  })

  test('Feixiao: FUA trigger every 2 teammate attacks', () => {
    const data = resolveCharacterData('1220' as CharacterId)
    expect(data.fuaTriggers?.length).toBe(1)
    const trigger = data.fuaTriggers![0]
    expect(trigger.on).toBe('teammateAttack')
    expect(trigger.everyN).toBe(2)
    expect(trigger.selector?.abilityKind).toBe(AbilityKind.FUA)
  })

  test('Topaz: FUA trigger + Numby memo entity', () => {
    const data = resolveCharacterData('1112' as CharacterId)
    expect(data.fuaTriggers?.[0].on).toBe('teammateAttackVsTarget')
    expect(data.fuaTriggers?.[0].conditionMark).toBe('numbyMark')
    expect(data.memo?.entityName).toBe('Numby')
    expect(data.memo?.spdSource).toBe('entityDefinition')
  })

  test('Robin: grants +50 energy to single ally on ult', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    const ultGrant = data.grantsEnergyOnAction?.[AbilityKind.ULT]
    expect(ultGrant?.target).toBe('singleAlly')
    expect(ultGrant?.amount).toBe(50)
  })

  test('Sunday: grants 100% advance + energy to single ally on ult', () => {
    const data = resolveCharacterData('1313' as CharacterId)
    const advanceGrant = data.grantsAdvanceOnAction?.[AbilityKind.ULT]
    expect(advanceGrant?.target).toBe('singleAlly')
    expect(advanceGrant?.avPercent).toBe(100)
    const energyGrant = data.grantsEnergyOnAction?.[AbilityKind.ULT]
    expect(energyGrant?.target).toBe('singleAlly')
    expect(energyGrant?.amount).toBe(40)
  })

  test('Sparkle: skill advances single ally by 50%', () => {
    const data = resolveCharacterData('1306' as CharacterId)
    expect(data.grantsAdvanceOnAction?.[AbilityKind.SKILL]?.target).toBe('singleAlly')
    expect(data.grantsAdvanceOnAction?.[AbilityKind.SKILL]?.avPercent).toBe(50)
  })

  test('Aventurine: energy-from-hit approx + FUA trigger', () => {
    const data = resolveCharacterData('1304' as CharacterId)
    expect(data.v1Approx?.energyFromEnemyAttacks?.avgPerEnemyTurn).toBe(6)
    expect(data.fuaTriggers?.length).toBe(1)
    expect(data.fuaTriggers?.[0].everyN).toBe(7)
  })

  test('Yunli: counter FUA trigger every 3', () => {
    const data = resolveCharacterData('1221' as CharacterId)
    expect(data.fuaTriggers?.[0].everyN).toBe(3)
    expect(data.fuaTriggers?.[0].on).toBe('teammateAttack')
  })

  test('overrides merge with defaults (energyOnAction)', () => {
    // Acheron's stacks ult doesn't touch energy gen — basic/skill energy still inherited.
    const data = resolveCharacterData('1308' as CharacterId)
    expect(data.energyOnAction?.[AbilityKind.BASIC]).toBe(20)
    expect(data.energyOnAction?.[AbilityKind.SKILL]).toBe(30)
    // FUA is not set in Acheron data so should fall through to defaults
    expect(data.energyOnAction?.[AbilityKind.FUA]).toBe(5)
  })
})
