import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sunday's skill advances a single ally 100% AV (and applies a CritDMG/DMG% buff via the
// standard optimizer conditionals). His ult grants energy to a single ally — in game,
// max(targetMaxEnergy * 0.20, 40); the flat 40 is the E0 floor that holds for any target
// with maxEnergy ≤ 200 (the common case). v1 routes both via the 'singleAlly' resolver
// (= mainDpsSlot).
export const SundayData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.SKILL]: { target: 'singleAlly', avPercent: 100 },
  },
  grantsEnergyOnAction: {
    [AbilityKind.ULT]: { target: 'singleAlly', amount: 40 },
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'singleAlly',  // Benison of Paper and Rites
    [AbilityKind.ULT]: 'singleAlly',    // Ode to Caress and Cicatrix — beatified on one ally
  },
}
