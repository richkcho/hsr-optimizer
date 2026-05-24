import { aoeDpsTendency } from 'lib/autobattle/tendencies/archetypes/aoeDps'
import type { Tendency } from 'lib/autobattle/types'

// The Herta plays as AoE DPS: skill > basic, ult ASAP. Path-default already maps Erudition
// to aoeDps but registering explicitly keeps the override explicit for downstream tweaks.
export const TheHertaTendency: Tendency = {
  ...aoeDpsTendency,
}
