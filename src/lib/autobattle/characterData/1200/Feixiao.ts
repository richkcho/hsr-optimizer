import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Feixiao's FUA fires once every 2 ally attacks (her "Flying Aureus" mechanic). Each FUA also
// gives her a special charge stack that powers her ult — modeled here as her standard energy
// pool with ult-on-charged semantics.
export const FeixiaoData: CharacterData = {
  fuaTriggers: [
    {
      id: 'feixiao.flyingAureus',
      on: 'teammateAttack',
      everyN: 2,
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
}
