import { aoeDpsTendency } from 'lib/autobattle/tendencies/archetypes/aoeDps'
import type { Tendency } from 'lib/autobattle/types'

// Castorice is Remembrance path / AoE-ish DPS. She gates her ult via memospriteActive in
// game; v1 approximates with the energy-based ult shape. Tendency mirrors aoeDps.
export const CastoriceTendency: Tendency = {
  ...aoeDpsTendency,
}
