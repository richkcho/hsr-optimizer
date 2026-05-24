import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Single-target DPS: skill if SP affords it, basic otherwise. Ult ASAP.
export const pureDpsTendency: Tendency = {
  archetype: 'pureDps',

  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() >= cost) {
      return { kind: AbilityKind.SKILL, reason: `sp ${ctx.sp()}>=${cost}` }
    }
    return { kind: AbilityKind.BASIC, reason: `sp ${ctx.sp()}<${cost}` }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    const ready = member.characterData.ultResource === 'stacks'
      ? (member.characterData.stacks ? ctx.stacks(member.characterData.stacks.name) >= member.characterData.stacks.threshold : false)
      : ctx.energy() >= member.maxEnergy
    return ready ? { kind: AbilityKind.ULT, reason: 'ult ready' } : null
  },
}
