import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sunday's skill advances a single ally 100% AV and applies a CritDMG/DMG% buff; his ult
// grants energy to a single ally (in-game also applies the "Beatified" buff, modeled via
// standard conditionals). Both grants live in characterData; the tendency just decides
// which ability to use this turn — skill when SP allows, basic otherwise.
export const SundayTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() - cost >= 2) {
      return { kind: AbilityKind.SKILL, reason: 'skill applies bird mark to DPS' }
    }
    return { kind: AbilityKind.BASIC, reason: 'feed energy for next ult' }
  },
}
