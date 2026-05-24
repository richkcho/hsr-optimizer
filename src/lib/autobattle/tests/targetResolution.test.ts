import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import {
  defaultTargetForKind,
  resolveAbilityTarget,
} from 'lib/autobattle/scheduler/scheduler'
import type {
  CharacterData,
  ChosenAbility,
  TeamMember,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { CharacterId } from 'types/character'
import { describe, expect, test } from 'vitest'

// ---------------------------------------------------------------------------
// Default kind-based resolution
// ---------------------------------------------------------------------------

describe('defaultTargetForKind', () => {
  test('ULT defaults to allEnemies (most ults are AoE)', () => {
    expect(defaultTargetForKind(AbilityKind.ULT)).toBe('allEnemies')
  })

  test('non-ULT kinds default to mainEnemy', () => {
    expect(defaultTargetForKind(AbilityKind.BASIC)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.SKILL)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.FUA)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.DOT)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.BREAK)).toBe('mainEnemy')
  })
})

// ---------------------------------------------------------------------------
// Precedence: chosen.target > characterData hint > kind default
// ---------------------------------------------------------------------------

function fakeMember(data: CharacterData): TeamMember {
  // Only `characterData` is read by resolveAbilityTarget. Other fields are throwaway.
  return { characterData: data } as unknown as TeamMember
}

describe('resolveAbilityTarget precedence', () => {
  test('explicit chosen.target wins over hint and default', () => {
    const member = fakeMember({
      ...defaultCharacterData,
      abilityTargetHint: { [AbilityKind.SKILL]: 'allAllies' },
    })
    const chosen: ChosenAbility = {
      kind: AbilityKind.SKILL,
      reason: 'override',
      target: { slot: 2 },
    }
    expect(resolveAbilityTarget(member, chosen)).toEqual({ slot: 2 })
  })

  test('characterData hint wins over kind default when chosen.target absent', () => {
    const member = fakeMember({
      ...defaultCharacterData,
      abilityTargetHint: { [AbilityKind.SKILL]: 'singleAlly' },
    })
    const chosen: ChosenAbility = { kind: AbilityKind.SKILL, reason: 'hinted' }
    expect(resolveAbilityTarget(member, chosen)).toBe('singleAlly')
  })

  test('kind default applies when neither chosen.target nor hint is set', () => {
    const member = fakeMember(defaultCharacterData)
    expect(resolveAbilityTarget(member, { kind: AbilityKind.SKILL, reason: 'default' })).toBe('mainEnemy')
    expect(resolveAbilityTarget(member, { kind: AbilityKind.ULT, reason: 'default' })).toBe('allEnemies')
  })

  test('hint for a different kind does not bleed', () => {
    const member = fakeMember({
      ...defaultCharacterData,
      abilityTargetHint: { [AbilityKind.SKILL]: 'self' },
    })
    // ULT has no hint, should fall through to kind default
    expect(resolveAbilityTarget(member, { kind: AbilityKind.ULT, reason: 'ult' })).toBe('allEnemies')
  })
})

// ---------------------------------------------------------------------------
// Per-character hint assertions (verifies the data we just authored)
// ---------------------------------------------------------------------------

describe('per-character abilityTargetHint declarations', () => {
  test('defaultCharacterData has no hint (undefined)', () => {
    expect(defaultCharacterData.abilityTargetHint).toBeUndefined()
  })

  test('Robin (1309): SKILL=self, ULT=allAllies', () => {
    const data = resolveCharacterData('1309' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('self')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allAllies')
  })

  test('Sparkle (1306): SKILL=singleAlly, ULT=allAllies', () => {
    const data = resolveCharacterData('1306' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('singleAlly')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allAllies')
  })

  test('Sunday (1313): SKILL=singleAlly, ULT=singleAlly', () => {
    const data = resolveCharacterData('1313' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('singleAlly')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('singleAlly')
  })

  test('Aventurine (1304): SKILL=allEnemies', () => {
    const data = resolveCharacterData('1304' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
  })

  test('Hyacine (1409): SKILL=singleAlly, ULT=allAllies', () => {
    const data = resolveCharacterData('1409' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('singleAlly')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allAllies')
  })

  test('Lingsha (1222): SKILL=allEnemies, ULT=allEnemies', () => {
    const data = resolveCharacterData('1222' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allEnemies')
  })

  test('Anaxa (1405): SKILL=allEnemies', () => {
    const data = resolveCharacterData('1405' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
  })

  test('TheHerta (1401): SKILL=allEnemies', () => {
    const data = resolveCharacterData('1401' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
  })

  test('Castorice (1407): SKILL=allEnemies', () => {
    const data = resolveCharacterData('1407' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
  })

  test('Pure ST DPS chars (Feixiao, Mydei, Phainon, Topaz, Yunli, Pela, Acheron) have no hint', () => {
    const stChars: CharacterId[] = [
      '1220' as CharacterId, // Feixiao
      '1404' as CharacterId, // Mydei
      '1408' as CharacterId, // Phainon
      '1112' as CharacterId, // Topaz
      '1221' as CharacterId, // Yunli
      '1106' as CharacterId, // Pela
      '1308' as CharacterId, // Acheron
    ]
    for (const cid of stChars) {
      const data = resolveCharacterData(cid)
      expect(data.abilityTargetHint).toBeUndefined()
    }
  })
})
