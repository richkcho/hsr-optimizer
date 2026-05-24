import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import type { ArchetypeId, Tendency } from 'lib/autobattle/types'

// Phase B ships with pureDps only. Additional archetypes (fuaDps, aoeDps, stackDps,
// spPositiveBuffer, fieldBuffer, healer, debuffer) are added in Phase D.
// Until an archetype exists, its slot falls back to pureDps so the resolver always returns
// a usable Tendency.
const fallback = pureDpsTendency

export const archetypeRegistry: Record<ArchetypeId, Tendency> = {
  pureDps: pureDpsTendency,
  fuaDps: fallback,
  aoeDps: fallback,
  stackDps: fallback,
  spPositiveBuffer: fallback,
  fieldBuffer: fallback,
  healer: fallback,
  debuffer: fallback,
}
