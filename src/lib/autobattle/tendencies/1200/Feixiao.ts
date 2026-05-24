import { fuaDpsTendency } from 'lib/autobattle/tendencies/archetypes/fuaDps'
import type { Tendency } from 'lib/autobattle/types'

// Feixiao plays as straightforward pureDps-on-turn — her differentiation comes from the FUA
// trigger registered in characterData (every 2 teammate attacks). No extra tendency logic.
export const FeixiaoTendency: Tendency = {
  ...fuaDpsTendency,
}
