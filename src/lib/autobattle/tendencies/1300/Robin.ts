import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin only spends turns on basic — her job is to ult, applying Concerto + giving the DPS
// +50 energy. The buff lives in characterData.grantsEnergyOnAction.ULT, so the tendency only
// needs to decide *when* to ult (here: whenever energy is full).
export const RobinTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(_ctx: TendencyCtx): ChosenAbility {
    return { kind: AbilityKind.BASIC, reason: 'feed energy for next ult' }
  },
}
