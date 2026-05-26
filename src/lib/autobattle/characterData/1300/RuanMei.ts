import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Ruan Mei's whole kit is buffs that ride the standard optimizer conditional layer:
//   Skill "Overtone" — 3-turn team-wide DMG % + Weakness Break Efficiency
//   Ult — AoE damage + creates a field on enemies (DMG vulnerability + RES PEN) for 3 turns,
//          and arms Thanataplum Rebloom (Ice break damage on weakness recovery while the
//          field is active)
//   Talent — team SPD %, always on
// All three propagate via teammateContent through precomputeMutualEffectsContainer
// at context build time, so we don't add them as stat-bearing buffs here. She has
// no team energy / AV-advance gifts.
//
// Two zero-stat self-marker buffs sit alongside the damage pipeline: RuanMei.overtone
// (gates her tendency to skill only when expiring) and RuanMei.ultField (gates the
// Thanataplum Rebloom break-damage proc). Both carry no statOverride or conditionalKey
// so they're invisible to the damage pipeline — purely sim-side hasActiveBuff gates.
//
// Break-zone passive (Thanataplum Rebloom) damage attributes to her own primary actor —
// hits appear with source=Ruan Mei in reference logs.
export const RuanMeiData: CharacterData = {
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'self',       // Overtone — self-buff that propagates team-wide
    [AbilityKind.ULT]: 'allEnemies',   // AoE damage + field on all enemies
  },
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'self',
        buff: {
          id: 'RuanMei.overtone',
          remaining: 3,            // 3 turns of Ruan Mei's own turns
          mode: 'turnsOnSource',
        },
      },
    ],
    [AbilityKind.ULT]: [
      {
        target: 'self',
        buff: {
          id: 'RuanMei.ultField',
          remaining: 3,            // HSR ult text: field lasts 3 turns
          mode: 'turnsOnSource',
        },
      },
    ],
  },
  onEnemyWeaknessRecovery: {
    requiresActiveBuff: 'RuanMei.ultField',
    firedAs: AbilityKind.BREAK,
  },
}
