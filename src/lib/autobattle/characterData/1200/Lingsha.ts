import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Lingsha is a sustain with a FUA mechanic: she summons her Fuyuan, who triggers a FUA
// whenever an ally attacks an enemy that has a Lingsha-applied Besotted debuff. v1 doesn't
// track per-debuff target conditions, so we approximate ~1 FUA per 4 ally attacks.
export const LingshaData: CharacterData = {
  fuaTriggers: [
    {
      id: 'lingsha.fuyuan',
      on: 'teammateAttack',
      everyN: 4,
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
}
