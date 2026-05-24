import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import type { Tendency } from 'lib/autobattle/types'

// Huohuo follows the generic healer pattern: basic to bank SP, ult when full. Her energy-
// regen-to-allies trace is not modeled in v1 (no in-flow on teammate turns); she instead
// relies on her own basic+ult energy gen for ult cadence.
export const HuohuoTendency: Tendency = {
  ...healerTendency,
}
