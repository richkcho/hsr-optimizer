import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Topaz: Numby (memo) fires its FUA when allies attack a Proof-of-Debt-marked target. The
// mark is placed by Topaz's skill — v1 approximates "always marked" so triggers fire each
// time. Numby has its own clock based on its entity SPD (entityDefinition source).
export const TopazData: CharacterData = {
  fuaTriggers: [
    {
      id: 'topaz.numbyFollowup',
      on: 'teammateAttackVsTarget',
      conditionMark: 'numbyMark',
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
  memo: {
    entityName: 'Numby',
    spdSource: 'entityDefinition',
    // Numby does not feed Topaz energy on actions — Topaz only gains energy from her own.
    energyOnAction: {},
  },
}
