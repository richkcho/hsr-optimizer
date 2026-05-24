import { spPositiveBufferTendency } from 'lib/autobattle/tendencies/archetypes/spPositiveBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Bronya skill advances + buffs the main DPS — high value when SP allows. She's SP-negative
// (skill costs 1 net) but the buff payoff is large. Use skill whenever SP >= 2 (leaves 1 in
// reserve for the DPS); otherwise basic to refund SP.
export const BronyaTendency: Tendency = {
  ...spPositiveBufferTendency,
  archetype: 'spPositiveBuffer',
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    // Need at least 1 SP after spending — buffer for the main DPS to skill on its turn.
    if (ctx.sp() - cost >= 1) {
      return { kind: AbilityKind.SKILL, reason: 'advance + buff main DPS' }
    }
    return { kind: AbilityKind.BASIC, reason: 'refund sp for team' }
  },
}
