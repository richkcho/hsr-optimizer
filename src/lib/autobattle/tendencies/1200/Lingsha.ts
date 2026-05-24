import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Lingsha alternates between skill (heal + Besotted) and basic. Skill if she has SP
// headroom; otherwise basic. Ult ASAP.
export const LingshaTendency: Tendency = {
  ...healerTendency,
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() - cost >= 2) {
      return { kind: AbilityKind.SKILL, reason: 'apply Besotted to drive Fuyuan FUAs' }
    }
    return { kind: AbilityKind.BASIC, reason: 'preserve sp' }
  },
}
