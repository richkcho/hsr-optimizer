import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Anaxa is Erudition DPS — same skill-based AoE shape as TheHerta. Standard energy/ult.
export const AnaxaData: CharacterData = {
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',
    [AbilityKind.ULT]: 'allEnemies',
  },
}
