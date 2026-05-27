import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Lingsha is a sustain with a FUA mechanic: she summons her Fuyuan, who triggers a FUA
// whenever an ally attacks an enemy that has a Lingsha-applied Besotted debuff. v1 doesn't
// track per-debuff target conditions, so we approximate ~1 FUA per 4 ally attacks.
//
// Per-resolve precompute buff propagation (per gamedata SkillID 122203):
//   - "Dripping Mistscape" Ult: "Inflicts 'Befog' on all enemies. While in 'Befog,' targets
//     receive #4[i]% increased Break DMG, lasting for #5[i] turn(s)." ParamList[4]=2 turns.
//     Multi-enemy debuff modeled as a single kind:'enemy' ActiveBuff (v1 doesn't
//     distinguish per-enemy state), turnsOnEnemy. Drives `befogState` teammate
//     conditional which gates the team's Break vulnerability buff.
//
// E1 DEF shred is gated by enemy-weakness-broken (not by a Lingsha buff), so it's not a
// windowed Lingsha-source effect. E2 BE / E6 RES PEN are passive eidolon traces.
export const LingshaData: CharacterData = {
  fuaTriggers: [
    {
      id: 'lingsha.fuyuan',
      on: 'teammateAttack',
      everyN: 4,
      selector: { abilityKind: AbilityKind.FUA },
    },
  ],
  grantsBuffsOnAction: {
    [AbilityKind.ULT]: [
      {
        target: 'enemy',
        buff: {
          id: 'Lingsha.befog',
          remaining: 2,
          mode: 'turnsOnEnemy',
          conditionalKey: 'befogState',
        },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',  // Befogging Brew — AoE attack + ally heal side effect
    [AbilityKind.ULT]: 'allEnemies',    // Dust to Dust — AoE attack + team heal
  },
}
