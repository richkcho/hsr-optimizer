import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Stack-resource DPS (Acheron-shaped). Skill to build stacks; basic when SP-starved.
// Ult readiness is checked via characterData.stacks.threshold, not energy.
export const stackDpsTendency: Tendency = {
  archetype: 'stackDps',

  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() >= cost) {
      return { kind: AbilityKind.SKILL, reason: 'build stacks via skill' }
    }
    return { kind: AbilityKind.BASIC, reason: 'sp starved' }
  },

  decideUlt(ctx: TendencyCtx): ChosenAbility | null {
    const member = ctx.state.members[ctx.self]!
    const stacks = member.characterData.stacks
    if (!stacks) return null
    const ready = ctx.stacks(stacks.name) >= stacks.threshold
    return ready ? { kind: AbilityKind.ULT, reason: `stacks ${ctx.stacks(stacks.name)}>=${stacks.threshold}` } : null
  },
}
