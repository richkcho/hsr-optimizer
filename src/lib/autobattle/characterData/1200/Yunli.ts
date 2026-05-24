import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Yunli's counterattack (FUA) fires when she's hit; with no enemy attacks in v1 we instead
// approximate ~1 FUA per 3 teammate attacks. Her ult-charged "Cull the Weed" enhanced counter
// isn't modeled separately — Yunli's standard FUA hit is what the autobattle fires.
export const YunliData: CharacterData = {
  fuaTriggers: [
    {
      id: 'yunli.counter',
      on: 'teammateAttack',
      everyN: 3,
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
}
