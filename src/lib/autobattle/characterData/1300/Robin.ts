import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's ult enters Concerto state: applies ATK + Crit DMG team buffs (handled via standard
// optimizer conditionals) and advances every other ally 100% AV. v1 models only the AV
// advance here; the buff stat values flow through teammate conditionals at context build.
// Robin's ult does NOT grant energy to allies.
export const RobinData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.ULT]: { target: 'allAllies', avPercent: 100 },
  },
}
