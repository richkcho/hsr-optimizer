import type { CharacterData } from 'lib/autobattle/types'
import { AbilityKind } from 'lib/optimization/rotation/turnAbilityConfig'

// Aventurine's Talent FUA ("Shot Loaded Right") is driven by a stack pool — "Blind Bet" — not
// by a count-based teammate-attack trigger. Stacks accumulate from three sources and the FUA
// fires synchronously when stacks reach 7. See the FuaStackPool docstring + the implementation
// plan in `.tmp/notes/cross-check-gap-investigation.md` (section "Aventurine FUA stack-pool —
// implementation plan") for the design rationale and reference citations.
export const AventurineData: CharacterData = {
  // FUA energy: 7 bounces × 1 energy/bounce per the talent's energyRegen=1 × bounceCount=7.
  // Overrides the default FUA=5.
  energyOnAction: {
    [AbilityKind.FUA]: 7,
  },
  fuaStackPool: {
    name: 'aventurine.blindBets',
    threshold: 7,
    consumeOnFire: 7,
    cap: 10,
    firesAbility: AbilityKind.FUA,
    gain: {
      // Bingo! trace: +1 stack when any ally fires a FUA, capped at 3 per Aventurine turn
      // (reset on his primary processActorTurn). Source filter restricts to FUA-kind only.
      onAllyAttack: {
        amount: 1,
        sourceKindFilter: [AbilityKind.FUA],
        maxPerOwnerTurn: 3,
      },
      // Roulette Shark ULT: random 1-7 stacks, modelled as the averaged +4.
      onOwnUlt: 4,
      // v1 approximation of "ally with Fortified Wager hit by enemy → +1 stack" (and +2 if
      // Aventurine himself is hit). The real mechanic needs per-ally shield uptime + enemy
      // attack routing, neither of which the sim does in v1 — collapsed to a flat drip.
      onEnemyTurnApprox: 1.3,
    },
  },
  // Shield-maintenance buff (Aventurine.shield). Both skill (Cornerstone Deluxe — single
  // ally shield) and ult (Roulette Shark — team shield) refresh it. Used purely as a
  // tendency signal: when active, Aventurine basics to preserve SP; when down, he skills.
  // turnsOnSource:3 approximates the 3-turn shield duration measured on Aventurine's clock.
  grantsBuffsOnAction: {
    [AbilityKind.SKILL]: [
      {
        target: 'self',
        buff: { id: 'Aventurine.shield', remaining: 3, mode: 'turnsOnSource' },
      },
    ],
    [AbilityKind.ULT]: [
      {
        target: 'self',
        buff: { id: 'Aventurine.shield', remaining: 3, mode: 'turnsOnSource' },
      },
    ],
  },
  abilityTargetHint: {
    [AbilityKind.SKILL]: 'allEnemies',  // AoE Imaginary attack (Imaginary Numinosity)
    [AbilityKind.ULT]: 'allEnemies',
  },
}
