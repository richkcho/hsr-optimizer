import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Hyacine summons Ica. Ica's SPD inherits Hyacine's directly (×1.0) — the EntityDefinition
// shows memoBaseSpdFlat: 0 + memoBaseSpdScaling: 0 because the actual SPD calc happens via
// in-engine buff conversions we don't model in v1. We use the fromOwnerSpd override so the
// scheduler clock fires at Hyacine's cadence.
//
// Per-resolve precompute buff propagation (per gamedata SkillID 140903):
//   - Ult "We Who Fly Into Twilight" places Hyacine in "After Rain" state: "lasting for
//     #5[i] turn(s). This duration decreases by..." (caster-turn-tick → FIELD).
//     ParamList[4]=3. Drives `clearSkies` teammate conditional which gates her team HP%
//     buff (and E1's chained HP% top-up).
//
// E2 SPD% and E6 RES PEN are always-on eidolon traces, not windowed — no grant needed.
export const HyacineData: CharacterData = {
  memo: {
    entityName: 'Ica',
    spdSource: { fromOwnerSpd: 1.0 },
  },
  grantsBuffsOnAction: {
    [AbilityKind.ULT]: [
      {
        target: 'team',
        buff: {
          id: 'Hyacine.afterRain',
          remaining: 3,
          mode: 'turnsOnSource',
          conditionalKey: 'clearSkies',
        },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'singleAlly',  // Wide-Open Hands — heal one ally
    [AbilityKind.ULT]: 'allAllies',     // Long Live, Mr. Sunshine — team heal + buffs
  },
}
