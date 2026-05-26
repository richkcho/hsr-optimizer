import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Aventurine regens energy whenever an ally or enemy attacks. v1 doesn't simulate
// being-hit, so we approximate steady-state energy gain at ~6 per enemy turn (≈ 30 energy
// over 5 enemy turns, matching mid-game observation).
// His FUA fires on ally crit but we model it as a teammate-attack trigger for simplicity —
// the trigger system has no crit notion in v1.
export const AventurineData: CharacterData = {
  // FUA energy: reference attackWrapper iterates 7 bounces, each granting bounceData.energy=1
  // (per the talent's energyRegen=1 × bounceCount=7). Override the default FUA=5.
  energyOnAction: {
    [AbilityKind.FUA]: 7,
  },
  fuaTriggers: [
    {
      id: 'aventurine.allyCrit',
      on: 'teammateAttack',
      everyN: 7,  // ~1 FUA per 7 ally attacks approximates the crit-driven trigger rate
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
  v1Approx: {
    energyFromEnemyAttacks: { avgPerEnemyTurn: 6 },
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',  // AoE Imaginary attack (Imaginary Numinosity)
    [AbilityKind.ULT]: 'allEnemies',
  },
}
