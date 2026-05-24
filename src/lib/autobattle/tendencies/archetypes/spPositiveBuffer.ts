import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// SP-positive supports (Tingyun, Sparkle, Hanya, etc.). These characters generate SP through
// their skill — Sparkle gives +1, Tingyun's skill is +0 cost, etc. — so they can use skill
// frequently without starving the DPS. Default to skill but keep at least one SP banked so
// the team isn't pushed below zero.
export const spPositiveBufferTendency: Tendency = {
  archetype: 'spPositiveBuffer',

  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    // Skill if it leaves at least 2 SP in the pool — safe headroom for the main DPS.
    if (ctx.sp() - cost >= 2) {
      return { kind: AbilityKind.SKILL, reason: `sp ${ctx.sp()}>= ${cost + 2} headroom` }
    }
    return { kind: AbilityKind.BASIC, reason: 'sp headroom too low' }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    return ctx.energy() >= member.maxEnergy
      ? { kind: AbilityKind.ULT, reason: 'ult ready' }
      : null
  },
}
