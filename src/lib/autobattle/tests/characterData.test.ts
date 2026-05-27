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

  test('Topaz: Numby memo with own-clock FUA + advanceOnTeammateAttack', () => {
    const data = resolveCharacterData('1112' as CharacterId)
    expect(data.memo?.entityName).toBe('Numby')
    expect(data.memo?.actorKind).toBe('summon')  // Numby is a pet/summon, not a memosprite
    expect(data.memo?.entitySpd).toBe(80)
    expect(data.memo?.onTurn?.abilityKind).toBe(AbilityKind.FUA)
    const advance = data.memo?.advanceOnTeammateAttack
    expect(advance?.avPercent).toBe(0.5)
    expect(advance?.conditionMark).toBe('numbyMark')
    expect(advance?.abilityKindFilter).toEqual([AbilityKind.BASIC, AbilityKind.SKILL, AbilityKind.ULT])
    // Topaz no longer uses fuaTriggers — Numby acts on its own clock, not as a follow-up
    // trigger off ally attacks.
    expect(data.fuaTriggers).toBeUndefined()
  })

  test('Robin: ult advances every other ally 100% AV', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    const advanceGrant = data.grantsAdvanceOnAction?.[AbilityKind.ULT]
    expect(advanceGrant?.target).toBe('allAllies')
    expect(advanceGrant?.avPercent).toBe(100)
    // No energy grant — Robin's ult doesn't feed teammate energy.
    expect(data.grantsEnergyOnAction?.[AbilityKind.ULT]).toBeUndefined()
  })

  test('Robin: ult applies Concerto field buff (av-mode, 10000/90 AV, team target)', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    const buffGrants = data.grantsBuffsOnAction?.[AbilityKind.ULT]
    // Two grants on ULT: Concerto (own kit) and Flowing Nightglow LC cadenza.
    expect(buffGrants?.length).toBe(2)
    const concerto = buffGrants?.find((g) => g.buff.id === 'Robin.concerto')
    // target:'team' so the conditional flag propagates to every resolving actor — see
    // .tmp/discrepancies/2026-05-26-buff-vs-field-classification.md for the rationale.
    expect(concerto?.target).toBe('team')
    expect(concerto?.buff.mode).toBe('av')
    expect(concerto?.buff.conditionalKey).toBe('concertoActive')
    // Concerto countdown is a fixed-SPD 90 entity per the Ultimate description.
    expect(concerto?.buff.remaining).toBeCloseTo(10000 / 90, 5)
  })

  test('Robin: Concerto buff pauses her primary clock with actOnResume', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    expect(data.clockPausedByBuff?.buffId).toBe('Robin.concerto')
    expect(data.clockPausedByBuff?.actOnResume).toBe(true)
  })

  test('Robin: Talent grants +2 energy per non-enemy attack (any kind)', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    expect(data.energyPassiveOnAnyAttack?.[AbilityKind.BASIC]).toBe(2)
    expect(data.energyPassiveOnAnyAttack?.[AbilityKind.SKILL]).toBe(2)
    expect(data.energyPassiveOnAnyAttack?.[AbilityKind.ULT]).toBe(2)
    expect(data.energyPassiveOnAnyAttack?.[AbilityKind.FUA]).toBe(2)
    // Additional damage doesn't count as an attack.
    expect(data.energyPassiveOnAnyAttack?.[AbilityKind.UNIQUE]).toBeUndefined()
  })

  test('Robin: Concerto Additional trigger fires UNIQUE while Concerto buff is active', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    expect(data.fuaTriggers?.length).toBe(1)
    const trigger = data.fuaTriggers![0]
    expect(trigger.on).toBe('teammateAttack')
    expect(trigger.selector?.abilityKind).toBe(AbilityKind.UNIQUE)
    expect(trigger.requiresSourceBuff).toBe('Robin.concerto')
  })

  test('Sunday: skill advances single ally 100% AV; ult grants energy', () => {
    const data = resolveCharacterData('1313' as CharacterId)
    const advanceGrant = data.grantsAdvanceOnAction?.[AbilityKind.SKILL]
    expect(advanceGrant?.target).toBe('singleAlly')
    expect(advanceGrant?.avPercent).toBe(100)
    // Advance is on skill, not ult.
    expect(data.grantsAdvanceOnAction?.[AbilityKind.ULT]).toBeUndefined()
    const energyGrant = data.grantsEnergyOnAction?.[AbilityKind.ULT]
    expect(energyGrant?.target).toBe('singleAlly')
    expect(energyGrant?.amount).toBe(40)
  })

  test('Sparkle: skill advances single ally by 50%', () => {
    const data = resolveCharacterData('1306' as CharacterId)
    expect(data.grantsAdvanceOnAction?.[AbilityKind.SKILL]?.target).toBe('singleAlly')
    expect(data.grantsAdvanceOnAction?.[AbilityKind.SKILL]?.avPercent).toBe(50)
  })

  test('Aventurine: Blind Bet stack pool drives FUA fires', () => {
    const data = resolveCharacterData('1304' as CharacterId)
    expect(data.fuaStackPool?.name).toBe('aventurine.blindBets')
    expect(data.fuaStackPool?.threshold).toBe(7)
    expect(data.fuaStackPool?.consumeOnFire).toBe(7)
    expect(data.fuaStackPool?.cap).toBe(10)
    expect(data.fuaStackPool?.firesAbility).toBe(AbilityKind.FUA)
    expect(data.fuaStackPool?.gain.onAllyAttack?.amount).toBe(1)
    expect(data.fuaStackPool?.gain.onAllyAttack?.maxPerOwnerTurn).toBe(3)
    expect(data.fuaStackPool?.gain.onAllyAttack?.sourceKindFilter).toEqual([AbilityKind.FUA])
    expect(data.fuaStackPool?.gain.onOwnUlt).toBe(4)
    expect(data.fuaStackPool?.gain.onEnemyTurnApprox).toBe(1.3)
    // Old shape removed: stack pool replaces fuaTriggers + v1Approx energy approximation.
    expect(data.fuaTriggers).toBeUndefined()
    expect(data.v1Approx?.energyFromEnemyAttacks).toBeUndefined()
  })

  test('Yunli: counter FUA trigger every 3', () => {
    const data = resolveCharacterData('1221' as CharacterId)
    expect(data.fuaTriggers?.[0].everyN).toBe(3)
    expect(data.fuaTriggers?.[0].on).toBe('teammateAttack')
  })

  test('Hyacine: Ica memo with fromOwnerSpd inheritance', () => {
    const data = resolveCharacterData('1409' as CharacterId)
    expect(data.memo?.entityName).toBe('Ica')
    expect(data.memo?.spdSource).toEqual({ fromOwnerSpd: 1.0 })
  })

  test('Castorice: Netherwing memo with entityDefinition SPD source', () => {
    const data = resolveCharacterData('1407' as CharacterId)
    expect(data.memo?.entityName).toBe('Netherwing')
    expect(data.memo?.spdSource).toBe('entityDefinition')
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
