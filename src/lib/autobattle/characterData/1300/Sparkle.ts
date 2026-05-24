import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sparkle's skill advances + buffs a single ally and is net SP-positive (she gives the team
// +1 SP on skill via her talent). We don't directly model the SP refund here — payAbilitySp
// reads action.hits[].skillPointsUsed which already encodes Sparkle's -1 cost. The team buff
// reaches the DPS via the static precomputeMutualEffectsContainer hook fed by default
// teammate conditionals at context-build time.
export const SparkleData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.SKILL]: { target: 'singleAlly', avPercent: 50 },
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'singleAlly',  // Dreamdiver — single ally advance + buff
    [AbilityKind.ULT]: 'allAllies',     // Cipher — team-wide ATK buff
  },
}
