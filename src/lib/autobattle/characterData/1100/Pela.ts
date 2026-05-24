import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Pela is straight-forward: standard energy, skill applies the Exposed debuff (handled via
// teammate conditionals at context build). Only AoE deviation is her ult (Zone Suppression).
export const PelaData: CharacterData = {
  abilityTargetHint: {
    [AbilityKind.ULT]: 'allEnemies',
  },
}
