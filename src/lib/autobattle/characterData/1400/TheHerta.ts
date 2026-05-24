import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// The Herta is an Erudition AoE DPS. Skill hits all enemies (scales via context.enemyCount).
// No special character data — energy gen + ult resource are standard.
export const TheHertaData: CharacterData = {
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',
    [AbilityKind.ULT]: 'allEnemies',
  },
}
