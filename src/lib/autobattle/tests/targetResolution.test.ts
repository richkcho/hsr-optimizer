import { defaultCharacterData } from 'lib/autobattle/characterData/defaults'
import { resolveCharacterData } from 'lib/autobattle/characterData/characterDataRegistry'
import { createMockDamageResolver } from 'lib/autobattle/damage/damageRunner'
import {
  defaultTargetForKind,
  resolveAbilityTarget,
  runAutobattle,
} from 'lib/autobattle/scheduler/scheduler'
import type {
  AutobattleInput,
  CharacterData,
  ChosenAbility,
  TeamMember,
} from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'
import type { CharacterId } from 'types/character'
import type { LightConeId } from 'types/lightCone'
import { describe, expect, test } from 'vitest'

// ---------------------------------------------------------------------------
// Default kind-based resolution
// ---------------------------------------------------------------------------

describe('defaultTargetForKind', () => {
  test('every kind defaults to mainEnemy (AoE / support requires an explicit hint)', () => {
    expect(defaultTargetForKind(AbilityKind.BASIC)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.SKILL)).toBe('mainEnemy')
    expect(defaultTargetForKind(AbilityKind.ULT)).toBe('mainEnemy')
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
      target: { kind: 'slot', slot: 2 },
    }
    expect(resolveAbilityTarget(member, chosen)).toEqual({ kind: 'slot', slot: 2 })
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
    expect(resolveAbilityTarget(member, { kind: AbilityKind.ULT, reason: 'default' })).toBe('mainEnemy')
  })

  test('hint for a different kind does not bleed', () => {
    const member = fakeMember({
      ...defaultCharacterData,
      abilityTargetHint: { [AbilityKind.SKILL]: 'self' },
    })
    // ULT has no hint, should fall through to kind default
    expect(resolveAbilityTarget(member, { kind: AbilityKind.ULT, reason: 'ult' })).toBe('mainEnemy')
  })
})

// ---------------------------------------------------------------------------
// Per-character hint assertions
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

  test('Hyacine (1409): SKILL=singleAlly, ULT=allAllies', () => {
    const data = resolveCharacterData('1409' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('singleAlly')
    expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allAllies')
  })

  test('AoE chars declare ULT=allEnemies (TheHerta, Anaxa, Castorice, Lingsha, Aventurine, Pela, Acheron)', () => {
    const aoeChars: CharacterId[] = [
      '1401' as CharacterId, // TheHerta
      '1405' as CharacterId, // Anaxa
      '1407' as CharacterId, // Castorice
      '1222' as CharacterId, // Lingsha
      '1304' as CharacterId, // Aventurine
      '1106' as CharacterId, // Pela
      '1308' as CharacterId, // Acheron
    ]
    for (const cid of aoeChars) {
      const data = resolveCharacterData(cid)
      expect(data.abilityTargetHint?.[AbilityKind.ULT]).toBe('allEnemies')
    }
  })

  test('Aventurine (1304): SKILL=allEnemies (also AoE)', () => {
    const data = resolveCharacterData('1304' as CharacterId)
    expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
  })

  test('Skill-AoE chars declare SKILL=allEnemies (TheHerta, Anaxa, Castorice, Lingsha)', () => {
    const skillAoe: CharacterId[] = [
      '1401' as CharacterId,
      '1405' as CharacterId,
      '1407' as CharacterId,
      '1222' as CharacterId,
    ]
    for (const cid of skillAoe) {
      const data = resolveCharacterData(cid)
      expect(data.abilityTargetHint?.[AbilityKind.SKILL]).toBe('allEnemies')
    }
  })

  test('Pure ST DPS chars (Feixiao, Mydei, Phainon, Topaz, Yunli) have no hint at all', () => {
    const stChars: CharacterId[] = [
      '1220' as CharacterId, // Feixiao
      '1404' as CharacterId, // Mydei
      '1408' as CharacterId, // Phainon
      '1112' as CharacterId, // Topaz
      '1221' as CharacterId, // Yunli
    ]
    for (const cid of stChars) {
      const data = resolveCharacterData(cid)
      expect(data.abilityTargetHint).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// End-to-end: scheduler writes resolved target onto log entries.
// Uses a Robin-only sim with mock resolver — Robin's tendency BASIC-spams until energy fills,
// then ults; gives us at least one BASIC and one ULT in the log without needing the full
// optimizer pipeline.
// ---------------------------------------------------------------------------

function singleSlotInput(characterId: CharacterId, lightConeId: LightConeId): AutobattleInput {
  return {
    team: [
      {
        slot: 0,
        characterId,
        eidolon: 0,
        lightConeId,
        lightConeSuperimposition: 1,
        equippedRelics: {},
        baseSpd: 102,
        maxEnergy: 160,
        path: 'Harmony',
      },
    ],
    mainDpsSlot: 0,
    enemyCount: 1,
    enemySpd: 134,
    totalAv: 1200,
  }
}

describe('executeAbility writes resolved target into TurnLogEntry', () => {
  test('Robin solo: BASIC entries get default mainEnemy, ULT entries get allAllies hint', () => {
    const input = singleSlotInput('1309' as CharacterId, '23026' as LightConeId)
    const result = runAutobattle(input, {
      resolver: createMockDamageResolver({
        [AbilityKind.BASIC]: 100,
        [AbilityKind.ULT]: 1000,
      } as Partial<Record<AbilityKind, number>>),
    })

    const basicEntry = result.log.find((e) => e.kind === AbilityKind.BASIC)
    expect(basicEntry, 'expected at least one BASIC turn in 1200 AV').toBeDefined()
    expect(basicEntry!.target).toBe('mainEnemy')

    const ultEntry = result.log.find((e) => e.kind === AbilityKind.ULT)
    expect(ultEntry, 'expected at least one ULT trigger in 1200 AV').toBeDefined()
    expect(ultEntry!.target).toBe('allAllies')

    // Non-action entries don't get a target.
    const enemyTurn = result.log.find((e) => e.kind === 'ENEMY_TURN')
    if (enemyTurn) expect(enemyTurn.target).toBeUndefined()
  })
})
