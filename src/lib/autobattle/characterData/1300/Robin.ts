import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's ult enters Concerto state: applies ATK + Crit DMG team buffs (handled via standard
// optimizer conditionals) and advances every other ally 100% AV. v1 models only the AV
// advance here; the buff stat values flow through teammate conditionals at context build.
// Robin's ult does NOT grant energy to allies.
//
// Concerto Additional damage: while Concerto is active, Robin emits an Additional hit
// (AbilityKind.UNIQUE) on every teammate attack. We approximate Concerto duration as 2 of
// Robin's own primary turns via the 'Robin.concerto' self-marker — applied on ULT, ticked by
// turnsOnSource. The trigger fires UNIQUE through the existing FUA-trigger path; the gating
// is what's new (requiresSourceBuff). Damage routing reuses Robin's prebuilt UNIQUE action.
export const RobinData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.ULT]: { target: 'allAllies', avPercent: 100 },
  },
  grantsBuffsOnAction: {
    [AbilityKind.ULT]: [
      {
        target: 'self',
        buff: {
          id: 'Robin.concerto',
          remaining: 2,
          mode: 'turnsOnSource',
        },
      },
    ],
  },
  fuaTriggers: [
    {
      id: 'robin.concertoAdditional',
      on: 'teammateAttack',
      selector: { abilityKind: AbilityKind.UNIQUE },
      requiresSourceBuff: 'Robin.concerto',
    },
  ],
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'self',     // Pinion's Aria — self-buff that propagates to team
    [AbilityKind.ULT]: 'allAllies',  // Concerto — team advance + team buff
  },
}
