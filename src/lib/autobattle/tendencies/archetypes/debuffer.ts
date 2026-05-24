import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Nihility debuffers (Jiaoqiu, Pela, Welt, Silver Wolf). Skill applies the key debuff; basic
// otherwise. Ult ASAP.
export const debufferTendency: Tendency = {
  archetype: 'debuffer',

  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() >= cost) {
      return { kind: AbilityKind.SKILL, reason: 'apply debuff via skill' }
    }
    return { kind: AbilityKind.BASIC, reason: 'sp starved' }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    return ctx.energy() >= member.maxEnergy
      ? { kind: AbilityKind.ULT, reason: 'ult ready' }
      : null
  },
}
