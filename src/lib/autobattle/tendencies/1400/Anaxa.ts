import { aoeDpsTendency } from 'lib/autobattle/tendencies/archetypes/aoeDps'
import type { Tendency } from 'lib/autobattle/types'

// Anaxa is an AoE DPS but he can be ult-heavy when his stack mechanic is up. v1 uses the
// generic aoeDps shape — Phase G+ can refine when his stack mechanic is added to characterData.
export const AnaxaTendency: Tendency = {
  ...aoeDpsTendency,
}
