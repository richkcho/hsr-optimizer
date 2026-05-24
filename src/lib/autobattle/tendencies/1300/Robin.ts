import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin only spends turns on basic — her job is to ult, applying Concerto (team ATK + Crit
// DMG buff via standard conditionals) and advancing every other ally 100% AV. The AV
// advance lives in characterData.grantsAdvanceOnAction.ULT; the tendency just decides
// *when* to ult (here: whenever energy is full).
export const RobinTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(_ctx: TendencyCtx): ChosenAbility {
    return { kind: AbilityKind.BASIC, reason: 'feed energy for next ult' }
  },
}
