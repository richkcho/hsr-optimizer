import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import type { Tendency } from 'lib/autobattle/types'

// Mydei is single-target Destruction DPS — pureDps shape works.
export const MydeiTendency: Tendency = {
  ...pureDpsTendency,
}
