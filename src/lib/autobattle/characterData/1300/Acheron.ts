import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Acheron uses Nihility stacks instead of energy for her ult. She gains stacks on her own
// attacks and (with Nihility teammates) on certain teammate actions. Ult consumes all stacks.
export const AcheronData: CharacterData = {
  energyOnAction: {
    [AbilityKind.BASIC]: 20,
    [AbilityKind.SKILL]: 30,
    [AbilityKind.FUA]: 5,
  },
  ultResource: 'stacks',
  stacks: {
    name: 'nihility',
    onAction: {
      [AbilityKind.BASIC]: 1,
      [AbilityKind.SKILL]: 1,
    },
    // Approximation: assume one stack per Nihility teammate skill/ult. v1 doesn't check
    // teammate paths — the autobattle just feeds Acheron from any teammate skill/ult.
    onTeammateAction: {
      [AbilityKind.SKILL]: 1,
      [AbilityKind.ULT]: 1,
    },
    threshold: 9,
    consumeOnUlt: 'all',
  },
}
