import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import type { Tendency } from 'lib/autobattle/types'

// Phainon is single-target DPS. Default pureDps shape.
export const PhainonTendency: Tendency = {
  ...pureDpsTendency,
}
