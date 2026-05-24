import { spPositiveBufferTendency } from 'lib/autobattle/tendencies/archetypes/spPositiveBuffer'
import type { Tendency } from 'lib/autobattle/types'

// Sparkle's skill is SP-positive (net +1 with talent), so unlike the generic
// spPositiveBuffer she can skill almost freely. Inherit the archetype but the cost-based
// guard naturally allows aggressive skill use because the skill's effective SP cost is 0.
export const SparkleTendency: Tendency = {
  ...spPositiveBufferTendency,
}
