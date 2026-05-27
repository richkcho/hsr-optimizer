import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Sparkle's skill advances + buffs a single ally and is net SP-positive (she gives the team
// +1 SP on skill via her talent). We don't directly model the SP refund here — payAbilitySp
// reads action.hits[].skillPointsUsed which already encodes Sparkle's -1 cost.
//
// Per-resolve precompute buff propagation (per gamedata):
//   - Dreamdiver (SkillID 130602): "Increases the CRIT DMG of a single target ally [...]
//     lasting for #3[i] turn(s)". ParamList[2]=1, no caster-turn-tick clause → BUFF on the
//     single target ally, turnsOnTarget. target:'singleAlly' so it binds to mainDpsSlot.
//   - Cipher (SkillID 130603): "grants all allies Cipher [...] lasting for #4[i] turns".
//     ParamList[3]=2, no caster-turn-tick clause → BUFF (per-ally) over 2 turns,
//     turnsOnTarget. target:'eachAlly' fans out one ActiveBuff per ally including Sparkle.
//
// `talentStacks` (slider 0-3) accumulates from ally SP-consumption — modeled implicitly via
// the form default rather than as a windowed buff. `quantumAlliesAtkBuff` is a passive trace.
export const SparkleData: CharacterData = {
  grantsAdvanceOnAction: {
    [AbilityKind.SKILL]: { target: 'singleAlly', avPercent: 50 },
  },
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'singleAlly',
        buff: {
          id: 'Sparkle.dreamdiver',
          remaining: 1,
          mode: 'turnsOnTarget',
          conditionalKey: 'skillCdBuff',
        },
      },
    ],
    [AbilityKind.ULT]: [
      {
        target: 'eachAlly',
        buff: {
          id: 'Sparkle.cipher',
          remaining: 2,
          mode: 'turnsOnTarget',
          conditionalKey: 'cipherBuff',
        },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'singleAlly',  // Dreamdiver — single ally advance + buff
    [AbilityKind.ULT]: 'allAllies',     // Cipher — team-wide ATK buff
  },
}
