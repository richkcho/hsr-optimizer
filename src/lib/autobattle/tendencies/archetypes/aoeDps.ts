import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import type { Tendency } from 'lib/autobattle/types'

// AoE/Erudition DPS (Herta, Anaxa, Argenti). Same on-turn policy as pureDps; the AoE benefit
// is realized through `enemyCount` in OptimizerContext multiplying skill hits, not via the
// tendency choosing a different ability.
export const aoeDpsTendency: Tendency = {
  ...pureDpsTendency,
  archetype: 'aoeDps',
}
