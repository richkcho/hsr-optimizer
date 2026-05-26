import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's skill (Pinion's Aria) costs 1 SP and applies a team ATK%/DMG% buff plus refunds 30
// energy to her (35 with Sequential Passage trace). The reference defaults skill use to
// "whenever SP >= 1" — the synergy team's SP economy gates her naturally as Topaz consumes SP
// for her primary attacks. Basic when SP is too low to cover the skill cost.
export const RobinTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() >= cost) {
      return { kind: AbilityKind.SKILL, reason: `sp ${ctx.sp()}>=${cost}` }
    }
    return { kind: AbilityKind.BASIC, reason: 'sp<cost — feed energy via basic' }
  },
}
