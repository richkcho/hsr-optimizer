import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Standard HSR energy rules. Per-character overrides live in characterData/<era>/<Name>.ts.
// ULT here is the *refund* applied after consuming maxEnergy.
export const defaultCharacterData: CharacterData = {
  energyOnAction: {
    [AbilityKind.BASIC]: 20,
    [AbilityKind.SKILL]: 30,
    [AbilityKind.FUA]: 5,
    [AbilityKind.ULT]: 5,
  },
  ultResource: 'energy',
}
