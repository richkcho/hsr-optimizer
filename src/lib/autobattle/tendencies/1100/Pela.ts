import { debufferTendency } from 'lib/autobattle/tendencies/archetypes/debuffer'
import type { Tendency } from 'lib/autobattle/types'

// Pela uses skill liberally to maintain Exposed; ult ASAP. Default debuffer shape.
export const PelaTendency: Tendency = {
  ...debufferTendency,
}
