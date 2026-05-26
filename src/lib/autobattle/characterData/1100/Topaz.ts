import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Topaz / Numby. Numby acts only on its own 80-SPD clock (it isn't a FUA-trigger-driven
// follow-up). The trigger feel comes from Topaz's Talent ("Trotter Market!?"): every ally
// BASIC/SKILL/ULT that hits a Proof-of-Debt-marked enemy advances Numby's action gauge by
// 50%, so Numby fires far more often than the raw 80 SPD would suggest. v1 approximates
// the conditionMark gate as always-satisfied (the scheduler doesn't track per-enemy debuff
// duration yet) — see .tmp/discrepancies/2026-05-25-topaz-numby-fua-cadence.md.
export const TopazData: CharacterData = {
  memo: {
    entityName: 'Numby',
    spdSource: 'entityDefinition',
    entitySpd: 80,
    // Numby does not feed Topaz energy on actions — Topaz only gains energy from her own.
    energyOnAction: {},
    onTurn: { abilityKind: AbilityKind.FUA, reason: 'numby own-clock fua' },
    advanceOnTeammateAttack: {
      avPercent: 0.5,
      abilityKindFilter: [AbilityKind.BASIC, AbilityKind.SKILL, AbilityKind.ULT],
      conditionMark: 'numbyMark',
    },
  },
}
