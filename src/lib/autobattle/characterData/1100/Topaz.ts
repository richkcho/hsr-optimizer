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
    actorKind: 'summon',  // Numby is a pet/summon (no HP, no energy), not a memosprite
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
  // Proof of Debt is sticky per gamedata SkillID 111202: "Proof of Debt only takes effect
  // on the most recent target it is applied to. If there are no enemies inflicted with
  // Proof of Debt on the field when an ally's turn starts or when an ally takes action,
  // Topaz will inflict a random enemy with Proof of Debt." No explicit duration — the
  // debuff persists indefinitely once applied, transferring to a random enemy if the
  // marked one dies. mode:'sticky' models this by skipping all tick functions.
  //
  // While active, FUAs against the marked enemy gain +50% Vulnerability (Topaz.ts:237-241
  // in conditionals). Modeled as a team-wide buff via target:'enemy' so any teammate's
  // FUA picks up the multiplier through her `enemyProofOfDebtDebuff` teammate conditional.
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'enemy',
        buff: {
          id: 'Topaz.proofOfDebt',
          remaining: 1,
          mode: 'sticky',
          conditionalKey: 'enemyProofOfDebtDebuff',
        },
      },
    ],
    [AbilityKind.ULT]: [
      {
        // Ult re-applies on the primary target ("Proof of Debt re-applied" per the kit
        // text). Re-application is a no-op for the sticky buff but kept as a hook for
        // tendency signaling.
        target: 'enemy',
        buff: {
          id: 'Topaz.proofOfDebt',
          remaining: 1,
          mode: 'sticky',
          conditionalKey: 'enemyProofOfDebtDebuff',
        },
      },
    ],
  },
  // Technique deploys her Skill Zone on battle entry, which pre-applies Proof of Debt to a
  // marked enemy. Modeled as a wave-start Proof of Debt mark only (v1 scope). The technique's
  // 60% Super Break conversion is out of scope — surface as follow-up if golden BREAK drift
  // doesn't close. Dedup with the SKILL grant above is a no-op (sticky, same id/source/target).
  grantsBuffsOnBattleStart: [
    {
      target: 'enemy',
      buff: {
        id: 'Topaz.proofOfDebt',
        remaining: 1,
        mode: 'sticky',
        conditionalKey: 'enemyProofOfDebtDebuff',
      },
    },
  ],
}
