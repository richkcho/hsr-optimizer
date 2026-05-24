import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's ult grants +50 energy to a single ally (the lowest-energy ally in game; v1 routes
// this to the configured mainDpsSlot via the 'singleAlly' resolver).
export const RobinData: CharacterData = {
  grantsEnergyOnAction: {
    [AbilityKind.ULT]: { target: 'singleAlly', amount: 50 },
  },
}
