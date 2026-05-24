import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Healers (Huohuo, Lingsha, Bailu) — basic to maintain SP pool. Ult on cooldown.
// v1 doesn't model HP/heal needs; healers' DPS contribution is incidental.
export const healerTendency: Tendency = {
  archetype: 'healer',

  decideTurn(_ctx: TendencyCtx): ChosenAbility {
    return { kind: AbilityKind.BASIC, reason: 'preserve sp' }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    return ctx.energy() >= member.maxEnergy
      ? { kind: AbilityKind.ULT, reason: 'ult ready' }
      : null
  },
}
