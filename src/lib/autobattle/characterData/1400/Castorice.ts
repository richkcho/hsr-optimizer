import type { CharacterData } from 'lib/autobattle/types'

// Castorice's Netherwing has a fixed memoBaseSpdFlat of 165 (per EntityDefinition), so
// spdSource: 'entityDefinition' resolves correctly without needing an owner-SPD link.
// Castorice's ult ("Lifeline") consumes HP rather than energy in-game, but v1 approximates
// it as a standard energy ult — the ult costs maxEnergy and refunds 5, same as default. The
// special HP-based mechanics are deferred to a future phase.
export const CastoriceData: CharacterData = {
  memo: {
    entityName: 'Netherwing',
    spdSource: 'entityDefinition',
  },
}
