import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Aventurine's skill gives shields and is SP-negative. He's typically played skill-heavy in
// the early rotation (3x skill to refresh blind bet stacks) then basic until ult. v1
// approximation: skill if there's headroom, else basic. Ult ASAP since it deals real damage.
export const AventurineTendency: Tendency = {
  ...healerTendency,
  archetype: 'healer',
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() - cost >= 2) {
      return { kind: AbilityKind.SKILL, reason: 'skill for shield + blind bet stacks' }
    }
    return { kind: AbilityKind.BASIC, reason: 'preserve sp' }
  },
}
