import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Ruan Mei's skill applies Overtone (3-turn team-wide DMG amp + Break Efficiency) and costs
// 1 SP with no refund. Refreshing it before it expires is wasted SP — the duration just
// resets without extending the team's effective uptime. So the tendency tracks Overtone
// via a self-marker buff (see CharacterData.grantsBuffsOnAction) and only skills when it
// has actually expired.
//
// Produces a stable skill-basic-basic cadence (1/3 skill rate) independent of team SP
// dynamics, matching her real play pattern of "skill exactly when Overtone drops". Ult
// inherits fieldBufferTendency's "whenever energy is full" rule.
export const RuanMeiTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    if (ctx.hasActiveBuff('RuanMei.overtone')) {
      return { kind: AbilityKind.BASIC, reason: 'overtone active, feed energy' }
    }
    const cost = ctx.spCost(AbilityKind.SKILL)
    if (ctx.sp() >= cost) {
      return { kind: AbilityKind.SKILL, reason: 'overtone expired, refresh' }
    }
    return { kind: AbilityKind.BASIC, reason: 'overtone expired but no sp to refresh' }
  },
}
