import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Ruan Mei's whole kit is buffs that ride the standard optimizer conditional layer:
//   Skill "Overtone" — 3-turn team-wide DMG % + Weakness Break Efficiency
//   Ult — AoE damage + creates a field on enemies (DMG vulnerability + RES PEN) for 3 turns,
//          and arms Thanataplum Rebloom (Ice break damage on weakness recovery while the
//          field is active)
//   Talent — team SPD %, always on
// All three propagate via teammateContent through precomputeMutualEffectsContainer
// at context build time, so we don't add them as stat-bearing buffs here. She has
// no team energy / AV-advance gifts.
//
// Two zero-stat self-marker buffs sit alongside the damage pipeline: RuanMei.overtone
// (gates her tendency to skill only when expiring) and RuanMei.ultField (gates the
// Thanataplum Rebloom break-damage proc). Both carry no statOverride or conditionalKey
// so they're invisible to the damage pipeline — purely sim-side hasActiveBuff gates.
//
// Break-zone passive (Thanataplum Rebloom) damage attributes to her own primary actor —
// hits appear with source=Ruan Mei in reference logs.
export const RuanMeiData: CharacterData = {
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'self',       // Overtone — self-buff that propagates team-wide
    [AbilityKind.ULT]: 'allEnemies',   // AoE damage + field on all enemies
  },
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        // Overtone — FIELD/self-state per gamedata SkillID 130302 ("Ruan Mei gains Overtone,
        // lasting for #3[i] turn(s). This duration decreases by 1 at the start of Ruan Mei's
        // every turn." ParamList[2]=3). target:'team' so the conditional flag propagates to
        // every resolver via buffAppliesToActor.
        target: 'team',
        buff: {
          id: 'RuanMei.overtone',
          remaining: 3,
          mode: 'turnsOnSource',
          conditionalKey: 'skillOvertoneBuff',
        },
      },
    ],
    [AbilityKind.ULT]: [
      {
        // Zone — FIELD deployed by Ult per gamedata SkillID 130303 ("Ruan Mei deploys a Zone
        // that lasts for #2[i] turns. The Zone's duration decreases by 1 at the start of her
        // turn." ParamList[1]=2). Drives `ultFieldActive` teammate conditional which gates
        // RES PEN (and E1 DEF PEN) team-wide. Also serves as the sim-side gate for
        // Thanataplum Rebloom break-damage proc (onEnemyWeaknessRecovery requiresActiveBuff).
        // Note: previously coded as remaining:3 — gamedata-correct is 2.
        target: 'team',
        buff: {
          id: 'RuanMei.ultField',
          remaining: 2,
          mode: 'turnsOnSource',
          conditionalKey: 'ultFieldActive',
        },
      },
      {
        // Past Self in the Mirror (Ruan Mei's LC) — team DMG buff on wearer's ult, riding
        // the Zone window (effective uptime ≈ Zone). LC conditional `postUltDmgBuff`. Modeled
        // as a field on the source so the flag reaches every ally.
        target: 'team',
        buff: {
          id: 'RuanMei.pastSelfInTheMirror',
          remaining: 2,
          mode: 'turnsOnSource',
          conditionalKey: 'postUltDmgBuff',
          conditionalKind: 'lc',
        },
      },
    ],
  },
  onEnemyWeaknessRecovery: {
    requiresActiveBuff: 'RuanMei.ultField',
    firedAs: AbilityKind.BREAK,
  },
}
