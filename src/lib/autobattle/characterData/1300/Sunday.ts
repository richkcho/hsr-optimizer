import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sunday's skill advances a single ally 100% AV and applies a DMG% buff. His ult grants
// energy to a single ally — in game, max(targetMaxEnergy * 0.20, 40); the flat 40 is the
// E0 floor that holds for any target with maxEnergy ≤ 200 (the common case). v1 routes
// both via the 'singleAlly' resolver (= mainDpsSlot).
//
// Per-resolve precompute buff propagation (per gamedata):
//   - Benison (SkillID 131302): "increases their DMG dealt [...] lasting for #3[i] turn(s)"
//     ParamList[2]=2, no caster-turn-tick clause → BUFF on single ally, turnsOnTarget 2.
//   - Beatified (SkillID 131303): "turns the target [...] into 'The Beatified.' [...] At the
//     start of Sunday's every turn, the duration [...] decreases by 1 turn, lasting for a
//     total of #3[i] turn(s)." ParamList[2]=3, caster-turn-tick → FIELD/single-ally,
//     turnsOnSource 3. Modeled with target:'singleAlly' so it binds to mainDpsSlot; the
//     buff propagates through Sunday's `beatified` teammate conditional when DPS resolves.
//   - Sunday's talentCrBuffStacks slider (0-3, max at E6) is per-ally stack count and isn't
//     modeled as a windowed BuffGrant; the form's slider value supplies a steady-state
//     stack count to teammate hooks via Sunday's `precomputeMutualEffectsContainer`.
export const SundayData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.SKILL]: { target: 'singleAlly', avPercent: 100 },
  },
  grantsEnergyOnAction: {
    [AbilityKind.ULT]: { target: 'singleAlly', amount: 40 },
  },
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'singleAlly',
        buff: {
          id: 'Sunday.skillDmgBuff',
          remaining: 2,
          mode: 'turnsOnTarget',
          conditionalKey: 'skillDmgBuff',
        },
      },
    ],
    [AbilityKind.ULT]: [
      {
        // Sunday's Beatified is described in-game with the caster-turn-tick clause
        // ("at the start of Sunday's every turn, the duration of 'The Beatified'
        // decreases by 1 turn") which makes it a FIELD by the buff-vs-field heuristic.
        // Applied to a single ally (mainDpsSlot), so target:'singleAlly' binds the buff
        // to that slot and propagates `beatified` only when that ally resolves.
        target: 'singleAlly',
        buff: {
          id: 'Sunday.beatified',
          remaining: 3,
          mode: 'turnsOnSource',
          conditionalKey: 'beatified',
        },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'singleAlly',  // Benison of Paper and Rites
    [AbilityKind.ULT]: 'singleAlly',    // Ode to Caress and Cicatrix — beatified on one ally
  },
}
