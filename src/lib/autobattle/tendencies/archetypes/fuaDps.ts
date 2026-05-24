import { pureDpsTendency } from 'lib/autobattle/tendencies/archetypes/pureDps'
import type { Tendency } from 'lib/autobattle/types'

// FUA-driven DPS (Feixiao, Yunli, Boothill-ish). On-turn behavior is identical to pureDps:
// skill > basic, ult ASAP. The "FUA-ness" comes from the character's fuaTriggers in
// characterData firing during teammate turns — tendency doesn't need to drive that.
export const fuaDpsTendency: Tendency = {
  ...pureDpsTendency,
  archetype: 'fuaDps',
}
