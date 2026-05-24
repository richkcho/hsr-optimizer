import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Field/aura buffers (Robin's Concerto, Bronya-after-ult). They typically only act via ult
// once the field is rebuilt, and otherwise pump basics to feed energy without consuming SP.
export const fieldBufferTendency: Tendency = {
  archetype: 'fieldBuffer',

  decideTurn(_ctx: TendencyCtx): ChosenAbility {
    return { kind: AbilityKind.BASIC, reason: 'maintain via basic' }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    return ctx.energy() >= member.maxEnergy
      ? { kind: AbilityKind.ULT, reason: 'rebuild field' }
      : null
  },
}
