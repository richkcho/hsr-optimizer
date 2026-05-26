import { fieldBufferTendency } from 'lib/autobattle/tendencies/archetypes/fieldBuffer'
import type { ChosenAbility, Tendency, TendencyCtx } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's role: maintain Pinion's Aria team buff uptime, basic otherwise. The buff is
// applied by her skill (Robin.pinionsAria, turnsOnSource: 3) — once active she basics to
// preserve SP for the team's DPS (typically Topaz/Feixiao/etc.). Basics still feed her
// energy at the standard 20/turn so her ult cadence isn't starved. When SP is too low to
// cover the skill cost, basic regardless.
export const RobinTendency: Tendency = {
  ...fieldBufferTendency,
  decideTurn(ctx: TendencyCtx): ChosenAbility {
    const cost = ctx.spCost(AbilityKind.SKILL)
    const sp = ctx.sp()
    if (sp < cost) {
      return { kind: AbilityKind.BASIC, reason: `sp ${sp}<${cost} — feed energy via basic` }
    }
    if (ctx.hasActiveBuff('Robin.pinionsAria')) {
      return { kind: AbilityKind.BASIC, reason: 'pinionsAria active — preserve sp for dps' }
    }
    return { kind: AbilityKind.SKILL, reason: 'refresh pinionsAria' }
  },
}
