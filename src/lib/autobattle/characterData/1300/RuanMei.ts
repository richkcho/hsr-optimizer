import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Ruan Mei's whole kit is buffs that ride the standard optimizer conditional layer:
//   Skill "Overtone" — 3-turn team-wide DMG % + Weakness Break Efficiency
//   Ult — AoE damage + creates a field on enemies (DMG vulnerability + RES PEN)
//   Talent — team SPD %, always on
// All three propagate via teammateContent through precomputeMutualEffectsContainer
// at context build time, so we don't add them as stat-bearing buffs here. She has
// no team energy / AV-advance gifts.
//
// We DO add a zero-stat self-marker buff on skill: it carries no statOverride and
// no conditionalKey, so it's invisible to the damage pipeline. Its sole purpose is
// to let the tendency check `hasActiveBuff('RuanMei.overtone')` and refresh only
// when the 3-turn duration has run out — instead of greedily skilling whenever SP
// is plentiful (which would re-apply Overtone on every turn it isn't expiring,
// wasting SP for no marginal team-DMG benefit).
//
// Break-zone passive damage attributes to her own primary actor (hits appear with
// source=Ruan Mei in reference logs).
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
  },
}
