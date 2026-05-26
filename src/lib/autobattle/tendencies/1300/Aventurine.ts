import { healerTendency } from 'lib/autobattle/tendencies/archetypes/healer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Aventurine's role: keep team shields up, otherwise basic. The Aventurine.shield buff is
// refreshed by both his skill and his ult. When active, he basics to preserve SP for the
// team's DPS; when expired (shields down), he skills. Energy gain from Blind Bet FUAs is
// fast enough that his ult cycle generally refreshes shields before the buff expires —
// matching the reference pattern of skill ~0 / ult-driven.
//
// SP gating: basic regardless if he can't afford the skill — the rest of the team usually
// has Topaz draining SP, so Aventurine waits for headroom before skill-refreshing.
export const AventurineTendency: Tendency = {
  ...healerTendency,
  archetype: 'healer',
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    const sp = ctx.sp()
    if (sp < cost) {
      return { kind: AbilityKind.BASIC, reason: `sp ${sp}<${cost}` }
    }
    if (ctx.hasActiveBuff('Aventurine.shield')) {
      return { kind: AbilityKind.BASIC, reason: 'shield active — preserve sp' }
    }
    return { kind: AbilityKind.SKILL, reason: 'refresh shield' }
  },
}
