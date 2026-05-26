import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Robin's ult enters Concerto state: applies ATK + Crit DMG team buffs (handled via standard
// optimizer conditionals) and advances every other ally 100% AV. v1 models only the AV
// advance here; the buff stat values flow through teammate conditionals at context build.
// Robin's ult does NOT grant energy to allies.
//
// Concerto mechanics (per the official Ultimate "Vox Harmonique, Opus Cosmique"):
//   - A "Concerto" countdown appears in the action queue at a fixed SPD of 90, giving
//     Concerto a duration of 10000/90 ≈ 111.11 AV per cycle.
//   - While Concerto is active, Robin "cannot enter her turn or take action" — modeled
//     here by pausing her primary clock via clockPausedByBuff.
//   - On Concerto end, "Robin exits the Concerto state and immediately takes action" —
//     modeled by actOnResume: true, which sets her clock to 0 on unpause.
//   - "After every attack by ally targets, Robin deals Physical Additional DMG" — fires
//     via the existing FUA-trigger path with requiresSourceBuff gating UNIQUE on the buff.
//     Reuses Robin's prebuilt UNIQUE action from her conditional rather than duplicating
//     scaling/CR/CD mechanics. (E6 "Moonless Midnight" 8-trigger CRIT DMG cap is not
//     modeled — irrelevant at E0; would require per-fire damage modifiers if added.)
const CONCERTO_COUNTDOWN_SPD = 90
const CONCERTO_DURATION_AV = 10000 / CONCERTO_COUNTDOWN_SPD

export const RobinData: CharacterData = {
  // Skill base 30 energy + Sequential Passage trace +5. Trace text:
  // "When using Skill, additionally regenerates 5 Energy."
  energyOnAction: {
    [AbilityKind.SKILL]: 35,
  },
  // Coloratura Cadenza trace: "When the battle begins, action advances this character by 25%."
  battleStartAvAdvance: 0.25,
  // Technique "Overture of Inebriation" (dimension-type) — listener gives +5 energy on
  // WaveStart in reference. Subject to ERR scaling like in-combat gains.
  battleStartBonusEnergy: 5,
  grantsAdvanceOnAction: {
    [AbilityKind.ULT]: { target: 'allAllies', avPercent: 100 },
  },
  grantsBuffsOnAction: {
    [AbilityKind.ULT]: [
      {
        target: 'self',
        buff: {
          id: 'Robin.concerto',
          remaining: CONCERTO_DURATION_AV,
          mode: 'av',
        },
      },
    ],
  },
  clockPausedByBuff: { buffId: 'Robin.concerto', actOnResume: true },
  // Talent "Tonal Resonance": "after allies attack enemy targets, Robin additionally
  // regenerates 2 Energy for herself" (E0 value; E2+ raises to 3 — not modeled, no
  // eidolon-aware behavior in characterData layer). Reference impl fires on every
  // non-enemy AttackDMGEnd, which includes Robin's own attacks too.
  energyPassiveOnAnyAttack: {
    [AbilityKind.BASIC]: 2,
    [AbilityKind.SKILL]: 2,
    [AbilityKind.ULT]: 2,
    [AbilityKind.FUA]: 2,
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
