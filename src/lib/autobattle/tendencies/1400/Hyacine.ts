import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import type { Tendency } from 'lib/autobattle/types'

// Hyacine is sustain — basic to bank SP, ult when full. Defaults match her gameplay loop.
export const HyacineTendency: Tendency = {
  ...healerTendency,
}
