import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sunday's ult fully advances a single ally and grants them energy (eidolon-scaled in game;
// v1 uses a constant +40 approximation for E0 and routes via mainDpsSlot).
export const SundayData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.ULT]: { target: 'singleAlly', avPercent: 100 },
  },
  grantsEnergyOnAction: {
    [AbilityKind.ULT]: { target: 'singleAlly', amount: 40 },
  },
}
