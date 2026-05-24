import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sunday's skill places his summon's bird mark on a single ally (granting CD/energy on their
// next attack). He's SP-neutral but the impact is on the ally turn, not Sunday's. We treat
// him as fieldBuffer-shaped: basic to feed energy, ult to advance + grant energy to the DPS.
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
